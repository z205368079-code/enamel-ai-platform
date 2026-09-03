import express, { type Express, type Request, type Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  type GatewayClient,
  GatewayInvalidResponseError,
} from './bff/gateway-client.js';

export interface DashboardAppDependencies {
  gatewayClient: GatewayClient;
  publicDir?: string | undefined;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createDashboardApp(
  dependencies: DashboardAppDependencies,
): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '512kb' }));

  const publicDir =
    dependencies.publicDir ?? path.resolve(__dirname, '../public');
  app.use(express.static(publicDir));

  // BFF API endpoints
  app.get('/api/health', async (_req: Request, res: Response) => {
    const gatewayHealth = await dependencies.gatewayClient.checkHealth();
    res.status(200).json({
      status: 'ok',
      service: 'enamel-ai-dashboard-bff',
      timestamp: new Date().toISOString(),
      gateway: gatewayHealth,
    });
  });

  app.get('/api/stats', async (_req: Request, res: Response) => {
    try {
      const stats = await dependencies.gatewayClient.getStats();
      res.status(200).json(stats);
    } catch (err) {
      if (err instanceof GatewayInvalidResponseError) {
        res.status(503).json({
          error: 'GATEWAY_INVALID_RESPONSE',
          message: '暂时无法获取数据：Gateway 返回的指标数据格式异常。',
        });
        return;
      }
      res.status(503).json({
        error: 'GATEWAY_UNAVAILABLE',
        message: '暂时无法获取数据，请检查 Gateway 运行状态。',
      });
    }
  });

  app.get('/api/knowledge-gaps', async (req: Request, res: Response) => {
    const limit = Math.min(
      Math.max(1, parseInt(String(req.query['limit'] || '10'), 10) || 10),
      100,
    );
    const offset = Math.max(
      0,
      parseInt(String(req.query['offset'] || '0'), 10) || 0,
    );

    try {
      const gaps = await dependencies.gatewayClient.getKnowledgeGaps(
        limit,
        offset,
      );
      res.status(200).json(gaps);
    } catch {
      res.status(503).json({
        error: 'GATEWAY_UNAVAILABLE',
        message: '暂时无法获取数据，请检查 Gateway 运行状态。',
      });
    }
  });

  // SPA fallback for root /
  app.get('/', (_req: Request, res: Response) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  return app;
}
