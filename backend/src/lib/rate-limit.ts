import type { NextFunction, Request, Response } from 'express';

type Bucket = {
  count: number;
  resetAt: number;
};

type RateLimitOptions = {
  windowMs: number;
  max: number;
  keyPrefix: string;
  message: string;
};

const buckets = new Map<string, Bucket>();

function cleanupExpiredBuckets(now: number) {
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

function getClientKey(req: Request) {
  if (req.user?.id) {
    return `user:${req.user.id}`;
  }

  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return `ip:${forwardedFor.split(',')[0].trim()}`;
  }

  return `ip:${req.ip || 'unknown'}`;
}

export function createRateLimitMiddleware(options: RateLimitOptions) {
  return function rateLimit(req: Request, res: Response, next: NextFunction) {
    const now = Date.now();
    cleanupExpiredBuckets(now);

    const key = `${options.keyPrefix}:${getClientKey(req)}`;
    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      buckets.set(key, {
        count: 1,
        resetAt: now + options.windowMs,
      });
      return next();
    }

    if (existing.count >= options.max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        error: options.message,
      });
    }

    existing.count += 1;
    buckets.set(key, existing);
    return next();
  };
}
