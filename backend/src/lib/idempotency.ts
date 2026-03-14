import type { NextFunction, Request, Response } from 'express';

type CachedResponse = {
  statusCode: number;
  body: unknown;
  expiresAt: number;
};

const responseCache = new Map<string, CachedResponse>();
const DEFAULT_TTL_MS = 10 * 60 * 1000;

function cleanup(now: number) {
  for (const [key, value] of responseCache.entries()) {
    if (value.expiresAt <= now) {
      responseCache.delete(key);
    }
  }
}

function getCacheKey(req: Request, idempotencyKey: string) {
  return `${req.user?.id || req.ip || 'anonymous'}:${req.method}:${req.path}:${idempotencyKey}`;
}

export function withIdempotency(ttlMs = DEFAULT_TTL_MS) {
  return function idempotencyMiddleware(req: Request, res: Response, next: NextFunction) {
    const keyHeader = req.headers['idempotency-key'];
    const idempotencyKey = Array.isArray(keyHeader) ? keyHeader[0] : keyHeader;

    if (!idempotencyKey) {
      return next();
    }

    const now = Date.now();
    cleanup(now);

    const cacheKey = getCacheKey(req, idempotencyKey);
    const existing = responseCache.get(cacheKey);

    if (existing && existing.expiresAt > now) {
      return res.status(existing.statusCode).json(existing.body);
    }

    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      responseCache.set(cacheKey, {
        statusCode: res.statusCode,
        body,
        expiresAt: now + ttlMs,
      });
      return originalJson(body);
    }) as Response['json'];

    return next();
  };
}
