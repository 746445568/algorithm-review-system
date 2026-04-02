import {
  addToSyncQueue,
  getProblems as getCachedProblems,
  getSubmissions as getCachedSubmissions,
  saveProblems as saveCachedProblems,
  saveReviewState as saveCachedReviewState,
  saveSubmissions as saveCachedSubmissions,
} from "./db.js";
import { isOnline as checkOnline, setSyncBaseUrl } from "./sync.js";

const DEFAULT_API_BASE = "http://127.0.0.1:38473";
const REQUEST_TIMEOUT_MS = 10000;
let apiBase = DEFAULT_API_BASE;

function normalizeApiBase(nextBase) {
  if (nextBase === "" || nextBase === null || nextBase === undefined) {
    return "";
  }

  return nextBase.endsWith("/") ? nextBase.slice(0, -1) : nextBase;
}

function withQuery(path, query = {}) {
  const base = apiBase || window.location.origin;
  const url = new URL(path, base);
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

function isNetworkError(error) {
  const message = String(error?.message || "");
  return (
    message.includes("Failed to fetch") ||
    message.includes("NetworkError") ||
    message.includes("request timed out")
  );
}

function normalizeReviewPayload(payload) {
  return {
    status: payload?.status || "TODO",
    notes: payload?.notes || "",
    nextReviewAt: payload?.nextReviewAt || null,
  };
}

async function queueReviewStateSync(problemId, payload) {
  await addToSyncQueue({
    type: "saveReviewState",
    path: `/api/review/items/${problemId}`,
    method: "PUT",
    payload,
  });
}

export const api = {
  setBaseUrl: (nextBase) => {
    apiBase = normalizeApiBase(nextBase);
    setSyncBaseUrl(apiBase);
  },
  getBaseUrl: () => apiBase,
  getOwner: () => request("/api/me"),
  getAccounts: () => request("/api/accounts"),
  createAccount: (platform, handle) =>
    request(`/api/accounts/${platform}`, {
      method: "PUT",
      body: JSON.stringify({ handle }),
    }),
  deleteAccount: (accountId) =>
    request(`/api/accounts/${accountId}`, { method: "DELETE" }),
  syncAccount: (platform, accountId) =>
    request(`/api/accounts/${platform}/sync`, {
      method: "POST",
      body: JSON.stringify({ accountId }),
    }),
  getSyncTasks: () => request("/api/sync-tasks"),
  getReviewSummary: () => request("/api/review/summary"),
  getReviewState: (problemId) => request(`/api/review/items/${problemId}`),
  saveReviewState: async (problemId, payload) => {
    const normalizedProblemId = Number(problemId);
    if (!Number.isFinite(normalizedProblemId) || normalizedProblemId <= 0) {
      throw new Error("invalid problem id");
    }

    const normalizedPayload = normalizeReviewPayload(payload);
    const fallbackLocalState = {
      problemId: normalizedProblemId,
      ...normalizedPayload,
      lastUpdatedAt: new Date().toISOString(),
    };
    const localState = (await saveCachedReviewState(fallbackLocalState)) || fallbackLocalState;

    const online = await checkOnline();
    if (!online) {
      await queueReviewStateSync(normalizedProblemId, normalizedPayload);
      return localState;
    }

    try {
      const saved = await request(`/api/review/items/${normalizedProblemId}`, {
        method: "PUT",
        body: JSON.stringify(normalizedPayload),
      });
      await saveCachedReviewState(saved);
      return saved;
    } catch (error) {
      if (isNetworkError(error)) {
        await queueReviewStateSync(normalizedProblemId, normalizedPayload);
        return localState;
      }
      throw error;
    }
  },
  getAISettings: () => request("/api/settings/ai"),
  saveAISettings: (payload) =>
    request("/api/settings/ai", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  testAISettings: (payload) =>
    request("/api/settings/ai/test", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getThemeSettings: () => request("/api/settings/theme"),
  saveThemeSettings: (mode) =>
    request("/api/settings/theme", {
      method: "PUT",
      body: JSON.stringify({ mode }),
    }),
  exportDiagnostics: () =>
    request("/api/settings/data/export-diagnostics", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  rateReview: (problemId, quality) =>
    request(`/api/review/items/${Number(problemId)}/rate`, {
      method: "POST",
      body: JSON.stringify({ quality }),
    }),
  generateAnalysis: (opts = {}) =>
    request("/api/analysis/generate", {
      method: "POST",
      body: JSON.stringify(opts),
    }),
  getAnalysisTask: (taskId) => request(`/api/analysis/${taskId}`),
  generateComparisonAnalysis: (opts = {}) =>
    request("/api/analysis/generate-comparison", {
      method: "POST",
      body: JSON.stringify(opts),
    }),
  generateProblemAnalysis: (problemId, opts = {}) =>
    request(`/api/analysis/generate-problem/${problemId}`, {
      method: "POST",
      body: JSON.stringify(opts),
    }),
  getLatestAnalysis: () => request("/api/analysis/latest"),

  getProblems: async (query = {}) => {
    const cached = await getCachedProblems(query);
    if (cached.length > 0) {
      return cached;
    }

    try {
      const problems = await request(withQuery("/api/problems", query));
      if (Array.isArray(problems) && problems.length > 0) {
        await saveCachedProblems(problems);
      }
      return Array.isArray(problems) ? problems : [];
    } catch (error) {
      if (isNetworkError(error)) {
        return cached;
      }
      throw error;
    }
  },
  getSubmissions: async (query = {}) => {
    const cached = await getCachedSubmissions(query);
    if (cached.length > 0) {
      return cached;
    }

    try {
      const submissions = await request(withQuery("/api/submissions", query));
      if (Array.isArray(submissions) && submissions.length > 0) {
        await saveCachedSubmissions(submissions);
      }
      return Array.isArray(submissions) ? submissions : [];
    } catch (error) {
      if (isNetworkError(error)) {
        return cached;
      }
      throw error;
    }
  },
};

setSyncBaseUrl(apiBase);
