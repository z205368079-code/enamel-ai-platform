import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { ChatwootWebhookService } from '../src/services/chatwoot-webhook-service.js';
import {
  InMemoryConversationRepository,
  RecordingChatwootClient,
  RecordingLogger,
} from './test-doubles.js';

function createTestContext() {
  const repository = new InMemoryConversationRepository();
  const client = new RecordingChatwootClient();
  const logger = new RecordingLogger();
  const app = createApp({
    webhookService: new ChatwootWebhookService(repository, client, logger),
    logger,
  });

  return { app, repository, client, logger };
}

function customerTextMessage(overrides: Record<string, unknown> = {}) {
  return {
    event: 'message_created',
    id: 101,
    message_type: 'incoming',
    content_type: 'text',
    content: '锅具可以进烤箱吗？',
    conversation: { id: 202 },
    sender: { id: 303, type: 'Contact' },
    ...overrides,
  };
}

describe('POST /webhooks/chatwoot', () => {
  it('persists a customer text conversation and sends a mock AI reply', async () => {
    const { app, repository, client, logger } = createTestContext();

    const response = await request(app)
      .post('/webhooks/chatwoot')
      .send(customerTextMessage());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'processed' });
    expect(repository.inputs).toEqual([
      { chatwootConversationId: '202', contactId: '303', mode: 'AI' },
    ]);
    expect(client.inputs).toEqual([
      {
        conversationId: '202',
        content: '[Demo AI] 已收到您的问题：锅具可以进烤箱吗？',
      },
    ]);
    expect(logger.infoEntries[0]).toMatchObject({
      eventType: 'message_created',
      conversationId: '202',
      messageId: '101',
      processingResult: 'processed',
      chatwootLatencyMs: 12,
    });
  });

  it('ignores outgoing messages so the gateway reply cannot form a webhook loop', async () => {
    const { app, repository, client } = createTestContext();

    await request(app).post('/webhooks/chatwoot').send(customerTextMessage());
    const response = await request(app)
      .post('/webhooks/chatwoot')
      .send(
        customerTextMessage({
          id: 102,
          message_type: 'outgoing',
          sender_type: 'Bot',
        }),
      );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ignored',
      reason: 'message_not_incoming',
    });
    expect(repository.inputs).toHaveLength(1);
    expect(client.inputs).toHaveLength(1);
  });

  it.each([
    ['bot', { sender_type: 'Bot' }],
    ['system', { sender_type: 'System' }],
  ])('ignores %s messages', async (_label, overrides) => {
    const { app, repository, client } = createTestContext();

    const response = await request(app)
      .post('/webhooks/chatwoot')
      .send(customerTextMessage(overrides));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ignored',
      reason: 'sender_not_customer',
    });
    expect(repository.inputs).toHaveLength(0);
    expect(client.inputs).toHaveLength(0);
  });

  it('acknowledges a non-target event without calling downstream services', async () => {
    const { app, repository, client } = createTestContext();

    const response = await request(app)
      .post('/webhooks/chatwoot')
      .send(customerTextMessage({ event: 'conversation_updated' }));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ignored',
      reason: 'event_not_target',
    });
    expect(repository.inputs).toHaveLength(0);
    expect(client.inputs).toHaveLength(0);
  });

  it('returns 400 for a malformed target payload', async () => {
    const { app, repository, client } = createTestContext();

    const response = await request(app).post('/webhooks/chatwoot').send({
      event: 'message_created',
      message_type: 'incoming',
      content_type: 'text',
    });

    expect(response.status).toBe(400);
    expect(response.body.status).toBe('invalid');
    expect(repository.inputs).toHaveLength(0);
    expect(client.inputs).toHaveLength(0);
  });
});
