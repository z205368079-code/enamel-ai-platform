import { describe, expect, it } from 'vitest';

import { HttpChatwootClient } from '../src/clients/chatwoot-client.js';

const config = {
  baseUrl: 'https://chatwoot.example.test',
  accountId: '10',
  apiToken: 'test-token-not-a-secret',
  timeoutMs: 20,
};

describe('HttpChatwootClient', () => {
  it('sends an outgoing public conversation message', async () => {
    let receivedUrl = '';
    let receivedInit: RequestInit | undefined;
    const client = new HttpChatwootClient(config, async (url, init) => {
      receivedUrl = String(url);
      receivedInit = init;
      return new Response('{}', { status: 200 });
    });

    const result = await client.sendConversationMessage({
      conversationId: '88',
      content: 'Mock reply',
    });

    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(receivedUrl).toBe(
      'https://chatwoot.example.test/api/v1/accounts/10/conversations/88/messages',
    );
    expect(receivedInit?.method).toBe('POST');
    expect(receivedInit?.headers).toMatchObject({
      api_access_token: 'test-token-not-a-secret',
    });
    expect(JSON.parse(String(receivedInit?.body))).toEqual({
      content: 'Mock reply',
      message_type: 'outgoing',
      private: false,
    });
  });

  it('reports an API timeout', async () => {
    const client = new HttpChatwootClient(config, async (_url, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    await expect(
      client.sendConversationMessage({
        conversationId: '88',
        content: 'Mock reply',
      }),
    ).rejects.toMatchObject({
      code: 'CHATWOOT_TIMEOUT',
    });
  });

  it('reports a non-success API response', async () => {
    const client = new HttpChatwootClient(
      config,
      async () => new Response('{}', { status: 502 }),
    );

    await expect(
      client.sendConversationMessage({
        conversationId: '88',
        content: 'Mock reply',
      }),
    ).rejects.toMatchObject({
      code: 'CHATWOOT_HTTP_ERROR',
    });
  });
});
