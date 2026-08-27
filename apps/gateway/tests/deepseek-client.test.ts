import { describe, expect, it, vi } from 'vitest';

import {
  DeepSeekClientError,
  HttpDeepSeekClient,
} from '../src/clients/deepseek-client.js';

const config = {
  baseUrl: 'https://api.deepseek.com',
  apiKey: 'test-key',
  model: 'deepseek-v4-flash',
  timeoutMs: 100,
};

describe('HttpDeepSeekClient', () => {
  it('sends a non-streaming OpenAI-compatible request and returns the answer', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ choices: [{ message: { content: '通用建议' } }] }),
          { status: 200 },
        ),
      );
    const client = new HttpDeepSeekClient(config, fetchFn);

    await expect(
      client.answer({ question: '锅具能烤箱吗？' }),
    ).resolves.toMatchObject({
      answer: '通用建议',
    });
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.deepseek.com/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('does not expose an HTTP response body when the API rejects a request', async () => {
    const client = new HttpDeepSeekClient(
      config,
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('secret body', { status: 401 })),
    );

    await expect(client.answer({ question: 'test' })).rejects.toEqual(
      expect.objectContaining<Partial<DeepSeekClientError>>({
        code: 'HTTP_ERROR',
      }),
    );
  });
});
