import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { prisma } from './prisma';

const SESSION_COOKIE_NAME = 'ars_session';
const OIDC_STATE_COOKIE_NAME = 'ars_oidc_state';
const OIDC_NONCE_COOKIE_NAME = 'ars_oidc_nonce';
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 30);

export function parseCookies(header?: string) {
  if (!header) return {} as Record<string, string>;

  return header.split(';').reduce<Record<string, string>>((result, pair) => {
    const index = pair.indexOf('=');
    if (index === -1) return result;

    const key = decodeURIComponent(pair.slice(0, index).trim());
    const value = decodeURIComponent(pair.slice(index + 1).trim());
    result[key] = value;
    return result;
  }, {});
}

function serializeCookie(name: string, value: string, options: {
  httpOnly?: boolean;
  maxAge?: number;
  expires?: Date;
  path?: string;
  sameSite?: 'Lax' | 'Strict' | 'None';
  secure?: boolean;
}) {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path || '/'}`);

  if (options.httpOnly) parts.push('HttpOnly');
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.secure) parts.push('Secure');

  return parts.join('; ');
}

function appendCookie(res: Response, cookie: string) {
  const current = res.getHeader('Set-Cookie');
  if (!current) {
    res.setHeader('Set-Cookie', cookie);
    return;
  }

  const values = Array.isArray(current) ? current.concat(cookie) : [String(current), cookie];
  res.setHeader('Set-Cookie', values);
}

function getCookieOptions() {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax' as const,
    secure: process.env.NODE_ENV === 'production',
  };
}

export async function createSession(userId: string) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  return prisma.session.create({
    data: {
      token,
      userId,
      expiresAt,
    },
  });
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date) {
  appendCookie(
    res,
    serializeCookie(SESSION_COOKIE_NAME, token, {
      ...getCookieOptions(),
      maxAge: Math.floor((expiresAt.getTime() - Date.now()) / 1000),
      expires: expiresAt,
    }),
  );
}

export function clearSessionCookie(res: Response) {
  appendCookie(
    res,
    serializeCookie(SESSION_COOKIE_NAME, '', {
      ...getCookieOptions(),
      maxAge: 0,
      expires: new Date(0),
    }),
  );
}

export function setOidcCookies(res: Response, state: string, nonce: string) {
  const base = {
    ...getCookieOptions(),
    maxAge: 10 * 60,
    expires: new Date(Date.now() + 10 * 60 * 1000),
  };

  appendCookie(res, serializeCookie(OIDC_STATE_COOKIE_NAME, state, base));
  appendCookie(res, serializeCookie(OIDC_NONCE_COOKIE_NAME, nonce, base));
}

export function readOidcCookies(req: Request) {
  const cookies = parseCookies(req.headers.cookie);
  return {
    state: cookies[OIDC_STATE_COOKIE_NAME],
    nonce: cookies[OIDC_NONCE_COOKIE_NAME],
  };
}

export function clearOidcCookies(res: Response) {
  const expired = {
    ...getCookieOptions(),
    maxAge: 0,
    expires: new Date(0),
  };

  appendCookie(res, serializeCookie(OIDC_STATE_COOKIE_NAME, '', expired));
  appendCookie(res, serializeCookie(OIDC_NONCE_COOKIE_NAME, '', expired));
}

export async function attachCurrentUser(req: Request, res: Response, next: NextFunction) {
  try {
    const cookies = parseCookies(req.headers.cookie);
    const sessionToken = cookies[SESSION_COOKIE_NAME];

    if (!sessionToken) {
      return next();
    }

    const session = await prisma.session.findUnique({
      where: { token: sessionToken },
      include: { user: true },
    });

    if (!session || session.expiresAt <= new Date()) {
      if (session) {
        await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
      }
      clearSessionCookie(res);
      return next();
    }

    req.session = {
      id: session.id,
      token: session.token,
      userId: session.userId,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
    req.user = session.user;
    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: '请先登录' });
  }

  return next();
}

export async function destroySession(req: Request, res: Response) {
  if (req.session?.id) {
    await prisma.session.delete({ where: { id: req.session.id } }).catch(() => undefined);
  }

  clearSessionCookie(res);
}
