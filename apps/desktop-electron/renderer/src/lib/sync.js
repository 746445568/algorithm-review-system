import {
  getSyncQueue,
  markCollectionSyncAttempt,
  markCollectionSynced,
  removeFromSyncQueue,
  saveAccounts,
  saveProblems,
  saveReviewState,
  saveSubmissions,
  updateSyncQueueOperation,
} from "./db.js";

import { DEFAULT_BASE_URL, buildUrl, normalizeBaseUrl, requestJson } from "./http.js";

const DEFAULT_PAGE_SIZE = 200;

let apiBase = DEFAULT_BASE_URL;
let autoSyncTimerId = null;

function request(pathOrUrl, options = {}) {
  return requestJson(apiBase, pathOrUrl, options);
}

async function fetchPagedCollection(path, pageSize = DEFAULT_PAGE_SIZE) {
  const items = [];
  let offset = 0;

  while (true) {
    const page = await request(buildUrl(apiBase, path, { limit: pageSize, offset }));
    if (!Array.isArray(page) || page.length === 0) {
      break;
    }

    items.push(...page);
    if (page.length < pageSize) {
      break;
    }

    offset += pageSize;
  }

  return items;
}

async function syncCollection(entity, fetcher, saver) {
  const attemptAt = new Date().toISOString();
  await markCollectionSyncAttempt(entity, {
    lastFetchAttemptAt: attemptAt,
    source: "sync-all",
    stale: true,
    lastError: null,
  });

  try {
    const rows = await fetcher();
    await saver(rows);
    await markCollectionSynced(entity, {
      lastSyncedAt: new Date().toISOString(),
      lastFetchAttemptAt: attemptAt,
      source: "sync-all",
      stale: false,
      lastError: null,
    });
    return rows;
  } catch (error) {
    await markCollectionSyncAttempt(entity, {
      lastFetchAttemptAt: attemptAt,
      source: "sync-all",
      stale: true,
      lastError: error?.message || "同步失败",
    });
    throw error;
  }
}

/**
 * Updates the backend base URL used by sync operations.
 *
 * @param {string} nextBase
 */
export function setSyncBaseUrl(nextBase) {
  apiBase = normalizeBaseUrl(nextBase);
}

/**
 * Checks network and backend availability using the health endpoint.
 *
 * @returns {Promise<boolean>}
 */
export async function isOnline() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return false;
  }

  try {
    await request("/health", { method: "GET" });
    return true;
  } catch {
    return false;
  }
}

export function getConnectivityStatus() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return Promise.resolve({ isOnline: false, reason: "offline" });
  }

  return request("/health", { method: "GET" })
    .then(() => ({ isOnline: true, reason: "online" }))
    .catch((error) => ({
      isOnline: false,
      reason: "service-unreachable",
      errorMessage: error?.message || "服务不可达",
    }));
}


export async function checkOnline() {
  const result = await getConnectivityStatus();
  return result.isOnline;
}

/**
 * Fetches all problems from backend and updates IndexedDB cache.
 *
 * @returns {Promise<Array<Record<string, any>>>}
 */
export async function syncProblems() {
  return syncCollection("problems", () => fetchPagedCollection("/api/problems"), saveProblems);
}

/**
 * Fetches all submissions from backend and updates IndexedDB cache.
 *
 * @returns {Promise<Array<Record<string, any>>>}
 */
export async function syncSubmissions() {
  return syncCollection(
    "submissions",
    () => fetchPagedCollection("/api/submissions"),
    saveSubmissions
  );
}

/**
 * Fetches all accounts from backend and updates IndexedDB cache.
 *
 * @returns {Promise<Array<Record<string, any>>>}
 */
export async function syncAccounts() {
  return syncCollection(
    "accounts",
    async () => {
      const accounts = await request("/api/accounts");
      return Array.isArray(accounts) ? accounts : [];
    },
    saveAccounts
  );
}

/**
 * Fetches review summary and stores each problem review state in cache.
 *
 * @returns {Promise<Array<Record<string, any>>>}
 */
export async function syncReviewStates() {
  return syncCollection(
    "reviewStates",
    async () => {
      const summary = await request("/api/review/summary");
      const summaries = Array.isArray(summary?.problemSummaries) ? summary.problemSummaries : [];
      const saved = [];

      for (const item of summaries) {
        const problemId = Number(item.problemId);
        if (!Number.isFinite(problemId) || problemId <= 0) {
          continue;
        }

        try {
          const fullState = await request(`/api/review/items/${problemId}`);
          const state = await saveReviewState(fullState);
          if (state) {
            saved.push(state);
          }
          continue;
        } catch {}

        const state = await saveReviewState({
          problemId,
          status: item.reviewStatus || "TODO",
          notes: "",
          nextReviewAt: item.nextReviewAt || null,
          lastUpdatedAt: item.lastReviewUpdatedAt || new Date().toISOString(),
        });
        if (state) {
          saved.push(state);
        }
      }

      return saved;
    },
    async () => {}
  );
}

/**
 * Performs a full backend-to-cache synchronization cycle.
 *
 * @returns {Promise<Record<string, any>>}
 */
export async function syncAll() {
  const connectivity = await getConnectivityStatus();
  if (!connectivity.isOnline) {
    return {
      isOnline: false,
      reason: connectivity.reason,
      problems: [],
      submissions: [],
      accounts: [],
      reviewStates: [],
    };
  }

  const [problems, submissions, accounts, reviewStates] = await Promise.all([
    syncProblems(),
    syncSubmissions(),
    syncAccounts(),
    syncReviewStates(),
  ]);

  return {
    isOnline: true,
    reason: connectivity.reason,
    problems,
    submissions,
    accounts,
    reviewStates,
  };
}

async function processQueueOperation(operation) {
  const method = operation?.method || "POST";
  const path = operation?.path;
  if (!path) {
    throw new Error("sync queue operation is missing path");
  }

  const result = await request(path, {
    method,
    body: operation?.payload ? JSON.stringify(operation.payload) : undefined,
  });

  if (operation.type === "saveReviewState" && result?.problemId) {
    await saveReviewState(result);
    await markCollectionSynced("reviewStates", {
      source: "queue-flush",
      stale: false,
    });
  }

  return result;
}

/**
 * Flushes queued offline operations when the backend is reachable.
 *
 * @returns {Promise<Record<string, any>>}
 */
export async function processSyncQueue() {
  const connectivity = await getConnectivityStatus();
  if (!connectivity.isOnline) {
    return {
      isOnline: false,
      reason: connectivity.reason,
      processedCount: 0,
      failedCount: 0,
    };
  }

  const queue = await getSyncQueue();
  let processedCount = 0;
  let failedCount = 0;

  for (const operation of queue) {
    try {
      await processQueueOperation(operation);
      await removeFromSyncQueue(operation.id);
      processedCount += 1;
    } catch (error) {
      failedCount += 1;
      await updateSyncQueueOperation(operation.id, {
        retryCount: Number(operation?.retryCount || 0) + 1,
        lastTriedAt: new Date().toISOString(),
        lastError: error?.message || "同步失败",
      });
    }
  }

  return {
    isOnline: true,
    reason: connectivity.reason,
    processedCount,
    failedCount,
  };
}

/**
 * Starts periodic sync and returns a cleanup function.
 *
 * @param {number} intervalMinutes
 * @returns {() => void}
 */
export function setupAutoSync(intervalMinutes = 5) {
  if (autoSyncTimerId) {
    window.clearInterval(autoSyncTimerId);
    autoSyncTimerId = null;
  }

  const minutes = Number.isFinite(Number(intervalMinutes))
    ? Math.max(1, Number(intervalMinutes))
    : 5;
  const intervalMs = minutes * 60 * 1000;

  autoSyncTimerId = window.setInterval(() => {
    void (async () => {
      try {
        await processSyncQueue();
        await syncAll();
      } catch {}
    })();
  }, intervalMs);

  return () => {
    if (autoSyncTimerId) {
      window.clearInterval(autoSyncTimerId);
      autoSyncTimerId = null;
    }
  };
}
