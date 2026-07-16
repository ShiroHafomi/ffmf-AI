import { Request, Response, NextFunction } from 'express';

// Basic defensive HTTP headers. Express also exposes its version by default,
// so we disable the X-Powered-By header in index.ts as well.
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
}
