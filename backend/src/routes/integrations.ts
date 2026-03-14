import { Router } from 'express';
import { withIdempotency } from '../lib/idempotency';
import { createRateLimitMiddleware } from '../lib/rate-limit';
import { getCodeforcesSyncStatus, syncCodeforcesForUser } from '../services/codeforces';

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

export default router;
