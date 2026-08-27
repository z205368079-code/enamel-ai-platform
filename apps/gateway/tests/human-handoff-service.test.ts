import { describe, expect, it } from 'vitest';

import { CONVERSATION_MODE } from '../src/domain/conversation.js';
import { HumanHandoffService } from '../src/services/human-handoff-service.js';
import type { KnowledgeAnswerResult } from '../src/services/knowledge-answer-service.js';
import {
  InMemoryConversationRepository,
  RecordingChatwootClient,
  RecordingLogger,
} from './test-doubles.js';

function setup() {
  const conversations = new InMemoryConversationRepository();
  const chatwoot = new RecordingChatwootClient();
  const logger = new RecordingLogger();
  return {
    conversations,
    chatwoot,
    service: new HumanHandoffService(
      conversations,
      chatwoot,
      logger,
      ['赔偿', '投诉', '法律'],
      2,
    ),
  };
}

describe('HumanHandoffService', () => {
  it('uses AI by default and detects explicit customer handoff requests', async () => {
    const { conversations, service } = setup();
    await conversations.upsert({
      chatwootConversationId: '1',
      contactId: 'c',
      mode: CONVERSATION_MODE.AI,
    });
    expect(
      service.routeBeforeAi(
        await conversations.getState('1'),
        '我要找人工客服处理',
      ),
    ).toBe('HANDOFF_USER_REQUEST');
  });

  it('routes high-risk content before calling AI', async () => {
    const { conversations, service } = setup();
    await conversations.upsert({
      chatwootConversationId: '2',
      contactId: 'c',
      mode: CONVERSATION_MODE.AI,
    });
    expect(
      service.routeBeforeAi(await conversations.getState('2'), '你们怎么赔偿'),
    ).toBe('HANDOFF_HIGH_RISK');
  });

  it('hands off NO_ANSWER and only marks Chatwoot after local state succeeds', async () => {
    const { conversations, chatwoot, service } = setup();
    await conversations.upsert({
      chatwootConversationId: '3',
      contactId: 'c',
      mode: CONVERSATION_MODE.AI,
    });
    expect(
      await service.routeAfterAi('3', {
        status: 'NO_ANSWER',
        answer: '',
        provider: 'maxkb',
        latencyMs: 1,
        errorCode: 'NO_ANSWER',
      }),
    ).toBe('HANDOFF_NO_ANSWER');
    expect(await service.handoff('3', 'HANDOFF_NO_ANSWER')).toBe(true);
    expect((await conversations.getState('3')).mode).toBe('HUMAN');
    expect(chatwoot.markedConversations).toEqual(['3']);
  });

  it('counts consecutive failures, resets on success, and resumes AI', async () => {
    const { conversations, service } = setup();
    await conversations.upsert({
      chatwootConversationId: '4',
      contactId: 'c',
      mode: CONVERSATION_MODE.AI,
    });
    const failure: KnowledgeAnswerResult = {
      status: 'NETWORK_ERROR',
      answer: '',
      provider: 'maxkb' as const,
      latencyMs: 1,
      errorCode: 'NETWORK_ERROR',
    };
    expect(await service.routeAfterAi('4', failure)).toBe('CONTINUE_AI');
    expect(
      await service.routeAfterAi('4', {
        ...failure,
        status: 'SUCCESS' as const,
        answer: 'ok',
        errorCode: null,
      }),
    ).toBe('CONTINUE_AI');
    expect((await conversations.getState('4')).consecutiveAiFailures).toBe(0);
    expect(await service.routeAfterAi('4', failure)).toBe('CONTINUE_AI');
    expect(await service.routeAfterAi('4', failure)).toBe('HANDOFF_AI_FAILURE');
    await service.handoff('4', 'HANDOFF_AI_FAILURE');
    expect(await service.resumeAi('4')).toBe(true);
    expect(await conversations.getState('4')).toEqual({
      mode: 'AI',
      consecutiveAiFailures: 0,
    });
  });
});
