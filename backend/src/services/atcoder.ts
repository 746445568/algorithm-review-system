import { prisma } from '../lib/prisma';

const API_BASE = 'https://kenkoooo.com/atcoder';
const SUBMISSIONS_PATH = '/atcoder-api/v3/user/submissions';
const PROBLEMS_URL = 'https://kenkoooo.com/atcoder/resources/problems.json';
const PROVIDER = 'ATCODER';
const MAX_SYNC_PAGES = 10;
const PAGE_SIZE = 500;
const activeSyncs = new Set<string>();

type AtCoderSubmission = {
  id: number;
  epoch_second: number;
  problem_id: string;
  contest_id: string;
  user_id: string;
  language: string;
  point: number;
  length: number;
  result: string;
  execution_time: number;
};

type AtCoderProblem = {
  id: string;
  title: string;
  contest_id: string;
};

type SyncOptions = {
  full?: boolean;
};

let cachedProblems: Map<string, AtCoderProblem> | null = null;

function mapVerdict(result: string): string {
  const upper = result.trim().toUpperCase();
  switch (upper) {
    case 'AC': return 'ACCEPTED';
    case 'WA': return 'WRONG_ANSWER';
    case 'TLE': return 'TIME_LIMIT_EXCEEDED';
    case 'MLE': return 'MEMORY_LIMIT_EXCEEDED';
    case 'RE': return 'RUNTIME_ERROR';
    case 'CE': return 'COMPILATION_ERROR';
    case 'OLE': return 'OUTPUT_LIMIT_EXCEEDED';
    case 'IE': return 'INTERNAL_ERROR';
    default: return upper || 'UNKNOWN';
  }
}

function buildProblemUrl(contestId: string, problemId: string): string {
  if (!contestId || !problemId) return 'https://atcoder.jp';
  return `https://atcoder.jp/contests/${contestId}/tasks/${problemId}`;
}

function buildPlaceholderDescription(
  submission: AtCoderSubmission,
  problemTitle?: string,
): string {
  const parts = [
    `# ${problemTitle || `AtCoder ${submission.problem_id}`}`,
    '',
    '这是从 AtCoder 自动导入的错题记录。当前版本不会抓取完整题面，请点击原题链接查看。',
    '',
    `- Contest: ${submission.contest_id || '未知'}`,
    `- Problem: ${submission.problem_id || '未知'}`,
    `- Verdict: ${submission.result || 'UNKNOWN'}`,
    `- Language: ${submission.language || 'Unknown'}`,
  ];
  return parts.join('\n');
}

async function fetchProblems(): Promise<Map<string, AtCoderProblem>> {
  if (cachedProblems) return cachedProblems;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(PROBLEMS_URL, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`AtCoder 题目列表请求失败：${response.status}`);
    }
    const items = (await response.json()) as AtCoderProblem[];
    const map = new Map<string, AtCoderProblem>();
    for (const item of items) {
      map.set(item.id, item);
    }
    cachedProblems = map;
    return map;
  } finally {
    clearTimeout(timeout);
  }
}

export async function validateAtCoderHandle(handle: string): Promise<void> {
  const trimmed = handle.trim();
  if (!trimmed) throw new Error('AtCoder handle 不能为空');

  const url = `${API_BASE}${SUBMISSIONS_PATH}?user=${encodeURIComponent(trimmed)}&from_second=${Math.floor(Date.now() / 1000)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`AtCoder 账号验证失败：${response.status}`);
    }
    // API returns an array; if it doesn't error out, the handle is valid
    await response.json();
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('AtCoder API 请求超时，请稍后重试');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export async function linkAtCoderAccount(userId: string, handle: string) {
  const trimmed = handle.trim();
  await validateAtCoderHandle(trimmed);

  await prisma.externalAccount.upsert({
    where: {
      userId_provider: {
        userId,
        provider: PROVIDER,
      },
    },
    update: {
      handle: trimmed,
      providerUserId: trimmed,
    },
    create: {
      userId,
      provider: PROVIDER,
      providerUserId: trimmed,
      handle: trimmed,
    },
  });

  return { handle: trimmed };
}

export async function unlinkAtCoderAccount(userId: string) {
  const account = await prisma.externalAccount.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: PROVIDER,
      },
    },
  });

  if (!account) {
    throw new Error('当前账号未绑定 AtCoder');
  }

  await prisma.externalAccount.delete({
    where: { id: account.id },
  });
}

async function fetchAtCoderSubmissions(
  handle: string,
  lastSyncedAt?: Date | null,
): Promise<AtCoderSubmission[]> {
  const collected: AtCoderSubmission[] = [];
  let fromSecond = lastSyncedAt ? Math.floor(lastSyncedAt.getTime() / 1000) + 1 : 0;

  for (let page = 0; page < MAX_SYNC_PAGES; page += 1) {
    const url = `${API_BASE}${SUBMISSIONS_PATH}?user=${encodeURIComponent(handle)}&from_second=${fromSecond}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } catch (err: any) {
      clearTimeout(timeout);
      if (err?.name === 'AbortError') {
        throw new Error('AtCoder API 请求超时，请稍后重试');
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(`AtCoder 提交同步失败：${response.status}`);
    }

    const items = (await response.json()) as AtCoderSubmission[];
    if (items.length === 0) break;

    collected.push(...items);

    // The API returns submissions sorted by epoch_second ascending.
    // Update cursor to continue from after the latest one.
    let maxEpoch = fromSecond;
    for (const item of items) {
      if (item.epoch_second > maxEpoch) {
        maxEpoch = item.epoch_second;
      }
    }
    fromSecond = maxEpoch + 1;

    if (items.length < PAGE_SIZE) break;
  }

  return collected;
}

export async function syncAtCoderForUser(userId: string, options: SyncOptions = {}) {
  const account = await prisma.externalAccount.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: PROVIDER,
      },
    },
  });

  if (!account) {
    throw new Error('当前账号未绑定 AtCoder');
  }

  if (activeSyncs.has(userId + ':atcoder')) {
    const conflictError = new Error('已有 AtCoder 同步任务正在运行，请稍后重试');
    (conflictError as Error & { status?: number }).status = 409;
    throw conflictError;
  }

  activeSyncs.add(userId + ':atcoder');
  const startedAt = Date.now();

  try {
    await prisma.externalAccount.update({
      where: { id: account.id },
      data: {
        lastSyncStatus: 'syncing',
        lastSyncAttemptAt: new Date(),
        lastSyncError: null,
      },
    });

    const submissions = await fetchAtCoderSubmissions(
      account.handle,
      options.full ? null : account.lastSyncedAt,
    );

    // Pre-fetch problem metadata
    let problems: Map<string, AtCoderProblem>;
    try {
      problems = await fetchProblems();
    } catch {
      problems = new Map();
    }

    let importedProblems = 0;
    let importedSubmissions = 0;
    let latestSeenAt = account.lastSyncedAt || null;

    for (const item of submissions) {
      const submittedAt = new Date(item.epoch_second * 1000);
      if (!latestSeenAt || submittedAt > latestSeenAt) {
        latestSeenAt = submittedAt;
      }

      // Only import non-AC submissions
      if (item.result === 'AC') continue;

      const problemKey = item.problem_id;
      const problemMeta = problems.get(item.problem_id);
      const externalUrl = buildProblemUrl(item.contest_id, item.problem_id);

      let problem = await prisma.problem.findFirst({
        where: {
          userId,
          provider: PROVIDER,
          externalProblemKey: problemKey,
        },
      });

      if (!problem) {
        problem = await prisma.problem.create({
          data: {
            userId,
            title: problemMeta?.title || `AtCoder ${problemKey}`,
            description: buildPlaceholderDescription(item, problemMeta?.title),
            source: 'AtCoder',
            difficulty: 'MEDIUM',
            tags: 'atcoder',
            provider: PROVIDER,
            externalProblemKey: problemKey,
            contestId: null,
            problemIndex: null,
            externalUrl,
            url: externalUrl,
            imported: true,
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

        importedProblems += 1;
      }

      const existingSubmission = await prisma.submission.findUnique({
        where: { externalSubmissionId: String(item.id) },
        select: { id: true },
      });

      if (existingSubmission) continue;

      const verdict = mapVerdict(item.result);

      await prisma.submission.create({
        data: {
          userId,
          problemId: problem.id,
          code: null,
          language: item.language || 'Unknown',
          status: verdict,
          errorMessage: `AtCoder verdict: ${item.result}`,
          errorType: verdict,
          runtime: item.execution_time > 0 ? item.execution_time : null,
          memory: null,
          externalSubmissionId: String(item.id),
          submittedAt,
          createdAt: submittedAt,
        },
      });

      importedSubmissions += 1;
    }

    const syncTime = latestSeenAt || new Date();
    await prisma.externalAccount.update({
      where: { id: account.id },
      data: {
        lastSyncedAt: syncTime,
        lastSuccessfulSyncAt: new Date(),
        lastSyncStatus: 'success',
        lastSyncError: null,
        lastImportedProblems: importedProblems,
        lastImportedSubmissions: importedSubmissions,
        lastSyncDurationMs: Date.now() - startedAt,
      },
    });

    return {
      handle: account.handle,
      importedProblems,
      importedSubmissions,
      lastSyncedAt: syncTime,
      fullSync: Boolean(options.full),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '同步失败';
    await prisma.externalAccount.update({
      where: { id: account.id },
      data: {
        lastSyncStatus: 'failed',
        lastSyncError: message.slice(0, 1000),
        lastSyncDurationMs: Date.now() - startedAt,
      },
    });
    throw error;
  } finally {
    activeSyncs.delete(userId + ':atcoder');
  }
}

export async function getAtCoderSyncStatus(userId: string) {
  const account = await prisma.externalAccount.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: PROVIDER,
      },
    },
  });

  if (!account) return null;

  const [problemCount, submissionCount] = await Promise.all([
    prisma.problem.count({
      where: { userId, provider: PROVIDER },
    }),
    prisma.submission.count({
      where: {
        userId,
        problem: { provider: PROVIDER },
      },
    }),
  ]);

  return {
    provider: PROVIDER,
    handle: account.handle,
    lastSyncedAt: account.lastSyncedAt,
    lastSyncStatus: account.lastSyncStatus,
    lastSyncAttemptAt: account.lastSyncAttemptAt,
    lastSuccessfulSyncAt: account.lastSuccessfulSyncAt,
    lastSyncError: account.lastSyncError,
    lastImportedProblems: account.lastImportedProblems,
    lastImportedSubmissions: account.lastImportedSubmissions,
    lastSyncDurationMs: account.lastSyncDurationMs,
    importedProblemCount: problemCount,
    importedSubmissionCount: submissionCount,
    syncing: activeSyncs.has(userId + ':atcoder'),
  };
}
