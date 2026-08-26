import { describe, expect, it } from 'vitest';

import { MaxKBClientError } from '../src/clients/maxkb-client.js';
import { KnowledgeAnswerService } from '../src/services/knowledge-answer-service.js';
import {
  InMemoryAiRunRepository,
  RecordingLogger,
  RecordingMaxKBClient,
} from './test-doubles.js';

describe('KnowledgeAnswerService', () => {
  it('returns, persists, and logs a successful MaxKB answer without credentials', async () => {
    const runs = new InMemoryAiRunRepository();
    const logger = new RecordingLogger();
    const service = new KnowledgeAnswerService(
      new RecordingMaxKBClient({
        answer: '合成知识库答案',
        latencyMs: 17,
        maxkbChatId: 'actual-chat-id',
      }),
      runs,
      logger,
    );

    await expect(
      service.answerFor({
        chatwootConversationId: 'conversation-1',
        messageId: 'message-1',
        question: '如何养护？',
      }),
    ).resolves.toMatchObject({
      status: 'SUCCESS',
      answer: '合成知识库答案',
      provider: 'maxkb',
      maxkbChatId: 'actual-chat-id',
    });
    expect(runs.inputs).toEqual([
      expect.objectContaining({
        chatwootConversationId: 'conversation-1',
        messageId: 'message-1',
        status: 'SUCCESS',
      }),
    ]);
    expect(JSON.stringify(logger.infoEntries)).not.toContain(
      'application-test-key',
    );
  });

  it('uses the controlled fallback for a no-answer result', async () => {
    const runs = new InMemoryAiRunRepository();
    const service = new KnowledgeAnswerService(
      new RecordingMaxKBClient({ answer: null, latencyMs: 5 }),
      runs,
      new RecordingLogger(),
    );

    await expect(
      service.answerFor({
        chatwootConversationId: 'conversation-2',
        messageId: 'message-2',
        question: '未知问题',
      }),
    ).resolves.toMatchObject({
      status: 'NO_ANSWER',
      answer: '暂时无法从知识库中找到可靠答案，请稍后重试或联系人工客服。',
    });
    expect(runs.inputs[0]).toMatchObject({ answer: null, status: 'NO_ANSWER' });
  });

  it('does not crash or invent an answer when MaxKB fails', async () => {
    const runs = new InMemoryAiRunRepository();
    const service = new KnowledgeAnswerService(
      {
        answer: async () => {
          throw new MaxKBClientError('NETWORK_ERROR', 3, true, 'offline');
        },
      },
      runs,
      new RecordingLogger(),
    );

    await expect(
      service.answerFor({
        chatwootConversationId: 'conversation-3',
        messageId: 'message-3',
        question: '网络异常',
      }),
    ).resolves.toMatchObject({
      status: 'NETWORK_ERROR',
      answer: '暂时无法从知识库中找到可靠答案，请稍后重试或联系人工客服。',
    });
    expect(runs.inputs[0]).toMatchObject({
      answer: null,
      status: 'NETWORK_ERROR',
    });
  });
});
