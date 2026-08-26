const DEFAULT_PORT = 3000;
const DEFAULT_CHATWOOT_TIMEOUT_MS = 5_000;
const DEFAULT_MAXKB_TIMEOUT_MS = 10_000;
const DEFAULT_MAXKB_MAX_RETRIES = 1;
const DEFAULT_MAXKB_RETRY_DELAY_MS = 200;

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
