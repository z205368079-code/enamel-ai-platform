import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Logger } from '../logging/logger.js';

export function createInternalAuthMiddleware(
  token: string | undefined,
  logger: Logger,
) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const match = request.get('authorization')?.match(/^Bearer\s+(.+)$/i);
    const supplied = match?.[1];
    const valid =
      token !== undefined &&
      supplied !== undefined &&
      Buffer.byteLength(token) === Buffer.byteLength(supplied) &&
      timingSafeEqual(Buffer.from(token), Buffer.from(supplied));
    if (!valid) {
      logger.error(
        { requestPath: request.path, resultStatus: 'UNAUTHORIZED' },
        'Internal API authentication failed.',
      );
      response.status(401).json({ error: 'UNAUTHORIZED' });
      return;
    }
    next();
  };
}
