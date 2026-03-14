import { Router } from 'express';
import { parseTagList } from '../lib/problem-utils';
import { prisma } from '../lib/prisma';

const router = Router();
type SubmissionWithProblem = {
  status: string;
  errorType: string | null;
  submittedAt: Date | null;
  createdAt: Date;
  problemId: string;
  problem: {
    title: string;
    difficulty: string;
    tags: string;
  };
};

type ReviewRow = {
  lastReviewedAt: Date | null;
  reviewCount: number;
};

type ProblemWithAcceptedSubmissions = {
  title: string;
  tags: string;
  submissions: Array<{ id: string }>;
};

router.get('/error-analysis', async (req, res, next) => {
  try {
    const { problemId } = req.query;
    const userId = req.user!.id;

    const where: Record<string, any> = { userId };
    if (problemId) {
      where.problemId = String(problemId);
    }

    const [submissions, dueReviewCount, completedReviewRows] = await Promise.all([
      prisma.submission.findMany({
        where,
        include: {
          problem: true,
        },
      }),
      prisma.reviewQueue.count({
        where: {
          userId,
          completed: false,
          nextReviewDate: {
            lte: new Date(),
          },
        },
      }),
      prisma.reviewQueue.findMany({
        where: {
          userId,
          lastReviewedAt: {
            not: null,
          },
        },
        select: {
          lastReviewedAt: true,
          reviewCount: true,
        },
      }),
    ]);

    const errorTypeCount: Record<string, number> = {};
    const statusCount: Record<string, number> = {};
    const difficultyErrorCount: Record<string, number> = {};
    const dailySubmissions: Record<string, number> = {};
    const now = Date.now();
    let last7Submissions = 0;
    let last30Submissions = 0;
    let last7Errors = 0;
    let last30Errors = 0;

    (submissions as SubmissionWithProblem[]).forEach((submission) => {
      statusCount[submission.status] = (statusCount[submission.status] || 0) + 1;

      if (submission.errorType) {
        errorTypeCount[submission.errorType] = (errorTypeCount[submission.errorType] || 0) + 1;
      }

      if (submission.status !== 'ACCEPTED') {
        difficultyErrorCount[submission.problem.difficulty] =
          (difficultyErrorCount[submission.problem.difficulty] || 0) + 1;
      }

      const eventDate = new Date(submission.submittedAt || submission.createdAt);
      const date = eventDate.toISOString().split('T')[0];
      dailySubmissions[date] = (dailySubmissions[date] || 0) + 1;

      const age = now - eventDate.getTime();
      if (age <= 7 * 24 * 60 * 60 * 1000) {
        last7Submissions += 1;
        if (submission.status !== 'ACCEPTED') {
          last7Errors += 1;
        }
      }
      if (age <= 30 * 24 * 60 * 60 * 1000) {
        last30Submissions += 1;
        if (submission.status !== 'ACCEPTED') {
          last30Errors += 1;
        }
      }
    });

    const completedReviewsLast7 = (completedReviewRows as ReviewRow[]).filter((item) => {
      if (!item.lastReviewedAt) return false;
      return now - new Date(item.lastReviewedAt).getTime() <= 7 * 24 * 60 * 60 * 1000;
    }).length;
    const completedReviewsLast30 = (completedReviewRows as ReviewRow[]).filter((item) => {
      if (!item.lastReviewedAt) return false;
      return now - new Date(item.lastReviewedAt).getTime() <= 30 * 24 * 60 * 60 * 1000;
    }).length;

    const total = submissions.length;
    const accepted = (statusCount.ACCEPTED || 0) + (statusCount.OK || 0);
    const passRate = total > 0 ? ((accepted / total) * 100).toFixed(2) : '0';
    const reviewCompletionRate = completedReviewsLast30 + dueReviewCount > 0
      ? ((completedReviewsLast30 / (completedReviewsLast30 + dueReviewCount)) * 100).toFixed(1)
      : '0';

    res.json({
      overview: {
        totalSubmissions: total,
        acceptedCount: accepted,
        passRate: `${passRate}%`,
        errorCount: total - accepted,
        last7Submissions,
        last30Submissions,
        last7Errors,
        last30Errors,
        dueReviewCount,
        completedReviewsLast7,
        completedReviewsLast30,
        reviewCompletionRate: `${reviewCompletionRate}%`,
      },
      errorTypes: Object.entries(errorTypeCount)
        .sort((left, right) => right[1] - left[1])
        .slice(0, 8)
        .map(([type, count]) => ({ type, count })),
      statusDistribution: Object.entries(statusCount).map(([status, count]) => ({
        status,
        count,
      })),
      difficultyErrors: Object.entries(difficultyErrorCount).map(([difficulty, count]) => ({
        difficulty,
        count,
      })),
      trend: Object.entries(dailySubmissions)
        .sort((left, right) => left[0].localeCompare(right[0]))
        .slice(-14)
        .map(([date, count]) => ({ date, count })),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/skill-analysis', async (req, res, next) => {
  try {
    const problems = await prisma.problem.findMany({
      where: { userId: req.user!.id },
      include: {
        submissions: {
          where: { status: 'ACCEPTED' },
          select: { id: true },
        },
      },
    });

    const skillStats: Record<string, { total: number; mastered: number; problems: string[] }> = {};

    (problems as ProblemWithAcceptedSubmissions[]).forEach((problem) => {
      const tags = parseTagList(problem.tags);
      const isMastered = problem.submissions.length > 0;

      tags.forEach((tag) => {
        if (!skillStats[tag]) {
          skillStats[tag] = { total: 0, mastered: 0, problems: [] };
        }
        skillStats[tag].total += 1;
        skillStats[tag].problems.push(problem.title);
        if (isMastered) {
          skillStats[tag].mastered += 1;
        }
      });
    });

    const skills = Object.entries(skillStats)
      .map(([skill, data]) => ({
        skill,
        total: data.total,
        mastered: data.mastered,
        masteryRate: `${((data.mastered / data.total) * 100).toFixed(2)}%`,
        problems: data.problems,
      }))
      .sort((left, right) => parseFloat(left.masteryRate) - parseFloat(right.masteryRate));

    res.json({
      skills,
      weakestSkills: skills.slice(0, 5),
      strongestSkills: [...skills].sort((left, right) => parseFloat(right.masteryRate) - parseFloat(left.masteryRate)).slice(0, 5),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/performance', async (req, res, next) => {
  try {
    const submissions = await prisma.submission.findMany({
      where: { userId: req.user!.id },
      include: {
        problem: true,
      },
      orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
    });

    const typedSubmissions = submissions as SubmissionWithProblem[];
    const recentAccepted = typedSubmissions
      .filter((submission) => submission.status === 'ACCEPTED' || submission.status === 'OK')
      .slice(0, 5)
      .map((submission) => ({
        problemId: submission.problemId,
        problemTitle: submission.problem.title,
        difficulty: submission.problem.difficulty,
        acceptedAt: submission.submittedAt || submission.createdAt,
      }));

    const problemErrorCount: Record<string, { count: number; title: string }> = {};
    const tagErrorCount: Record<string, number> = {};

    typedSubmissions.forEach((submission) => {
      if (submission.status === 'ACCEPTED' || submission.status === 'OK') return;

      if (!problemErrorCount[submission.problemId]) {
        problemErrorCount[submission.problemId] = {
          count: 0,
          title: submission.problem.title,
        };
      }

      problemErrorCount[submission.problemId].count += 1;
      parseTagList(submission.problem.tags).forEach((tag) => {
        tagErrorCount[tag] = (tagErrorCount[tag] || 0) + 1;
      });
    });

    const needReview = Object.entries(problemErrorCount)
      .filter(([, item]) => item.count >= 2)
      .sort((left, right) => right[1].count - left[1].count)
      .slice(0, 5)
      .map(([problemId, item]) => ({
        problemId,
        problemTitle: item.title,
        errorCount: item.count,
      }));

    const topErrorTags = Object.entries(tagErrorCount)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 6)
      .map(([tag, count]) => ({
        tag,
        count,
      }));

    const uniqueDates = [...new Set(typedSubmissions.map((submission) => new Date(submission.submittedAt || submission.createdAt).toISOString().split('T')[0]))].sort() as string[];

    let maxStreak = 0;
    let currentStreak = 0;
    let previousDate: string | null = null;

    uniqueDates.forEach((date: string) => {
      if (!previousDate) {
        currentStreak = 1;
        previousDate = date;
        maxStreak = Math.max(maxStreak, currentStreak);
        return;
      }

      const diff = Math.floor(
        (new Date(date).getTime() - new Date(previousDate).getTime()) / (1000 * 60 * 60 * 24),
      );

      currentStreak = diff === 1 ? currentStreak + 1 : 1;
      previousDate = date;
      maxStreak = Math.max(maxStreak, currentStreak);
    });

    res.json({
      recentAccepted,
      needReview,
      topErrorTags,
      streak: {
        current: currentStreak,
        max: maxStreak,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
