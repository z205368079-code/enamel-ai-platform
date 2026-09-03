import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createDashboardApp } from '../src/app.js';
import { GatewayClient } from '../src/bff/gateway-client.js';

describe('BFF Health Endpoint', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns healthy status when Gateway is online', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ok',
        service: 'enamel-ai-gateway',
        timestamp: '2026-09-03T10:00:00.000Z',
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = new GatewayClient('http://127.0.0.1:3000', 'test-token');
    const app = createDashboardApp({ gatewayClient: client });

    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('enamel-ai-dashboard-bff');
    expect(res.body.gateway.ok).toBe(true);
    expect(res.body.gateway.status).toBe('ok');
    expect(res.body.gateway.service).toBe('enamel-ai-gateway');
  });

  it('returns unreachable status when Gateway connection fails', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    vi.stubGlobal('fetch', mockFetch);

    const client = new GatewayClient('http://127.0.0.1:3000', 'test-token');
    const app = createDashboardApp({ gatewayClient: client });

    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.gateway.ok).toBe(false);
    expect(res.body.gateway.status).toBe('unreachable');
  });
});
