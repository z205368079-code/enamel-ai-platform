import { describe, expect, it, vi } from 'vitest';

import {
  HttpMaxKBClient,
  MaxKBClientError,
} from '../src/clients/maxkb-client.js';

const config = {
  baseUrl: 'https://maxkb.example.test',
  appId: 'app-123',
  apiKey: 'application-test-key',
  timeoutMs: 20,
  maxRetries: 0,
  retryDelayMs: 0,
};

function clientFor(fetchFn: typeof fetch) {
  return new HttpMaxKBClient(config, fetchFn, async () => undefined);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('HttpMaxKBClient', () => {
  it('sends a non-streaming application API request and reads the answer', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        choices: [
          {
            chat_id: '59c4caa0-6d78-4cbd-a64f-58ce9e8bd5c8',
            message: { role: 'assistant', content: '可以，注意锅柄耐温范围。' },
          },
        ],
      }),
    );

    const result = await clientFor(fetchFn).answer({
      question: '能进烤箱吗？',
    });

    expect(result.answer).toBe('可以，注意锅柄耐温范围。');
    expect(result.maxkbChatId).toBe('59c4caa0-6d78-4cbd-a64f-58ce9e8bd5c8');
    expect(fetchFn).toHaveBeenCalledWith(
      'https://maxkb.example.test/chat/api/app-123/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer application-test-key',
        }),
        body: JSON.stringify({
          stream: false,
          messages: [{ role: 'user', content: '能进烤箱吗？' }],
        }),
      }),
    );
  });

  it('passes only a previously returned MaxKB chat id back to MaxKB', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ choices: [{ message: { content: '后续回答' } }] }),
      );

    await clientFor(fetchFn).answer({
      question: '继续说明',
      maxkbChatId: 'actual-maxkb-chat-id',
    });

    expect(fetchFn.mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify({
        stream: false,
        messages: [{ role: 'user', content: '继续说明' }],
        chat_id: 'actual-maxkb-chat-id',
      }),
    });
  });

  it('classifies a timeout', async () => {
    const fetchFn = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );

    await expect(
      clientFor(fetchFn).answer({ question: '测试' }),
    ).rejects.toMatchObject({
      code: 'TIMEOUT',
    } satisfies Partial<MaxKBClientError>);
  });

  it('classifies a network error', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('offline'));
    await expect(
      clientFor(fetchFn).answer({ question: '测试' }),
    ).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
  });

  it.each([400, 500])(
    'classifies HTTP %i as an upstream HTTP error',
    async (status) => {
      const fetchFn = vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse({}, status));
      await expect(
        clientFor(fetchFn).answer({ question: '测试' }),
      ).rejects.toMatchObject({
        code: 'HTTP_ERROR',
      });
    },
  );

  it('retries a transient 5xx response only a finite number of times', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({}, 503));
    const client = new HttpMaxKBClient(
      { ...config, maxRetries: 1 },
      fetchFn,
      async () => undefined,
    );

    await expect(client.answer({ question: '测试' })).rejects.toMatchObject({
      code: 'HTTP_ERROR',
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it.each([400, 401, 403, 404])(
    'does not retry non-retryable HTTP %i responses',
    async (status) => {
      const fetchFn = vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse({}, status));
      const client = new HttpMaxKBClient(
        { ...config, maxRetries: 1 },
        fetchFn,
        async () => undefined,
      );

      await expect(client.answer({ question: '测试' })).rejects.toMatchObject({
        code: 'HTTP_ERROR',
      });
      expect(fetchFn).toHaveBeenCalledTimes(1);
    },
  );

  it('retries a timeout only once by default policy', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException('aborted', 'AbortError'));
    const client = new HttpMaxKBClient(
      { ...config, maxRetries: 1 },
      fetchFn,
      async () => undefined,
    );

    await expect(client.answer({ question: '测试' })).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('classifies an application-level error response', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ code: 500, message: 'upstream failed' }),
      );
    await expect(
      clientFor(fetchFn).answer({ question: '测试' }),
    ).rejects.toMatchObject({
      code: 'HTTP_ERROR',
    });
  });

  it('rejects a malformed response', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ unexpected: true }));
    await expect(
      clientFor(fetchFn).answer({ question: '测试' }),
    ).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('returns no answer for an empty successful answer', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ choices: [{ message: { content: '  ' } }] }),
      );
    await expect(
      clientFor(fetchFn).answer({ question: '测试' }),
    ).resolves.toMatchObject({
      answer: null,
    });
  });
});
