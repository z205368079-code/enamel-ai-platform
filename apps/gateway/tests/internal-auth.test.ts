import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { HumanHandoffService } from '../src/services/human-handoff-service.js';
import { ChatwootWebhookService } from '../src/services/chatwoot-webhook-service.js';
import { KnowledgeAnswerService } from '../src/services/knowledge-answer-service.js';
import {
  InMemoryAiRunRepository,
  InMemoryConversationRepository,
  InMemoryWebhookMessageRepository,
  RecordingChatwootClient,
  RecordingLogger,
  RecordingMaxKBClient,
} from './test-doubles.js';

function context(token?: string) {
  const repository = new InMemoryConversationRepository();
  const client = new RecordingChatwootClient();
  const logger = new RecordingLogger();
  const handoff = new HumanHandoffService(repository, client, logger, [], 2);
  return {
    repository,
    logger,
    app: createApp({
      internalApiToken: token,
      handoffService: handoff,
      logger,
      webhookService: new ChatwootWebhookService(
        repository,
        new InMemoryWebhookMessageRepository(),
        new KnowledgeAnswerService(
          new RecordingMaxKBClient(),
          new InMemoryAiRunRepository(),
          logger,
        ),
        handoff,
        client,
        logger,
      ),
    }),
  };
}

describe('internal API authentication', () => {
  it.each([undefined, 'Basic abc', 'Bearer ', 'Bearer wrong'])(
    'rejects invalid authorization',
    async (authorization) => {
      const { app } = context('correct-token');
      const response = await request(app)
        .post('/internal/conversations/1/resume-ai')
        .set(
          authorization === undefined ? {} : { Authorization: authorization },
        );
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'UNAUTHORIZED' });
    },
  );
  it('rejects when token is not configured and allows correct token without leaking it', async () => {
    const denied = await request(context().app)
      .post('/internal/conversations/1/resume-ai')
      .set('Authorization', 'Bearer secret');
    expect(denied.status).toBe(401);
    const { app, logger } = context('correct-token');
    const allowed = await request(app)
      .post('/internal/conversations/1/resume-ai')
      .set('Authorization', 'Bearer correct-token');
    expect(allowed.status).toBe(200);
    expect(JSON.stringify(logger.errorEntries)).not.toContain('correct-token');
  });
});
