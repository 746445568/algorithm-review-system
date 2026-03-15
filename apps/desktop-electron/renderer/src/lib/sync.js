import {
  getSyncQueue,
  removeFromSyncQueue,
  saveAccounts,
  saveProblems,
  saveReviewState,
  saveSubmissions,
} from "./db.js";

const DEFAULT_API_BASE = "http://127.0.0.1:38473";
const REQUEST_TIMEOUT_MS = 10000;
const DEFAULT_PAGE_SIZE = 200;

let apiBase = DEFAULT_API_BASE;
let autoSyncTimerId = null;

function normalizeApiBase(nextBase) {
  if (!nextBase) {
    return DEFAULT_API_BASE;
  }

  return nextBase.endsWith("/") ? nextBase.slice(0, -1) : nextBase;
}

function buildUrl(path, query = {}) {
  const url = new URL(path, apiBase);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function request(pathOrUrl, options = {}) {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${apiBase}${pathOrUrl}`;
  const timeoutController = new AbortController();
  const timeoutId = window.setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeoutController.signal])
    : timeoutController.signal;

  let response;
  try {
    response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
      ...options,
      signal,
    });
  } catch (error) {
    if (timeoutController.signal.aborted && !options.signal?.aborted) {
      throw new Error(`request timed out after ${REQUEST_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      message = body.error ?? message;
    } catch {}
    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function fetchPagedCollection(path, pageSize = DEFAULT_PAGE_SIZE) {
  const items = [];
  let offset = 0;

  while (true) {
    const page = await request(buildUrl(path, { limit: pageSize, offset }));
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

/**
 * Updates the backend base URL used by sync operations.
 *
 * @param {string} nextBase
 */
export function setSyncBaseUrl(nextBase) {
  apiBase = normalizeApiBase(nextBase);
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

/**
 * Fetches all problems from backend and updates IndexedDB cache.
 *
 * @returns {Promise<Array<Record<string, any>>>}
 */
export async function syncProblems() {
  const problems = await fetchPagedCollection("/api/problems");
  await saveProblems(problems);
  return problems;
}

/**
 * Fetches all submissions from backend and updates IndexedDB cache.
 *
 * @returns {Promise<Array<Record<string, any>>>}
 */
export async function syncSubmissions() {
  const submissions = await fetchPagedCollection("/api/submissions");
  await saveSubmissions(submissions);
  return submissions;
}

/**
 * Fetches all accounts from backend and updates IndexedDB cache.
 *
 * @returns {Promise<Array<Record<string, any>>>}
 */
export async function syncAccounts() {
  const accounts = await request("/api/accounts");
  const rows = Array.isArray(accounts) ? accounts : [];
  await saveAccounts(rows);
  return rows;
}

/**
 * Fetches review summary and stores each problem review state in cache.
 *
 * @returns {Promise<Array<Record<string, any>>>}
 */
export async function syncReviewStates() {
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
}

/**
 * Performs a full backend-to-cache synchronization cycle.
 *
 * @returns {Promise<Record<string, any>>}
 */
export async function syncAll() {
  const online = await isOnline();
  if (!online) {
    return {
      isOnline: false,
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
  }

  return result;
}

/**
 * Flushes queued offline operations when the backend is reachable.
 *
 * @returns {Promise<Record<string, any>>}
 */
export async function processSyncQueue() {
  const online = await isOnline();
  if (!online) {
    return {
      isOnline: false,
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
    } catch {
      failedCount += 1;
    }
  }

  return {
    isOnline: true,
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
