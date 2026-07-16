import { Request, Response, NextFunction } from 'express';

interface Bucket {
  count: number;
  resetAt: number;
}

// Simple in-memory fixed-window rate limiter, keyed by IP + path.
// Enough to blunt brute-force / abuse on auth endpoints in this app's scope.
// (For multi-instance production, swap for Redis; the interface is identical.)
const buckets = new Map<string, Bucket>();

export function rateLimit(max: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip ?? 'unknown'}:${req.path}`;
    const now = Date.now();
    const entry = buckets.get(key);

    if (!entry || entry.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count += 1;
    if (entry.count > max) {
      const retry = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retry));
      return res.status(429).json({ error: 'Too many requests, please try again later.' });
    }
    next();
  };
}
