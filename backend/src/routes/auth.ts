import { Router } from 'express';
import {
  clearOidcCookies,
  createSession,
  destroySession,
  readOidcCookies,
  setOidcCookies,
  setSessionCookie,
} from '../lib/auth';
import { createRateLimitMiddleware } from '../lib/rate-limit';
import {
  createAuthRequest,
  exchangeCodeForIdentity,
  getCodeforcesSyncStatus,
  upsertCodeforcesUser,
} from '../services/codeforces';

const router = Router();
const authLimiter = createRateLimitMiddleware({
  windowMs: 5 * 60 * 1000,
  max: 20,
  keyPrefix: 'auth',
  message: '登录请求过于频繁，请稍后重试',
});

function getAppOrigin() {
  const redirectUri = process.env.CODEFORCES_OIDC_REDIRECT_URI;
  if (!redirectUri) {
    throw new Error('缺少环境变量 CODEFORCES_OIDC_REDIRECT_URI');
  }

  return new URL(redirectUri).origin;
}

router.get('/codeforces/login', authLimiter, async (_req, res, next) => {
  try {
    const { state, nonce, url } = createAuthRequest();
    setOidcCookies(res, state, nonce);
    res.redirect(url);
  } catch (error) {
    next(error);
  }
});

router.get('/codeforces/callback', authLimiter, async (req, res, next) => {
  try {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const stored = readOidcCookies(req);

    if (!code || !state) {
      return res.status(400).json({ error: 'Codeforces 登录回调缺少参数' });
    }

    if (!stored.state || stored.state !== state || !stored.nonce) {
      clearOidcCookies(res);
      return res.status(400).json({ error: 'Codeforces 登录校验失败，请重新发起登录' });
    }

    const identity = await exchangeCodeForIdentity(code, stored.nonce);
    const user = await upsertCodeforcesUser(identity);
    const session = await createSession(user.id);

    setSessionCookie(res, session.token, session.expiresAt);
    clearOidcCookies(res);

    res.redirect(`${getAppOrigin()}/auth/syncing`);
  } catch (error) {
    next(error);
  }
});

router.get('/me', async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: '未登录' });
    }

    const syncStatus = await getCodeforcesSyncStatus(req.user.id);

    res.json({
      user: req.user,
      codeforces: syncStatus,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    await destroySession(req, res);
    res.json({ message: '已退出登录' });
  } catch (error) {
    next(error);
  }
});

export default router;
