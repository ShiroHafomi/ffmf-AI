import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  logger.error('Unhandled error:', err?.stack ?? err?.message ?? err);
  res.status(err.status ?? 500).json({ error: err.message ?? 'Internal server error' });
}
