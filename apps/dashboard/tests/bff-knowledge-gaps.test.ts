import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createDashboardApp } from '../src/app.js';
import { GatewayClient } from '../src/bff/gateway-client.js';

describe('BFF Knowledge Gaps Endpoint', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches, paginates, and sanitizes knowledge gaps with OPEN/RESOLVED status contract', async () => {
    let requestedUrl = '';
    let capturedHeaders: Record<string, string> = {};

    const mockFetch = vi.fn().mockImplementation((url, init) => {
      requestedUrl = String(url);
      capturedHeaders = init?.headers ?? {};
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              id: 1,
              conversationId: 'cw-1001',
              messageId: 'msg-999',
              reason: 'NO_ANSWER',
              status: 'OPEN',
              createdAt: '2026-09-03T09:30:00.000Z',
              sensitive_internal_info: 'DO_NOT_EXPOSE',
            },
            {
              id: 2,
              conversationId: 'cw-1002',
              messageId: 'msg-1000',
              reason: 'MAXKB_ERROR',
              status: 'RESOLVED',
              createdAt: '2026-09-03T09:35:00.000Z',
            },
            {
              id: 3,
              conversationId: 'cw-1003',
              messageId: 'msg-1001',
              reason: 'HIGH_RISK',
              status: 'CUSTOM_STATUS',
              createdAt: '2026-09-03T09:40:00.000Z',
            },
          ],
          limit: 10,
          offset: 0,
        }),
      });
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = new GatewayClient(
      'http://127.0.0.1:3000',
      'super-secret-token',
    );
    const app = createDashboardApp({ gatewayClient: client });

    const res = await request(app).get('/api/knowledge-gaps?limit=10&offset=0');
    expect(res.status).toBe(200);
    expect(requestedUrl).toContain('limit=10&offset=0');
    expect(capturedHeaders['Authorization']).toBe('Bearer super-secret-token');

    expect(res.body.items).toHaveLength(3);
    expect(res.body.items[0]).toEqual({
      id: 1,
      conversationId: 'cw-1001',
      messageId: 'msg-999',
      reason: 'NO_ANSWER',
      status: 'OPEN',
      createdAt: '2026-09-03T09:30:00.000Z',
    });
    expect(res.body.items[1].status).toBe('RESOLVED');
    // Preserves exact status string instead of coercing to OPEN or UNRESOLVED
    expect(res.body.items[2].status).toBe('CUSTOM_STATUS');

    // Ensure sensitive fields and tokens are stripped
    expect(res.body.items[0].sensitive_internal_info).toBeUndefined();
    const jsonStr = JSON.stringify(res.body);
    expect(jsonStr).not.toContain('super-secret-token');
  });

  it('clamps invalid or extreme limit/offset query values safely', async () => {
    let requestedUrl = '';
    const mockFetch = vi.fn().mockImplementation((url) => {
      requestedUrl = String(url);
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ items: [], limit: 100, offset: 0 }),
      });
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = new GatewayClient('http://127.0.0.1:3000', 'token');
    const app = createDashboardApp({ gatewayClient: client });

    const res = await request(app).get(
      '/api/knowledge-gaps?limit=9999&offset=-10',
    );
    expect(res.status).toBe(200);
    // Limit should be clamped to 100, offset to 0
    expect(requestedUrl).toContain('limit=100&offset=0');
  });

  it('returns 503 error when Gateway fails', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = new GatewayClient('http://127.0.0.1:3000', 'token');
    const app = createDashboardApp({ gatewayClient: client });

    const res = await request(app).get('/api/knowledge-gaps');
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('GATEWAY_UNAVAILABLE');
    expect(res.body.message).toContain('暂时无法获取数据');
  });
});
