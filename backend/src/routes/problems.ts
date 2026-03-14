import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { normalizeTags, parseTagList } from '../lib/problem-utils';

const router = Router();

function normalizeSourceLabel(value: string) {
  if (value.trim().toLowerCase() === 'codeforces') {
    return 'Codeforces';
  }

  return value.trim();
}

router.get('/', async (req, res, next) => {
  try {
    const {
      difficulty,
      tag,
      search,
      imported,
      source,
      errorType,
      needsReview,
      sort = 'newest',
      page = '1',
      limit = '10',
    } = req.query;
    const userId = req.user!.id;

    const where: Record<string, any> = { userId };
    const normalizedSearch = typeof search === 'string' ? search.trim() : '';
    const normalizedTag = typeof tag === 'string' ? tag.trim() : '';
    const normalizedSource = typeof source === 'string' ? source.trim() : '';
    const normalizedErrorType = typeof errorType === 'string' ? errorType.trim() : '';
    const parsedPage = Math.max(1, Number.parseInt(String(page), 10) || 1);
    const parsedLimit = Math.min(50, Math.max(1, Number.parseInt(String(limit), 10) || 10));

    if (difficulty) {
      where.difficulty = String(difficulty);
    }

    if (normalizedTag) {
      where.tags = { contains: normalizedTag };
    }

    if (normalizedSource) {
      where.OR = [
        ...(where.OR || []),
        { source: { contains: normalizedSource } },
        { provider: { contains: normalizedSource.toUpperCase() } },
      ];
    }

    if (typeof imported === 'string' && imported.length > 0) {
      where.imported = imported === 'true';
    }

    if (normalizedErrorType) {
      where.submissions = {
        some: {
          errorType: {
            contains: normalizedErrorType,
          },
        },
      };
    }

    if (typeof needsReview === 'string' && needsReview.length > 0) {
      where.reviewQueue = needsReview === 'true'
        ? {
            some: {
              userId,
              completed: false,
            },
          }
        : {
            none: {
              userId,
              completed: false,
            },
          };
    }

    if (normalizedSearch) {
      const searchFilters = [
        { title: { contains: normalizedSearch } },
        { source: { contains: normalizedSearch } },
        { tags: { contains: normalizedSearch } },
        { description: { contains: normalizedSearch } },
      ];
      where.AND = [...(where.AND || []), { OR: searchFilters }];
    }

    const baseInclude = {
      _count: {
        select: { submissions: true },
      },
      submissions: {
        orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
        take: 1,
        select: {
          submittedAt: true,
          createdAt: true,
          errorType: true,
          status: true,
        },
      },
      reviewQueue: {
        where: { userId, completed: false },
        orderBy: { nextReviewDate: 'asc' as const },
        take: 1,
        select: {
          nextReviewDate: true,
          priority: true,
        },
      },
    };

    const sortMode = typeof sort === 'string' ? sort : 'newest';
    const requiresInMemorySort = ['recent_submission', 'most_errors', 'needs_review'].includes(sortMode);

    const [tagSource, sourceRows, errorTypeRows] = await Promise.all([
      prisma.problem.findMany({
        where: { userId },
        select: { tags: true },
      }),
      prisma.problem.findMany({
        where: { userId },
        select: { source: true, provider: true },
      }),
      prisma.submission.findMany({
        where: { userId, errorType: { not: null } },
        select: { errorType: true },
      }),
    ]);

    const availableTags = [...new Set(tagSource.flatMap((item: { tags: string }) => parseTagList(item.tags)))].sort();
    const availableSources = [...new Set(
      sourceRows.flatMap((item: { source: string | null; provider: string | null }) =>
        [item.source, item.provider]
          .filter(Boolean)
          .map((value) => normalizeSourceLabel(String(value))),
      ),
    )].sort();
    const availableErrorTypes = [...new Set(errorTypeRows.map((item: { errorType: string | null }) => item.errorType).filter(Boolean) as string[])].sort();

    if (requiresInMemorySort) {
      const allProblems = await prisma.problem.findMany({
        where,
        include: baseInclude,
      });

      const sorted = [...allProblems].sort((left, right) => {
        if (sortMode === 'recent_submission') {
          const leftTime = new Date(left.submissions[0]?.submittedAt || left.submissions[0]?.createdAt || left.createdAt).getTime();
          const rightTime = new Date(right.submissions[0]?.submittedAt || right.submissions[0]?.createdAt || right.createdAt).getTime();
          return rightTime - leftTime;
        }

        if (sortMode === 'most_errors') {
          return (right._count?.submissions || 0) - (left._count?.submissions || 0);
        }

        const leftDue = left.reviewQueue[0]?.nextReviewDate ? new Date(left.reviewQueue[0].nextReviewDate).getTime() : Number.MAX_SAFE_INTEGER;
        const rightDue = right.reviewQueue[0]?.nextReviewDate ? new Date(right.reviewQueue[0].nextReviewDate).getTime() : Number.MAX_SAFE_INTEGER;
        return leftDue - rightDue;
      });

      const total = sorted.length;
      const paged = sorted.slice((parsedPage - 1) * parsedLimit, parsedPage * parsedLimit);

      return res.json({
        data: paged,
        pagination: {
          page: parsedPage,
          limit: parsedLimit,
          total,
          totalPages: Math.ceil(total / parsedLimit) || 1,
        },
        filters: {
          difficulty: difficulty || '',
          tag: normalizedTag,
          search: normalizedSearch,
          imported: typeof imported === 'string' ? imported : '',
          source: normalizedSource,
          errorType: normalizedErrorType,
          needsReview: typeof needsReview === 'string' ? needsReview : '',
          sort: sortMode,
          availableTags,
          availableSources,
          availableErrorTypes,
        },
      });
    }

    const orderBy =
      sortMode === 'oldest'
        ? { createdAt: 'asc' as const }
        : sortMode === 'title'
          ? { title: 'asc' as const }
          : { createdAt: 'desc' as const };

    const skip = (parsedPage - 1) * parsedLimit;

    const [problems, total] = await Promise.all([
      prisma.problem.findMany({
        where,
        skip,
        take: parsedLimit,
        orderBy,
        include: baseInclude,
      }),
      prisma.problem.count({ where }),
    ]);

    res.json({
      data: problems,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        totalPages: Math.ceil(total / parsedLimit) || 1,
      },
      filters: {
        difficulty: difficulty || '',
        tag: normalizedTag,
        search: normalizedSearch,
        imported: typeof imported === 'string' ? imported : '',
        source: normalizedSource,
        errorType: normalizedErrorType,
        needsReview: typeof needsReview === 'string' ? needsReview : '',
        sort: sortMode,
        availableTags,
        availableSources,
        availableErrorTypes,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/search/:keyword', async (req, res, next) => {
  try {
    const { keyword } = req.params;
    const userId = req.user!.id;

    const problems = await prisma.problem.findMany({
      where: {
        userId,
        OR: [
          { title: { contains: keyword } },
          { description: { contains: keyword } },
          { tags: { contains: keyword } },
          { source: { contains: keyword } },
        ],
      },
      include: {
        _count: {
          select: { submissions: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(problems);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const problem = await prisma.problem.findFirst({
      where: {
        id: req.params.id,
        userId: req.user!.id,
      },
      include: {
        submissions: {
          orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
          take: 50,
          include: {
            review: true,
          },
        },
        reviewQueue: {
          where: { completed: false },
          orderBy: { nextReviewDate: 'asc' },
        },
      },
    });

    if (!problem) {
      return res.status(404).json({ error: '题目不存在' });
    }

    res.json(problem);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { title, description, source, url, difficulty, tags } = req.body;
    const userId = req.user!.id;

    if (!title || !description || !difficulty) {
      return res.status(400).json({ error: '标题、描述和难度为必填项' });
    }

    const normalizedTags = normalizeTags(tags);

    const problem = await prisma.problem.create({
      data: {
        userId,
        title: String(title).trim(),
        description: String(description).trim(),
        source: source ? String(source).trim() : null,
        url: url ? String(url).trim() : null,
        difficulty: String(difficulty),
        tags: normalizedTags,
      },
    });

    await prisma.problemSearch.create({
      data: {
        userId,
        problemId: problem.id,
        title: problem.title,
        description: problem.description,
        tags: problem.tags,
        source: problem.source,
      },
    });

    res.status(201).json(problem);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const existing = await prisma.problem.findFirst({
      where: { id: req.params.id, userId },
      select: { id: true },
    });

    if (!existing) {
      return res.status(404).json({ error: '题目不存在' });
    }

    const { title, description, source, url, difficulty, tags } = req.body;
    const normalizedTags = typeof tags !== 'undefined' ? normalizeTags(tags) : undefined;

    const problem = await prisma.problem.update({
      where: { id: req.params.id },
      data: {
        title: typeof title === 'string' ? title.trim() : undefined,
        description: typeof description === 'string' ? description.trim() : undefined,
        source: typeof source === 'string' ? source.trim() : source,
        url: typeof url === 'string' ? url.trim() : url,
        difficulty: typeof difficulty === 'string' ? difficulty : undefined,
        tags: normalizedTags,
      },
    });

    await prisma.problemSearch.upsert({
      where: { problemId: problem.id },
      update: {
        userId,
        title: problem.title,
        description: problem.description,
        tags: problem.tags,
        source: problem.source,
      },
      create: {
        userId,
        problemId: problem.id,
        title: problem.title,
        description: problem.description,
        tags: problem.tags,
        source: problem.source,
      },
    });

    res.json(problem);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const existing = await prisma.problem.findFirst({
      where: { id: req.params.id, userId },
      select: { id: true },
    });

    if (!existing) {
      return res.status(404).json({ error: '题目不存在' });
    }

    await prisma.problem.delete({
      where: { id: req.params.id },
    });

    res.json({ message: '题目已删除' });
  } catch (error) {
    next(error);
  }
});

export default router;
