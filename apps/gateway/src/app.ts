import express, { type Express, type Request, type Response } from 'express';

import { createChatwootWebhookController } from './api/chatwoot-webhook-controller.js';
import type { Logger } from './logging/logger.js';
import type { ChatwootWebhookService } from './services/chatwoot-webhook-service.js';

export interface HealthResponse {
  status: 'ok';
  service: 'enamel-ai-gateway';
  timestamp: string;
}

export interface AppDependencies {
  webhookService: ChatwootWebhookService;
  logger: Logger;
}

export function createApp(dependencies: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get(
    '/health',
    (_request: Request, response: Response<HealthResponse>) => {
      response.status(200).json({
        status: 'ok',
        service: 'enamel-ai-gateway',
        timestamp: new Date().toISOString(),
      });
    },
  );

  app.post(
    '/webhooks/chatwoot',
    createChatwootWebhookController(
      dependencies.webhookService,
      dependencies.logger,
    ),
  );

  app.use(
    (
      error: unknown,
      _request: Request,
      response: Response,
      next: (nextError?: unknown) => void,
    ) => {
      if (error instanceof SyntaxError && 'body' in error) {
        response
          .status(400)
          .json({ status: 'invalid', message: 'Invalid JSON body.' });
        return;
      }

      next(error);
    },
  );

  return app;
}
