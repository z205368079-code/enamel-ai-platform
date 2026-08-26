export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export class WebhookValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookValidationError';
  }
}
