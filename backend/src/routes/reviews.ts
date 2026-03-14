import { Router } from 'express';
import { calculateNextReview } from '../lib/review-schedule';
import { withIdempotency } from '../lib/idempotency';
import { prisma } from '../lib/prisma';
import { generateReview } from '../services/llm';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const dueOnly = req.query.dueOnly !== 'false';
    const userId = req.user!.id;

    const reviews = await prisma.review.findMany({
      where: {
        submission: {
          userId,
          problem: {
            reviewQueue: {
              some: dueOnly
                ? {
                    userId,
                    completed: false,
                    nextReviewDate: { lte: new Date() },
                  }
                : {
                    userId,
                    completed: false,
                  },
            },
          },
        },
      },
      include: {
        submission: {
          include: {
            problem: {
              include: {
                reviewQueue: {
                  where: {
                    userId,
                    completed: false,
                  },
                  orderBy: { nextReviewDate: 'asc' },
                  take: 1,
                },
              },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json(reviews);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const review = await prisma.review.findFirst({
      where: {
        id: req.params.id,
        submission: {
          userId: req.user!.id,
        },
      },
      include: {
        submission: {
          include: {
            problem: true,
          },
        },
      },
    });

    if (!review) {
      return res.status(404).json({ error: '复盘记录不存在' });
    }

    res.json(review);
  } catch (error) {
    next(error);
  }
});

router.post('/generate', withIdempotency(), async (req, res, next) => {
  try {
    const { submissionId } = req.body;
    const userId = req.user!.id;

    if (!submissionId) {
      return res.status(400).json({ error: '提交记录 ID 为必填项' });
    }

    const submission = await prisma.submission.findFirst({
      where: {
        id: String(submissionId),
        userId,
      },
      include: {
        problem: true,
        review: true,
      },
    });

    if (!submission) {
      return res.status(404).json({ error: '提交记录不存在' });
    }

    const aiReview = await generateReview({
      problem: submission.problem,
      submission,
    });

    const review = await prisma.review.upsert({
      where: { submissionId: submission.id },
      update: {
        aiAnalysis: aiReview.analysis,
        improvementSuggestions: aiReview.suggestions,
        keyPoints: JSON.stringify(aiReview.keyPoints),
        similarProblems: aiReview.similarProblems ? JSON.stringify(aiReview.similarProblems) : null,
      },
      create: {
        submissionId: submission.id,
        aiAnalysis: aiReview.analysis,
        improvementSuggestions: aiReview.suggestions,
        keyPoints: JSON.stringify(aiReview.keyPoints),
        similarProblems: aiReview.similarProblems ? JSON.stringify(aiReview.similarProblems) : null,
      },
      include: {
        submission: {
          include: {
            problem: true,
          },
        },
      },
    });

    const existingQueue = await prisma.reviewQueue.findFirst({
      where: {
        userId,
        problemId: submission.problemId,
        completed: false,
      },
    });

    if (!existingQueue) {
      await prisma.reviewQueue.create({
        data: {
          userId,
          problemId: submission.problemId,
          nextReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
          interval: 1,
          priority: 3,
        },
      });
    } else {
      await prisma.reviewQueue.update({
        where: { id: existingQueue.id },
        data: {
          completed: false,
          priority: Math.min(5, existingQueue.priority + 1),
          nextReviewDate: new Date(),
        },
      });
    }

    res.json(review);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/complete', withIdempotency(), async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const review = await prisma.review.findFirst({
      where: {
        id: req.params.id,
        submission: {
          userId,
        },
      },
      include: {
        submission: {
          include: {
            problem: {
              include: {
                reviewQueue: {
                  where: {
                    userId,
                    completed: false,
                  },
                  orderBy: { nextReviewDate: 'asc' },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    if (!review) {
      return res.status(404).json({ error: '复盘记录不存在' });
    }

    const queueItem = review.submission.problem.reviewQueue[0];
    if (!queueItem) {
      return res.status(404).json({ error: '未找到待复习任务' });
    }

    const { nextInterval, nextReviewDate } = calculateNextReview(queueItem.interval);

    const updatedQueue = await prisma.reviewQueue.update({
      where: { id: queueItem.id },
      data: {
        interval: nextInterval,
        nextReviewDate,
        priority: Math.max(1, queueItem.priority - 1),
        completed: false,
        reviewCount: queueItem.reviewCount + 1,
        lastReviewedAt: new Date(),
      },
    });

    res.json({
      message: '复习完成，下次复习时间已更新',
      queue: updatedQueue,
    });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.review.findFirst({
      where: {
        id: req.params.id,
        submission: {
          userId: req.user!.id,
        },
      },
      select: { id: true },
    });

    if (!existing) {
      return res.status(404).json({ error: '复盘记录不存在' });
    }

    const { aiAnalysis, improvementSuggestions, keyPoints, similarProblems } = req.body;

    const review = await prisma.review.update({
      where: { id: req.params.id },
      data: {
        aiAnalysis,
        improvementSuggestions,
        keyPoints: keyPoints ? JSON.stringify(keyPoints) : undefined,
        similarProblems: similarProblems ? JSON.stringify(similarProblems) : undefined,
      },
    });

    res.json(review);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.review.findFirst({
      where: {
        id: req.params.id,
        submission: {
          userId: req.user!.id,
        },
      },
      select: { id: true },
    });

    if (!existing) {
      return res.status(404).json({ error: '复盘记录不存在' });
    }

    await prisma.review.delete({
      where: { id: req.params.id },
    });

    res.json({ message: '复盘记录已删除' });
  } catch (error) {
    next(error);
  }
});

export default router;
