import cors from 'cors';
import express from 'express';
import { attachCurrentUser, requireAuth } from './lib/auth';
import { prisma } from './lib/prisma';
import { createRateLimitMiddleware } from './lib/rate-limit';

import authRouter from './routes/auth';
import integrationsRouter from './routes/integrations';
import problemsRouter from './routes/problems';
import submissionsRouter from './routes/submissions';
import reviewsRouter from './routes/reviews';
import statisticsRouter from './routes/statistics';
import reportsRouter from './routes/reports';

const app = express();
const PORT = Number(process.env.PORT || 3001);
const writeLimiter = createRateLimitMiddleware({
  windowMs: 60 * 1000,
  max: 30,
  keyPrefix: 'write',
  message: '请求过于频繁，请稍后重试',
});

app.set('trust proxy', 1);
app.use(cors({ credentials: true, origin: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.text({ limit: '10mb' }));
app.use(attachCurrentUser);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/health', async (_req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ok',
      database: 'ok',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

app.use('/api/auth', authRouter);
app.use('/api/integrations', requireAuth, integrationsRouter);
app.use('/api/problems', requireAuth, problemsRouter);
app.use('/api/submissions', requireAuth, writeLimiter, submissionsRouter);
app.use('/api/reviews', requireAuth, writeLimiter, reviewsRouter);
app.use('/api/statistics', requireAuth, statisticsRouter);
app.use('/api/reports', requireAuth, reportsRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: err.message || '服务器内部错误',
  });
});

async function main() {
  await prisma.$connect();
  await prisma.session.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
  });
  console.log('数据库连接成功');

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`后端服务运行在 http://localhost:${PORT}`);
    console.log(`健康检查地址：http://localhost:${PORT}/health`);
  });
}

main().catch((error) => {
  console.error('服务启动失败:', error);
  process.exit(1);
});

export default app;
