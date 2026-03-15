import { Router } from 'express';
import { withIdempotency } from '../lib/idempotency';
import { createRateLimitMiddleware } from '../lib/rate-limit';
import { getCodeforcesSyncStatus, syncCodeforcesForUser } from '../services/codeforces';
import {
  getAtCoderSyncStatus,
  linkAtCoderAccount,
  syncAtCoderForUser,
  unlinkAtCoderAccount,
} from '../services/atcoder';

const router = Router();
const syncLimiter = createRateLimitMiddleware({
  windowMs: 60 * 1000,
  max: 8,
  keyPrefix: 'sync',
  message: '同步请求过于频繁，请稍后重试',
});

router.post('/codeforces/sync', syncLimiter, withIdempotency(), async (req, res, next) => {
  try {
    const result = await syncCodeforcesForUser(req.user!.id);
    res.json({ status: 'success', ...result });
  } catch (error) {
    next(error);
  }
});

router.post('/codeforces/resync', syncLimiter, withIdempotency(), async (req, res, next) => {
  try {
    const result = await syncCodeforcesForUser(req.user!.id, { full: true });
    res.json({ status: 'success', ...result });
  } catch (error) {
    next(error);
  }
});

router.get('/codeforces/status', async (req, res, next) => {
  try {
    const status = await getCodeforcesSyncStatus(req.user!.id);
    res.json({
      status: status?.syncing ? 'syncing' : status ? status.lastSyncStatus || 'idle' : 'unlinked',
      codeforces: status,
    });
  } catch (error) {
    next(error);
  }
});

// --- AtCoder ---

router.post('/atcoder/link', syncLimiter, async (req, res, next) => {
  try {
    const handle = typeof req.body?.handle === 'string' ? req.body.handle.trim() : '';
    if (!handle) {
      return res.status(400).json({ error: '请输入 AtCoder 用户名' });
    }
    const result = await linkAtCoderAccount(req.user!.id, handle);
    res.json({ status: 'success', ...result });
  } catch (error) {
    next(error);
  }
});

router.delete('/atcoder/link', async (req, res, next) => {
  try {
    await unlinkAtCoderAccount(req.user!.id);
    res.json({ status: 'success' });
  } catch (error) {
    next(error);
  }
});

router.post('/atcoder/sync', syncLimiter, withIdempotency(), async (req, res, next) => {
  try {
    const result = await syncAtCoderForUser(req.user!.id);
    res.json({ status: 'success', ...result });
  } catch (error) {
    next(error);
  }
});

router.post('/atcoder/resync', syncLimiter, withIdempotency(), async (req, res, next) => {
  try {
    const result = await syncAtCoderForUser(req.user!.id, { full: true });
    res.json({ status: 'success', ...result });
  } catch (error) {
    next(error);
  }
});

router.get('/atcoder/status', async (req, res, next) => {
  try {
    const status = await getAtCoderSyncStatus(req.user!.id);
    res.json({
      status: status?.syncing ? 'syncing' : status ? status.lastSyncStatus || 'idle' : 'unlinked',
      atcoder: status,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
