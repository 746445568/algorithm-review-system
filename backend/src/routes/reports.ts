import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { generateWeeklyReport } from '../services/report';

const router = Router();

router.post('/weekly-report', async (req, res, next) => {
  try {
    const { weekStart } = req.body;
    const userId = req.user!.id;

    let startDate: Date;
    if (weekStart) {
      startDate = new Date(weekStart);
    } else {
      const today = new Date();
      const dayOfWeek = today.getDay();
      const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      startDate = new Date(today.setDate(diff));
      startDate.setHours(0, 0, 0, 0);
    }

    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);

    const [submissions, problems, reviewQueues] = await Promise.all([
      prisma.submission.findMany({
        where: {
          userId,
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: {
          problem: true,
          review: true,
        },
      }),
      prisma.problem.findMany({
        where: {
          userId,
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
      }),
      prisma.reviewQueue.findMany({
        where: {
          userId,
          lastReviewedAt: {
            gte: startDate,
            lte: endDate,
          },
        },
      }),
    ]);

    const report = await generateWeeklyReport({
      startDate,
      endDate,
      submissions,
      problems,
      reviewQueues,
    });

    res.json({
      weekStart: startDate.toISOString().split('T')[0],
      weekEnd: endDate.toISOString().split('T')[0],
      ...report,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/weekly-report/history', async (req, res, next) => {
  try {
    const { limit = '10' } = req.query;
    const reports: Array<{ weekStart: string; weekEnd: string }> = [];
    const today = new Date();

    for (let index = 0; index < Number.parseInt(String(limit), 10); index += 1) {
      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() - (weekStart.getDay() || 7) - index * 7 + 1);
      weekStart.setHours(0, 0, 0, 0);

      reports.push({
        weekStart: weekStart.toISOString().split('T')[0],
        weekEnd: new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      });
    }

    res.json(reports);
  } catch (error) {
    next(error);
  }
});

export default router;
