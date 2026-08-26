import express, { type Express, type Request, type Response } from 'express';

export interface HealthResponse {
  status: 'ok';
  service: 'enamel-ai-gateway';
  timestamp: string;
}

export function createApp(): Express {
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

  return app;
}
