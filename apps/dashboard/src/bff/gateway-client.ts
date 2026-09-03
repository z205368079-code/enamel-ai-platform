export class GatewayInvalidResponseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'GatewayInvalidResponseError';
  }
}

export interface GatewayHealthResult {
  ok: boolean;
  service?: string;
  status: 'ok' | 'unreachable' | 'error';
  timestamp?: string;
  latencyMs: number;
  message?: string;
}

export interface DashboardStats {
  totalConversations: number;
  aiModeConversations: number;
  humanModeConversations: number;
  totalAiRuns: number;
  successfulAiRuns: number;
  failedAiRuns: number;
  humanHandoffs: number;
  knowledgeGaps: number;
  averageAiLatencyMs: number | null;
}

export interface SanitizedKnowledgeGap {
  id: string | number;
  conversationId: string | number;
  messageId: string;
  reason: string;
  status: string; // 'OPEN' | 'RESOLVED' | string
  createdAt: string;
}

export interface KnowledgeGapsResult {
  items: SanitizedKnowledgeGap[];
  limit: number;
  offset: number;
}

function parseNonNegativeInt(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new GatewayInvalidResponseError(
      `Gateway stats response missing or invalid field "${fieldName}": expected non-negative integer, received ${
        typeof value === 'number' ? value : typeof value
      }`,
    );
  }
  return value;
}

function parseNullableNonNegativeInt(
  value: unknown,
  fieldName: string,
): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new GatewayInvalidResponseError(
      `Gateway stats response invalid field "${fieldName}": expected null or non-negative integer, received ${
        typeof value === 'number' ? value : typeof value
      }`,
    );
  }
  return value;
}

export class GatewayClient {
  constructor(
    private readonly gatewayBaseUrl: string,
    private readonly internalApiToken?: string | undefined,
    private readonly timeoutMs: number = 4000,
  ) {}

  async checkHealth(): Promise<GatewayHealthResult> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const res = await fetch(`${this.gatewayBaseUrl}/health`, {
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      const latencyMs = Date.now() - start;

      if (!res.ok) {
        return {
          ok: false,
          status: 'error',
          latencyMs,
          message: `Gateway returned status ${res.status}`,
        };
      }

      const body = (await res.json()) as {
        status?: string;
        service?: string;
        timestamp?: string;
      };

      return {
        ok: true,
        status: 'ok',
        service: body.service ?? 'enamel-ai-gateway',
        timestamp: body.timestamp ?? new Date().toISOString(),
        latencyMs,
      };
    } catch (err) {
      return {
        ok: false,
        status: 'unreachable',
        latencyMs: Date.now() - start,
        message:
          err instanceof Error
            ? err.message
            : 'Gateway connection failed or timed out',
      };
    }
  }

  async getStats(): Promise<DashboardStats> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (this.internalApiToken) {
      headers['Authorization'] = `Bearer ${this.internalApiToken}`;
    }

    try {
      const res = await fetch(`${this.gatewayBaseUrl}/internal/stats`, {
        headers,
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (res.status === 401 || res.status === 403) {
        throw new Error(
          'Gateway internal authentication failed. Check INTERNAL_API_TOKEN configuration on BFF.',
        );
      }

      if (!res.ok) {
        throw new Error(`Gateway returned HTTP status ${res.status}`);
      }

      const data = (await res.json()) as Record<string, unknown>;
      if (!data || typeof data !== 'object') {
        throw new GatewayInvalidResponseError(
          'Gateway returned non-object stats payload',
        );
      }

      return {
        totalConversations: parseNonNegativeInt(
          data['totalConversations'],
          'totalConversations',
        ),
        aiModeConversations: parseNonNegativeInt(
          data['aiModeConversations'],
          'aiModeConversations',
        ),
        humanModeConversations: parseNonNegativeInt(
          data['humanModeConversations'],
          'humanModeConversations',
        ),
        totalAiRuns: parseNonNegativeInt(data['totalAiRuns'], 'totalAiRuns'),
        successfulAiRuns: parseNonNegativeInt(
          data['successfulAiRuns'],
          'successfulAiRuns',
        ),
        failedAiRuns: parseNonNegativeInt(data['failedAiRuns'], 'failedAiRuns'),
        humanHandoffs: parseNonNegativeInt(
          data['humanHandoffs'],
          'humanHandoffs',
        ),
        knowledgeGaps: parseNonNegativeInt(
          data['knowledgeGaps'],
          'knowledgeGaps',
        ),
        averageAiLatencyMs: parseNullableNonNegativeInt(
          data['averageAiLatencyMs'],
          'averageAiLatencyMs',
        ),
      };
    } catch (err) {
      if (err instanceof GatewayInvalidResponseError || err instanceof Error) {
        throw err;
      }
      throw new Error('Unknown error fetching stats from Gateway', {
        cause: err,
      });
    }
  }

  async getKnowledgeGaps(
    limit: number,
    offset: number,
  ): Promise<KnowledgeGapsResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (this.internalApiToken) {
      headers['Authorization'] = `Bearer ${this.internalApiToken}`;
    }

    const clampedLimit = Math.min(Math.max(1, limit), 100);
    const clampedOffset = Math.max(0, offset);

    try {
      const url = `${this.gatewayBaseUrl}/internal/knowledge-gaps?limit=${clampedLimit}&offset=${clampedOffset}`;
      const res = await fetch(url, {
        headers,
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (res.status === 401 || res.status === 403) {
        throw new Error(
          'Gateway internal authentication failed. Check INTERNAL_API_TOKEN configuration on BFF.',
        );
      }

      if (!res.ok) {
        throw new Error(`Gateway returned HTTP status ${res.status}`);
      }

      const data = (await res.json()) as {
        items?: Array<Record<string, unknown>>;
        limit?: number;
        offset?: number;
      };

      const rawItems = Array.isArray(data.items) ? data.items : [];
      const sanitizedItems: SanitizedKnowledgeGap[] = rawItems.map((item) => {
        const rawStatus = item['status'];
        const status =
          typeof rawStatus === 'string' && rawStatus.trim().length > 0
            ? rawStatus.trim()
            : 'UNKNOWN';

        return {
          id: (item['id'] as string | number) ?? '',
          conversationId:
            (item['conversationId'] as string | number) ??
            (item['conversation_id'] as string | number) ??
            '',
          messageId: String(item['messageId'] ?? item['message_id'] ?? ''),
          reason: String(item['reason'] ?? 'UNKNOWN'),
          status, // Aligned with DB contract: 'OPEN', 'RESOLVED', or preserved exact string
          createdAt: String(
            item['createdAt'] ?? item['created_at'] ?? new Date().toISOString(),
          ),
        };
      });

      return {
        items: sanitizedItems,
        limit: clampedLimit,
        offset: clampedOffset,
      };
    } catch (err) {
      if (err instanceof Error) {
        throw err;
      }
      throw new Error('Unknown error fetching knowledge gaps from Gateway', {
        cause: err,
      });
    }
  }
}
