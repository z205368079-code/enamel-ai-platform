import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { ChatwootWebhookService } from '../src/services/chatwoot-webhook-service.js';
import {
  InMemoryConversationRepository,
  RecordingChatwootClient,
  RecordingLogger,
} from './test-doubles.js';

describe('GET /health', () => {
  it('returns the gateway liveness status', async () => {
    const logger = new RecordingLogger();
    const response = await request(
      createApp({
        webhookService: new ChatwootWebhookService(
          new InMemoryConversationRepository(),
          new RecordingChatwootClient(),
          logger,
        ),
        logger,
      }),
    ).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      service: 'enamel-ai-gateway',
    });
    expect(response.body.timestamp).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(response.body.timestamp))).toBe(false);
  });
});
