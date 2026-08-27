const DEFAULT_PORT = 3000;
const DEFAULT_CHATWOOT_TIMEOUT_MS = 5_000;
const DEFAULT_MAXKB_TIMEOUT_MS = 10_000;
const DEFAULT_MAXKB_MAX_RETRIES = 1;
const DEFAULT_MAXKB_RETRY_DELAY_MS = 200;
const DEFAULT_AI_FAILURE_HANDOFF_THRESHOLD = 2;
const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash';
const DEFAULT_DEEPSEEK_TIMEOUT_MS = 10_000;

export interface ChatwootConfig {
  baseUrl: string;
  accountId: string;
  apiToken: string;
  timeoutMs: number;
}

export interface MaxKBConfig {
  baseUrl: string;
  appId: string;
  apiKey: string;
  chatCompletionsUrl?: string | undefined;
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
}

export interface DeepSeekConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

function parsePort(value: string | undefined): number {
  if (value === undefined) {
    return DEFAULT_PORT;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('GATEWAY_PORT must be an integer between 1 and 65535.');
  }

  return port;
}

export function getGatewayPort(): number {
  return parsePort(process.env.GATEWAY_PORT);
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  fieldName: string,
): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }

  return parsed;
}

function parseNonNegativeInteger(
  value: string | undefined,
  fallback: number,
  fieldName: string,
): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${fieldName} must be a non-negative integer.`);
  }
  return parsed;
}

function getRequiredTrimmedValue(
  value: string | undefined,
  fieldName: string,
): string {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    throw new Error(
      `${fieldName} is required when this integration is configured.`,
    );
  }

  return trimmed;
}

export function getOptionalDatabaseUrl(): string | undefined {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  return databaseUrl === undefined || databaseUrl.length === 0
    ? undefined
    : databaseUrl;
}

export function getOptionalChatwootConfig(): ChatwootConfig | undefined {
  const configuredValues = [
    process.env.CHATWOOT_BASE_URL,
    process.env.CHATWOOT_ACCOUNT_ID,
    process.env.CHATWOOT_API_TOKEN,
  ];

  if (
    configuredValues.every(
      (value) => value?.trim().length === 0 || value === undefined,
    )
  ) {
    return undefined;
  }

  return {
    baseUrl: getRequiredTrimmedValue(
      process.env.CHATWOOT_BASE_URL,
      'CHATWOOT_BASE_URL',
    ).replace(/\/$/, ''),
    accountId: getRequiredTrimmedValue(
      process.env.CHATWOOT_ACCOUNT_ID,
      'CHATWOOT_ACCOUNT_ID',
    ),
    apiToken: getRequiredTrimmedValue(
      process.env.CHATWOOT_API_TOKEN,
      'CHATWOOT_API_TOKEN',
    ),
    timeoutMs: parsePositiveInteger(
      process.env.CHATWOOT_REQUEST_TIMEOUT_MS,
      DEFAULT_CHATWOOT_TIMEOUT_MS,
      'CHATWOOT_REQUEST_TIMEOUT_MS',
    ),
  };
}

export function getOptionalMaxKBConfig(): MaxKBConfig | undefined {
  const configuredValues = [
    process.env.MAXKB_BASE_URL,
    process.env.MAXKB_APP_ID,
    process.env.MAXKB_API_KEY,
  ];
  if (
    configuredValues.every(
      (value) => value?.trim().length === 0 || value === undefined,
    )
  ) {
    return undefined;
  }
  return {
    baseUrl: getRequiredTrimmedValue(
      process.env.MAXKB_BASE_URL,
      'MAXKB_BASE_URL',
    ).replace(/\/$/, ''),
    appId: getRequiredTrimmedValue(process.env.MAXKB_APP_ID, 'MAXKB_APP_ID'),
    apiKey: getRequiredTrimmedValue(process.env.MAXKB_API_KEY, 'MAXKB_API_KEY'),
    chatCompletionsUrl:
      process.env.MAXKB_CHAT_COMPLETIONS_URL?.trim() || undefined,
    timeoutMs: parsePositiveInteger(
      process.env.MAXKB_TIMEOUT_MS,
      DEFAULT_MAXKB_TIMEOUT_MS,
      'MAXKB_TIMEOUT_MS',
    ),
    maxRetries: parseNonNegativeInteger(
      process.env.MAXKB_MAX_RETRIES,
      DEFAULT_MAXKB_MAX_RETRIES,
      'MAXKB_MAX_RETRIES',
    ),
    retryDelayMs: parseNonNegativeInteger(
      process.env.MAXKB_RETRY_DELAY_MS,
      DEFAULT_MAXKB_RETRY_DELAY_MS,
      'MAXKB_RETRY_DELAY_MS',
    ),
  };
}

export function getOptionalDeepSeekConfig(): DeepSeekConfig | undefined {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (apiKey === undefined || apiKey.length === 0) return undefined;

  return {
    baseUrl: (
      process.env.DEEPSEEK_BASE_URL?.trim() || DEFAULT_DEEPSEEK_BASE_URL
    ).replace(/\/$/, ''),
    apiKey,
    model: process.env.DEEPSEEK_MODEL?.trim() || DEFAULT_DEEPSEEK_MODEL,
    timeoutMs: parsePositiveInteger(
      process.env.DEEPSEEK_TIMEOUT_MS,
      DEFAULT_DEEPSEEK_TIMEOUT_MS,
      'DEEPSEEK_TIMEOUT_MS',
    ),
  };
}

export function getHandoffConfig(): {
  failureThreshold: number;
  highRiskKeywords: string[];
} {
  return {
    failureThreshold: parsePositiveInteger(
      process.env.AI_FAILURE_HANDOFF_THRESHOLD,
      DEFAULT_AI_FAILURE_HANDOFF_THRESHOLD,
      'AI_FAILURE_HANDOFF_THRESHOLD',
    ),
    highRiskKeywords: (
      process.env.HIGH_RISK_KEYWORDS ??
      '赔偿,投诉,法律,起诉,人身伤害,严重质量问题'
    )
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  };
}

export function getOptionalInternalApiToken(): string | undefined {
  const token = process.env.INTERNAL_API_TOKEN?.trim();
  return token === undefined || token.length === 0 ? undefined : token;
}
