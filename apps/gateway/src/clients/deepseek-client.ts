export interface DeepSeekClientConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

export interface DeepSeekAnswer {
  answer: string;
  latencyMs: number;
}

export interface DeepSeekClient {
  answer(input: { question: string }): Promise<DeepSeekAnswer>;
}

export class DeepSeekClientError extends Error {
  constructor(
    public readonly code:
      'TIMEOUT' | 'NETWORK_ERROR' | 'HTTP_ERROR' | 'INVALID_RESPONSE',
    message: string,
  ) {
    super(message);
    this.name = 'DeepSeekClientError';
  }
}

function extractAnswer(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('DeepSeek response must be an object.');
  }

  const choices = (payload as Record<string, unknown>).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error('DeepSeek response does not contain choices.');
  }

  const firstChoice = choices[0];
  if (typeof firstChoice !== 'object' || firstChoice === null) {
    throw new Error('DeepSeek response choice is invalid.');
  }

  const message = (firstChoice as Record<string, unknown>).message;
  if (typeof message !== 'object' || message === null) {
    throw new Error('DeepSeek response message is invalid.');
  }

  const content = (message as Record<string, unknown>).content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('DeepSeek response message content is invalid.');
  }

  return content.trim();
}

const FALLBACK_SYSTEM_PROMPT =
  'You are a customer-service assistant for a synthetic enamel cookware interview demo. ' +
  'Answer only with general, cautious cooking guidance. Do not invent product-specific specifications, policies, warranties, compensation, refunds, or legal conclusions. ' +
  'For safety, injury, quality-claim, compensation, refund, or legal matters, instruct the customer to contact a human agent. ' +
  'State briefly that product-specific details should be confirmed against the product manual.';

export class HttpDeepSeekClient implements DeepSeekClient {
  constructor(
    private readonly config: DeepSeekClientConfig,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async answer(input: { question: string }): Promise<DeepSeekAnswer> {
    const controller = new AbortController();
    let timedOut = false;
    const startedAt = performance.now();
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.config.timeoutMs);

    try {
      const response = await this.fetchFn(
        `${this.config.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            model: this.config.model,
            stream: false,
            messages: [
              { role: 'system', content: FALLBACK_SYSTEM_PROMPT },
              { role: 'user', content: input.question },
            ],
          }),
          signal: controller.signal,
        },
      );
      const latencyMs = Math.round(performance.now() - startedAt);

      if (!response.ok) {
        throw new DeepSeekClientError(
          'HTTP_ERROR',
          `DeepSeek API returned HTTP ${response.status}.`,
        );
      }

      try {
        return { answer: extractAnswer(await response.json()), latencyMs };
      } catch (error: unknown) {
        if (error instanceof DeepSeekClientError) throw error;
        throw new DeepSeekClientError(
          'INVALID_RESPONSE',
          'DeepSeek API response is invalid.',
        );
      }
    } catch (error: unknown) {
      if (error instanceof DeepSeekClientError) throw error;
      if (timedOut || (error instanceof Error && error.name === 'AbortError')) {
        throw new DeepSeekClientError(
          'TIMEOUT',
          'DeepSeek API request timed out.',
        );
      }
      throw new DeepSeekClientError(
        'NETWORK_ERROR',
        'DeepSeek API request failed.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
