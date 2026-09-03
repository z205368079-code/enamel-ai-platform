import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createDashboardApp } from '../src/app.js';
import { GatewayClient } from '../src/bff/gateway-client.js';

describe('BFF Stats Endpoint', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards stats from Gateway and attaches Authorization header on server side', async () => {
    let capturedHeaders: Record<string, string> = {};

    const mockFetch = vi.fn().mockImplementation((url, init) => {
      capturedHeaders = init?.headers ?? {};
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          totalConversations: 12,
          aiModeConversations: 8,
          humanModeConversations: 4,
          totalAiRuns: 25,
          successfulAiRuns: 22,
          failedAiRuns: 3,
          humanHandoffs: 4,
          knowledgeGaps: 2,
          averageAiLatencyMs: 350,
        }),
      });
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = new GatewayClient(
      'http://127.0.0.1:3000',
      'secret-internal-token-123',
    );
    const app = createDashboardApp({ gatewayClient: client });

    const res = await request(app).get('/api/stats');
    expect(res.status).toBe(200);
    expect(res.body.totalConversations).toBe(12);
    expect(res.body.aiModeConversations).toBe(8);
    expect(res.body.humanModeConversations).toBe(4);
    expect(res.body.totalAiRuns).toBe(25);
    expect(res.body.successfulAiRuns).toBe(22);
    expect(res.body.failedAiRuns).toBe(3);
    expect(res.body.humanHandoffs).toBe(4);
    expect(res.body.knowledgeGaps).toBe(2);
    expect(res.body.averageAiLatencyMs).toBe(350);

    // Verify token was sent by BFF to Gateway
    expect(capturedHeaders['Authorization']).toBe(
      'Bearer secret-internal-token-123',
    );
    // Verify token is NEVER returned in the client response
    const jsonStr = JSON.stringify(res.body);
    expect(jsonStr).not.toContain('secret-internal-token-123');
    expect(jsonStr).not.toContain('Bearer');
  });

  it('accepts null averageAiLatencyMs when no AI runs exist', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        totalConversations: 0,
        aiModeConversations: 0,
        humanModeConversations: 0,
        totalAiRuns: 0,
        successfulAiRuns: 0,
        failedAiRuns: 0,
        humanHandoffs: 0,
        knowledgeGaps: 0,
        averageAiLatencyMs: null,
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = new GatewayClient('http://127.0.0.1:3000', 'token');
    const app = createDashboardApp({ gatewayClient: client });

    const res = await request(app).get('/api/stats');
    expect(res.status).toBe(200);
    expect(res.body.averageAiLatencyMs).toBeNull();
  });

  it('returns 503 GATEWAY_INVALID_RESPONSE when stats field is missing or invalid instead of masking with 0', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        // Missing totalConversations and invalid negative count
        aiModeConversations: -5,
        humanModeConversations: 'invalid-string',
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = new GatewayClient('http://127.0.0.1:3000', 'token');
    const app = createDashboardApp({ gatewayClient: client });

    const res = await request(app).get('/api/stats');
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('GATEWAY_INVALID_RESPONSE');
    expect(res.body.message).toContain('Gateway 返回的指标数据格式异常');
    // Ensure we do NOT return a fake 200 object filled with zeros
    expect(res.body.totalConversations).toBeUndefined();
  });

  it('returns 503 error when Gateway is down', async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValue(new Error('Connection refused'));
    vi.stubGlobal('fetch', mockFetch);

    const client = new GatewayClient('http://127.0.0.1:3000', 'token');
    const app = createDashboardApp({ gatewayClient: client });

    const res = await request(app).get('/api/stats');
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('GATEWAY_UNAVAILABLE');
    expect(res.body.message).toContain('暂时无法获取数据');
  });
});
