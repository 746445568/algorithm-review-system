import useSWR from 'swr';

type CurrentUser = {
  id: string;
  handle: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  rating?: number | null;
};

type CodeforcesStatus = {
  provider: 'CODEFORCES';
  handle: string;
  avatarUrl?: string | null;
  rating?: number | null;
  lastSyncedAt?: string | null;
  lastSyncStatus?: 'idle' | 'syncing' | 'success' | 'failed' | string;
  lastSyncAttemptAt?: string | null;
  lastSuccessfulSyncAt?: string | null;
  lastSyncError?: string | null;
  lastImportedProblems?: number;
  lastImportedSubmissions?: number;
  lastSyncDurationMs?: number | null;
  importedProblemCount?: number;
  importedSubmissionCount?: number;
  dueReviewCount?: number;
  syncing?: boolean;
};

type AtCoderStatus = {
  provider: 'ATCODER';
  handle: string;
  lastSyncedAt?: string | null;
  lastSyncStatus?: 'idle' | 'syncing' | 'success' | 'failed' | string;
  lastSyncAttemptAt?: string | null;
  lastSuccessfulSyncAt?: string | null;
  lastSyncError?: string | null;
  lastImportedProblems?: number;
  lastImportedSubmissions?: number;
  lastSyncDurationMs?: number | null;
  importedProblemCount?: number;
  importedSubmissionCount?: number;
  syncing?: boolean;
};

export type AuthMeResponse = {
  user: CurrentUser;
  codeforces: CodeforcesStatus | null;
  atcoder: AtCoderStatus | null;
};

async function authFetcher(url: string): Promise<AuthMeResponse | null> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
    },
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || `请求失败：${response.status}`);
  }

  return response.json();
}

export function useCurrentUser() {
  const { data, error, isLoading, mutate } = useSWR('/api/auth/me', authFetcher, {
    revalidateOnFocus: false,
  });

  return {
    user: data?.user || null,
    codeforces: data?.codeforces || null,
    atcoder: data?.atcoder || null,
    error,
    isLoading,
    mutate,
  };
}
