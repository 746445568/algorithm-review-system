import { Router } from 'express';
import { withIdempotency } from '../lib/idempotency';
import { prisma } from '../lib/prisma';

const router = Router();

router.get('/problem/:problemId', async (req, res, next) => {
  try {
    const submissions = await prisma.submission.findMany({
      where: {
        problemId: req.params.problemId,
        userId: req.user!.id,
      },
      orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        review: true,
      },
    });

    res.json(submissions);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const submission = await prisma.submission.findFirst({
      where: {
        id: req.params.id,
        userId: req.user!.id,
      },
      include: {
        problem: true,
        review: true,
      },
    });

    if (!submission) {
      return res.status(404).json({ error: '提交记录不存在' });
    }

    res.json(submission);
  } catch (error) {
    next(error);
  }
});

router.post('/', withIdempotency(), async (req, res, next) => {
  try {
    const { problemId, code, language, status, errorMessage, errorType, runtime, memory } = req.body;
    const userId = req.user!.id;

    if (!problemId || !code || !language || !status) {
      return res.status(400).json({ error: '题目 ID、代码、语言和状态为必填项' });
    }

    const problem = await prisma.problem.findFirst({
      where: {
        id: String(problemId),
        userId,
      },
      select: { id: true },
    });

    if (!problem) {
      return res.status(404).json({ error: '对应题目不存在' });
    }

    const normalizedCode = String(code).trim();
    const normalizedLanguage = String(language).trim();
    const normalizedStatus = String(status).trim();

    const duplicate = await prisma.submission.findFirst({
      where: {
        userId,
        problemId: String(problemId),
        code: normalizedCode,
        language: normalizedLanguage,
        status: normalizedStatus,
        createdAt: {
          gte: new Date(Date.now() - 30 * 1000),
        },
      },
      include: {
        problem: true,
        review: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (duplicate) {
      return res.status(200).json({
        ...duplicate,
        deduplicated: true,
      });
    }

    const submission = await prisma.submission.create({
      data: {
        userId,
        problemId: String(problemId),
        code: normalizedCode,
        language: normalizedLanguage,
        status: normalizedStatus,
        errorMessage: errorMessage ? String(errorMessage).trim() : null,
        errorType: errorType ? String(errorType).trim() : null,
        runtime: Number.isFinite(Number(runtime)) ? Number(runtime) : null,
        memory: Number.isFinite(Number(memory)) ? Number(memory) : null,
      },
      include: {
        problem: true,
        review: true,
      },
    });

    res.status(201).json(submission);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.submission.findFirst({
      where: {
        id: req.params.id,
        userId: req.user!.id,
      },
      select: { id: true },
    });

    if (!existing) {
      return res.status(404).json({ error: '提交记录不存在' });
    }

    await prisma.submission.delete({
      where: { id: req.params.id },
    });

    res.json({ message: '提交记录已删除' });
  } catch (error) {
    next(error);
  }
});

export default router;
