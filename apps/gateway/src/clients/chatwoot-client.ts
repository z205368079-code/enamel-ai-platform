import type {
  ChatwootSendResult,
  SendConversationMessageInput,
} from '../domain/chatwoot.js';

export interface ChatwootClient {
  sendConversationMessage(
    input: SendConversationMessageInput,
  ): Promise<ChatwootSendResult>;
  markConversationForHumanHandoff(conversationId: string): Promise<void>;
}

export interface ChatwootClientConfig {
  baseUrl: string;
  accountId: string;
  apiToken: string;
  timeoutMs: number;
}

export class ChatwootClientError extends Error {
  constructor(
    public readonly code:
      'CHATWOOT_TIMEOUT' | 'CHATWOOT_HTTP_ERROR' | 'CHATWOOT_NETWORK_ERROR',
    message: string,
  ) {
    super(message);
    this.name = 'ChatwootClientError';
  }
}

export class HttpChatwootClient implements ChatwootClient {
  constructor(
    private readonly config: ChatwootClientConfig,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async sendConversationMessage(
    input: SendConversationMessageInput,
  ): Promise<ChatwootSendResult> {
    const controller = new AbortController();
    let timedOut = false;
    const startedAt = performance.now();
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.config.timeoutMs);

    try {
      const response = await this.fetchFn(
        `${this.config.baseUrl}/api/v1/accounts/${encodeURIComponent(this.config.accountId)}/conversations/${encodeURIComponent(input.conversationId)}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            api_access_token: this.config.apiToken,
          },
          body: JSON.stringify({
            content: input.content,
            message_type: 'outgoing',
            private: false,
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new ChatwootClientError(
          'CHATWOOT_HTTP_ERROR',
          `Chatwoot message API returned HTTP ${response.status}.`,
        );
      }

      return { latencyMs: Math.round(performance.now() - startedAt) };
    } catch (error: unknown) {
      if (error instanceof ChatwootClientError) {
        throw error;
      }

      if (timedOut || (error instanceof Error && error.name === 'AbortError')) {
        throw new ChatwootClientError(
          'CHATWOOT_TIMEOUT',
          'Chatwoot message API request timed out.',
        );
      }

      throw new ChatwootClientError(
        'CHATWOOT_NETWORK_ERROR',
        'Chatwoot message API request failed.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async markConversationForHumanHandoff(conversationId: string): Promise<void> {
    const base = `${this.config.baseUrl}/api/v1/accounts/${encodeURIComponent(this.config.accountId)}/conversations/${encodeURIComponent(conversationId)}`;
    const headers = {
      'Content-Type': 'application/json',
      api_access_token: this.config.apiToken,
    };
    const labelsResponse = await this.fetchFn(`${base}/labels`, { headers });
    if (!labelsResponse.ok)
      throw new ChatwootClientError(
        'CHATWOOT_HTTP_ERROR',
        'Chatwoot labels API failed.',
      );
    const payload: unknown = await labelsResponse.json();
    const labels = Array.isArray(payload)
      ? payload.filter((value): value is string => typeof value === 'string')
      : [];
    const response = await this.fetchFn(`${base}/labels`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        labels: [...new Set([...labels, 'human_handoff'])],
      }),
    });
    if (!response.ok)
      throw new ChatwootClientError(
        'CHATWOOT_HTTP_ERROR',
        'Chatwoot handoff label API failed.',
      );
  }
}

export class UnavailableChatwootClient implements ChatwootClient {
  async sendConversationMessage(): Promise<ChatwootSendResult> {
    throw new ChatwootClientError(
      'CHATWOOT_NETWORK_ERROR',
      'Chatwoot integration is not configured.',
    );
  }
  async markConversationForHumanHandoff(): Promise<void> {
    throw new ChatwootClientError(
      'CHATWOOT_NETWORK_ERROR',
      'Chatwoot integration is not configured.',
    );
  }
}
