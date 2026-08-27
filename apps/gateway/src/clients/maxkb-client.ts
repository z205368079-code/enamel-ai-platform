export interface MaxKBClientConfig {
  baseUrl: string;
  appId: string;
  apiKey: string;
  chatCompletionsUrl?: string | undefined;
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
}

export interface MaxKBAnswer {
  answer: string | null;
  latencyMs: number;
  maxkbChatId?: string | undefined;
}

export interface MaxKBClient {
  answer(input: {
    question: string;
    maxkbChatId?: string | undefined;
  }): Promise<MaxKBAnswer>;
}

export class MaxKBClientError extends Error {
  constructor(
    public readonly code:
      'TIMEOUT' | 'NETWORK_ERROR' | 'HTTP_ERROR' | 'INVALID_RESPONSE',
    public readonly latencyMs: number,
    public readonly retryable: boolean,
    message: string,
  ) {
    super(message);
    this.name = 'MaxKBClientError';
  }
}

type Sleep = (milliseconds: number) => Promise<void>;

const defaultSleep: Sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractAnswer(payload: unknown): {
  answer: string | null;
  maxkbChatId?: string | undefined;
} {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    throw new Error('MaxKB response does not contain choices.');
  }

  const firstChoice = payload.choices[0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    throw new Error('MaxKB response does not contain a message choice.');
  }

  const content = firstChoice.message.content;
  if (typeof content !== 'string') {
    throw new Error('MaxKB response message content is invalid.');
  }

  const answer = content.trim();
  const chatId = firstChoice.chat_id;
  if (
    chatId !== undefined &&
    (typeof chatId !== 'string' || chatId.length === 0)
  ) {
    throw new Error('MaxKB response chat_id is invalid.');
  }

  return {
    answer: answer.length === 0 ? null : answer,
    ...(typeof chatId === 'string' ? { maxkbChatId: chatId } : {}),
  };
}

export class HttpMaxKBClient implements MaxKBClient {
  constructor(
    private readonly config: MaxKBClientConfig,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly sleep: Sleep = defaultSleep,
  ) {}

  async answer(input: {
    question: string;
    maxkbChatId?: string | undefined;
  }): Promise<MaxKBAnswer> {
    let lastError: MaxKBClientError | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      try {
        return await this.request(input);
      } catch (error: unknown) {
        const classified = this.classifyError(error);
        lastError = classified;

        if (!classified.retryable || attempt === this.config.maxRetries) {
          throw classified;
        }

        await this.sleep(this.config.retryDelayMs);
      }
    }

    throw (
      lastError ??
      new MaxKBClientError('NETWORK_ERROR', 0, false, 'MaxKB failed.')
    );
  }

  private async request(input: {
    question: string;
    maxkbChatId?: string | undefined;
  }): Promise<MaxKBAnswer> {
    const controller = new AbortController();
    let timedOut = false;
    const startedAt = performance.now();
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.config.timeoutMs);

    try {
      const response = await this.fetchFn(
        this.config.chatCompletionsUrl ??
          `${this.config.baseUrl}/chat/api/${encodeURIComponent(this.config.appId)}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            stream: false,
            messages: [{ role: 'user', content: input.question }],
            ...(input.maxkbChatId === undefined
              ? {}
              : { chat_id: input.maxkbChatId }),
          }),
          signal: controller.signal,
        },
      );
      const latencyMs = Math.round(performance.now() - startedAt);

      if (!response.ok) {
        throw new MaxKBClientError(
          'HTTP_ERROR',
          latencyMs,
          response.status === 408 ||
            response.status === 429 ||
            response.status >= 500,
          `MaxKB API returned HTTP ${response.status}.`,
        );
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new MaxKBClientError(
          'INVALID_RESPONSE',
          latencyMs,
          false,
          'MaxKB API response is not valid JSON.',
        );
      }

      if (
        isRecord(payload) &&
        payload.code !== undefined &&
        payload.code !== 200 &&
        payload.code !== '200'
      ) {
        throw new MaxKBClientError(
          'HTTP_ERROR',
          latencyMs,
          false,
          'MaxKB API returned an application error.',
        );
      }

      try {
        return { ...extractAnswer(payload), latencyMs };
      } catch (error: unknown) {
        throw new MaxKBClientError(
          'INVALID_RESPONSE',
          latencyMs,
          false,
          error instanceof Error
            ? error.message
            : 'MaxKB API response is invalid.',
        );
      }
    } catch (error: unknown) {
      if (error instanceof MaxKBClientError) {
        throw error;
      }

      const latencyMs = Math.round(performance.now() - startedAt);
      if (timedOut || (error instanceof Error && error.name === 'AbortError')) {
        throw new MaxKBClientError(
          'TIMEOUT',
          latencyMs,
          true,
          'MaxKB API request timed out.',
        );
      }

      throw new MaxKBClientError(
        'NETWORK_ERROR',
        latencyMs,
        true,
        'MaxKB API request failed.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private classifyError(error: unknown): MaxKBClientError {
    if (error instanceof MaxKBClientError) {
      return error;
    }

    return new MaxKBClientError(
      'NETWORK_ERROR',
      0,
      false,
      'MaxKB API request failed unexpectedly.',
    );
  }
}

export class UnavailableMaxKBClient implements MaxKBClient {
  async answer(): Promise<MaxKBAnswer> {
    throw new MaxKBClientError(
      'NETWORK_ERROR',
      0,
      false,
      'MaxKB integration is not configured.',
    );
  }
}
