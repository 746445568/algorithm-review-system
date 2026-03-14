import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';

const OIDC_ISSUER = 'https://codeforces.com';
const AUTHORIZATION_ENDPOINT = 'https://codeforces.com/oauth/authorize';
const TOKEN_ENDPOINT = 'https://codeforces.com/oauth/token';
const API_BASE = 'https://codeforces.com/api';
const PROVIDER = 'CODEFORCES';
const MAX_SYNC_PAGES = Number(process.env.CODEFORCES_SYNC_MAX_PAGES || 10);
const activeSyncs = new Set<string>();

type TokenResponse = {
  access_token?: string;
  id_token?: string;
};

type CodeforcesClaims = {
  sub: string;
  iss: string;
  aud: string | string[];
  exp: number;
  iat: number;
  nonce?: string;
  handle?: string;
  avatar?: string;
  rating?: number;
};

type CodeforcesSubmission = {
  id: number;
  contestId?: number;
  creationTimeSeconds: number;
  programmingLanguage?: string;
  verdict?: string;
  timeConsumedMillis?: number;
  memoryConsumedBytes?: number;
  problem: {
    contestId?: number;
    index?: string;
    name?: string;
    rating?: number;
    tags?: string[];
  };
};

type SyncOptions = {
  full?: boolean;
};

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`缺少环境变量 ${name}`);
  }
  return value;
}

function getClientConfig() {
  return {
    clientId: getRequiredEnv('CODEFORCES_OIDC_CLIENT_ID'),
    clientSecret: getRequiredEnv('CODEFORCES_OIDC_CLIENT_SECRET'),
    redirectUri: getRequiredEnv('CODEFORCES_OIDC_REDIRECT_URI'),
  };
}

function mapDifficulty(rating?: number) {
  if (!rating || rating <= 1200) return 'EASY';
  if (rating <= 1900) return 'MEDIUM';
  return 'HARD';
}

function buildProblemKey(problem: CodeforcesSubmission['problem']) {
  if (problem.contestId && problem.index) {
    return `${problem.contestId}-${problem.index}`;
  }

  return `unknown-${problem.name || 'problem'}`;
}

function buildProblemUrl(problem: CodeforcesSubmission['problem']) {
  if (problem.contestId && problem.index) {
    return `https://codeforces.com/problemset/problem/${problem.contestId}/${problem.index}`;
  }

  return 'https://codeforces.com/problemset';
}

function buildPlaceholderDescription(submission: CodeforcesSubmission) {
  const problem = submission.problem;
  const parts = [
    `# ${problem.name || 'Codeforces 题目'}`,
    '',
    '这是从 Codeforces 自动导入的错题记录。当前版本不会抓取完整题面，请点击原题链接查看。',
    '',
    `- Contest: ${problem.contestId || '未知'}`,
    `- Index: ${problem.index || '未知'}`,
    `- Verdict: ${submission.verdict || 'UNKNOWN'}`,
    `- Language: ${submission.programmingLanguage || 'Unknown'}`,
  ];

  if (problem.tags?.length) {
    parts.push(`- Tags: ${problem.tags.join(', ')}`);
  }

  return parts.join('\n');
}

async function updateSyncAttempt(accountId: string) {
  await prisma.externalAccount.update({
    where: { id: accountId },
    data: {
      lastSyncStatus: 'syncing',
      lastSyncAttemptAt: new Date(),
      lastSyncError: null,
    },
  });
}

async function updateSyncFailure(accountId: string, startedAt: number, error: unknown) {
  const message = error instanceof Error ? error.message : '同步失败';
  await prisma.externalAccount.update({
    where: { id: accountId },
    data: {
      lastSyncStatus: 'failed',
      lastSyncError: message.slice(0, 1000),
      lastSyncDurationMs: Date.now() - startedAt,
    },
  });
}

async function updateSyncSuccess(accountId: string, data: {
  latestSeenAt: Date | null;
  importedProblems: number;
  importedSubmissions: number;
  startedAt: number;
}) {
  const syncTime = data.latestSeenAt || new Date();
  await prisma.externalAccount.update({
    where: { id: accountId },
    data: {
      lastSyncedAt: syncTime,
      lastSuccessfulSyncAt: new Date(),
      lastSyncStatus: 'success',
      lastSyncError: null,
      lastImportedProblems: data.importedProblems,
      lastImportedSubmissions: data.importedSubmissions,
      lastSyncDurationMs: Date.now() - data.startedAt,
    },
  });
}

async function fetchCodeforcesSubmissions(handle: string, lastSyncedAt?: Date | null) {
  const collected: CodeforcesSubmission[] = [];
  const lastSyncSeconds = lastSyncedAt ? Math.floor(lastSyncedAt.getTime() / 1000) : null;
  let shouldStop = false;

  for (let page = 0; page < MAX_SYNC_PAGES && !shouldStop; page += 1) {
    const from = page * 100 + 1;
    const response = await fetch(`${API_BASE}/user.status?handle=${encodeURIComponent(handle)}&from=${from}&count=100`);
    if (!response.ok) {
      throw new Error(`Codeforces 提交同步失败：${response.status}`);
    }

    const payload = (await response.json()) as { status: string; result?: CodeforcesSubmission[]; comment?: string };
    if (payload.status !== 'OK') {
      throw new Error(payload.comment || 'Codeforces 提交同步失败');
    }

    const items = payload.result || [];
    if (items.length === 0) break;

    for (const submission of items) {
      if (lastSyncSeconds && submission.creationTimeSeconds <= lastSyncSeconds) {
        shouldStop = true;
        break;
      }
      collected.push(submission);
    }

    if (items.length < 100) break;
  }

  return collected;
}

export function createAuthRequest() {
  const { clientId, redirectUri } = getClientConfig();
  const state = crypto.randomBytes(16).toString('hex');
  const nonce = crypto.randomBytes(16).toString('hex');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid',
    state,
    nonce,
  });

  return {
    state,
    nonce,
    url: `${AUTHORIZATION_ENDPOINT}?${params.toString()}`,
  };
}

export async function exchangeCodeForIdentity(code: string, nonce: string) {
  const { clientId, clientSecret, redirectUri } = getClientConfig();
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`Codeforces token 交换失败：${response.status}`);
  }

  const tokens = (await response.json()) as TokenResponse;
  if (!tokens.id_token) {
    throw new Error('Codeforces 未返回 id_token');
  }

  const claims = jwt.verify(tokens.id_token, clientSecret, {
    issuer: OIDC_ISSUER,
    audience: clientId,
    algorithms: ['HS256'],
  }) as CodeforcesClaims;

  if (claims.nonce !== nonce) {
    throw new Error('Codeforces 登录校验失败：nonce 不匹配');
  }

  if (!claims.handle) {
    throw new Error('Codeforces 登录校验失败：缺少 handle');
  }

  return {
    providerUserId: claims.sub,
    handle: claims.handle,
    avatarUrl: claims.avatar || null,
    rating: typeof claims.rating === 'number' ? claims.rating : null,
  };
}

export async function upsertCodeforcesUser(identity: {
  providerUserId: string;
  handle: string;
  avatarUrl: string | null;
  rating: number | null;
}) {
  const existingAccount = await prisma.externalAccount.findUnique({
    where: {
      provider_providerUserId: {
        provider: PROVIDER,
        providerUserId: identity.providerUserId,
      },
    },
    include: { user: true },
  });

  if (existingAccount) {
    const user = await prisma.user.update({
      where: { id: existingAccount.userId },
      data: {
        handle: identity.handle,
        displayName: identity.handle,
        avatarUrl: identity.avatarUrl,
        rating: identity.rating,
      },
    });

    await prisma.externalAccount.update({
      where: { id: existingAccount.id },
      data: {
        handle: identity.handle,
        avatarUrl: identity.avatarUrl,
        rating: identity.rating,
      },
    });

    return user;
  }

  const existingUser = await prisma.user.findUnique({
    where: { handle: identity.handle },
  });

  const user = existingUser
    ? await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          displayName: identity.handle,
          avatarUrl: identity.avatarUrl,
          rating: identity.rating,
        },
      })
    : await prisma.user.create({
        data: {
          handle: identity.handle,
          displayName: identity.handle,
          avatarUrl: identity.avatarUrl,
          rating: identity.rating,
        },
      });

  await prisma.externalAccount.upsert({
    where: {
      userId_provider: {
        userId: user.id,
        provider: PROVIDER,
      },
    },
    update: {
      providerUserId: identity.providerUserId,
      handle: identity.handle,
      avatarUrl: identity.avatarUrl,
      rating: identity.rating,
    },
    create: {
      userId: user.id,
      provider: PROVIDER,
      providerUserId: identity.providerUserId,
      handle: identity.handle,
      avatarUrl: identity.avatarUrl,
      rating: identity.rating,
    },
  });

  return user;
}

export async function syncCodeforcesForUser(userId: string, options: SyncOptions = {}) {
  const account = await prisma.externalAccount.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: PROVIDER,
      },
    },
    include: { user: true },
  });

  if (!account) {
    throw new Error('当前账号未绑定 Codeforces');
  }

  if (activeSyncs.has(userId)) {
    const conflictError = new Error('已有同步任务正在运行，请稍后重试');
    (conflictError as Error & { status?: number }).status = 409;
    throw conflictError;
  }

  activeSyncs.add(userId);
  const startedAt = Date.now();

  try {
    await updateSyncAttempt(account.id);

    const submissions = await fetchCodeforcesSubmissions(account.handle, options.full ? null : account.lastSyncedAt);
    let importedProblems = 0;
    let importedSubmissions = 0;
    let latestSeenAt = options.full ? account.lastSyncedAt || null : account.lastSyncedAt || null;

    for (const item of submissions) {
      const submittedAt = new Date(item.creationTimeSeconds * 1000);
      if (!latestSeenAt || submittedAt > latestSeenAt) {
        latestSeenAt = submittedAt;
      }

      if (!item.verdict || item.verdict === 'OK') {
        continue;
      }

      const problemKey = buildProblemKey(item.problem);
      const tags = item.problem.tags?.join(', ') || 'codeforces';
      const externalUrl = buildProblemUrl(item.problem);

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
            title: item.problem.name || `Codeforces ${problemKey}`,
            description: buildPlaceholderDescription(item),
            source: 'Codeforces',
            difficulty: mapDifficulty(item.problem.rating),
            tags,
            provider: PROVIDER,
            externalProblemKey: problemKey,
            contestId: item.problem.contestId || null,
            problemIndex: item.problem.index || null,
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

      if (existingSubmission) {
        continue;
      }

      await prisma.submission.create({
        data: {
          userId,
          problemId: problem.id,
          code: null,
          language: item.programmingLanguage || 'Unknown',
          status: item.verdict,
          errorMessage: `Codeforces verdict: ${item.verdict}`,
          errorType: item.verdict,
          runtime: Number.isFinite(item.timeConsumedMillis) ? item.timeConsumedMillis : null,
          memory: Number.isFinite(item.memoryConsumedBytes) ? Math.floor((item.memoryConsumedBytes || 0) / 1024) : null,
          externalSubmissionId: String(item.id),
          submittedAt,
          createdAt: submittedAt,
        },
      });

      importedSubmissions += 1;
    }

    await updateSyncSuccess(account.id, {
      latestSeenAt,
      importedProblems,
      importedSubmissions,
      startedAt,
    });

    return {
      handle: account.handle,
      importedProblems,
      importedSubmissions,
      lastSyncedAt: latestSeenAt || new Date(),
      fullSync: Boolean(options.full),
    };
  } catch (error) {
    await updateSyncFailure(account.id, startedAt, error);
    throw error;
  } finally {
    activeSyncs.delete(userId);
  }
}

export async function getCodeforcesSyncStatus(userId: string) {
  const account = await prisma.externalAccount.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: PROVIDER,
      },
    },
  });

  if (!account) {
    return null;
  }

  const [problemCount, submissionCount, dueReviewCount] = await Promise.all([
    prisma.problem.count({
      where: {
        userId,
        provider: PROVIDER,
      },
    }),
    prisma.submission.count({
      where: {
        userId,
        problem: {
          provider: PROVIDER,
        },
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
  ]);

  return {
    provider: PROVIDER,
    handle: account.handle,
    avatarUrl: account.avatarUrl,
    rating: account.rating,
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
    dueReviewCount,
    syncing: activeSyncs.has(userId),
  };
}
