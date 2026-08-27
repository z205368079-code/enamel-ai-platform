import type { Request, Response } from 'express';

import { ConfigurationError, WebhookValidationError } from '../errors.js';
import type { Logger } from '../logging/logger.js';
import type { ChatwootWebhookService } from '../services/chatwoot-webhook-service.js';

export function createChatwootWebhookController(
  webhookService: ChatwootWebhookService,
  logger: Logger,
) {
  return async (request: Request, response: Response): Promise<void> => {
    try {
      const result = await webhookService.process(request.body);
      response.status(200).json(result);
    } catch (error: unknown) {
      if (error instanceof WebhookValidationError) {
        response
          .status(400)
          .json({ status: 'invalid', message: error.message });
        return;
      }

      if (error instanceof ConfigurationError) {
        logger.error(
          {
            processingResult: 'unavailable',
            error: error.name,
          },
          'Chatwoot webhook configuration is unavailable.',
        );
        response.status(503).json({ status: 'unavailable' });
        return;
      }

      logger.error(
        {
          processingResult: 'failed',
          error: error instanceof Error ? error.name : 'unknown',
        },
        'Chatwoot webhook processing failed.',
      );
      response.status(500).json({ status: 'failed' });
    }
  };
}
