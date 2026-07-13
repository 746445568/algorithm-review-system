import { error as logError } from "./logger.js";

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
    } catch (error) {
      logError("响应体不是有效 JSON，保留原始 HTTP 状态消息", "api", error);
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function normalizeReviewPayload(payload) {
  return {
    status: payload?.status || "TODO",
    notes: payload?.notes || "",
    nextReviewAt: payload?.nextReviewAt || null,
  };
}

export const api = {
  setBaseUrl: (nextBase) => {
    apiBase = normalizeApiBase(nextBase);
  },
  getBaseUrl: () => apiBase,
  getHealth: () => request("/health"),
  getJudges: () => request("/api/system/judges"),
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
  getSyncStatus: () => request("/api/sync/status"),
  getReviewSummary: () => request("/api/review/summary"),
  getReviewRecommendation: (exclude) =>
    request(withQuery("/api/review/recommendations", { exclude })),
  getReviewState: (problemId) => request(`/api/review/items/${problemId}`),
  saveReviewState: async (problemId, payload) => {
    const normalizedProblemId = Number(problemId);
    if (!Number.isFinite(normalizedProblemId) || normalizedProblemId <= 0) {
      throw new Error("invalid problem id");
    }

    return request(`/api/review/items/${normalizedProblemId}`, {
      method: "PUT",
      body: JSON.stringify(normalizeReviewPayload(payload)),
    });
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

  getContests: (query = {}) => request(withQuery("/api/contests", query)),
  syncContests: () => request("/api/contests/sync", { method: "POST", body: JSON.stringify({}) }),
  syncProblemPool: (platforms) =>
    request("/api/problem-pool/sync", {
      method: "POST",
      body: JSON.stringify(platforms?.length ? { platforms } : {}),
    }),
  getGoals: () => request("/api/goals"),
  createGoal: (payload) => request("/api/goals", { method: "POST", body: JSON.stringify(payload) }),
  deleteGoal: (id) => request(`/api/goals/${id}`, { method: "DELETE" }),
  refreshRating: (accountId) =>
    request(`/api/accounts/${accountId}/refresh-rating`, { method: "POST", body: JSON.stringify({}) }),
  getSubmissionStats: () => request("/api/statistics/submissions"),
  getReviewStats: () => request("/api/statistics/reviews"),
  getVerdictStats: () => request("/api/statistics/verdicts"),
  getRadarData: () => request("/api/statistics/radar"),
  getKnowledgeGraph: () => request("/api/knowledge-graph"),
  syncKnowledgeGraph: () =>
    request("/api/knowledge-graph/sync", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  getLanguage: () => request("/api/settings/language"),
  saveLanguage: (language) =>
    request("/api/settings/language", {
      method: "PUT",
      body: JSON.stringify({ language }),
    }),
  getReviewCalendar: (month) => request(withQuery("/api/review/calendar", { month })),

  getProblemChats: (problemId) => request(`/api/problems/${problemId}/chats`),
  sendProblemChat: (problemId, message, opts = {}) =>
    request(`/api/problems/${problemId}/chats`, {
      method: "POST",
      body: JSON.stringify({ message, mode: opts.mode || "direct" }),
    }),
  clearProblemChats: (problemId) =>
    request(`/api/problems/${problemId}/chats`, { method: "DELETE" }),
  getProblemAnalysisHistory: (problemId) =>
    request(`/api/analysis/problem/${problemId}/history`),
  getErrorPatternStats: () => request('/api/error-patterns/stats'),
  getErrorPatternsByProblem: (problemId) =>
    request(`/api/error-patterns/problem/${problemId}`),
  getRatingHistory: (accountId) => request(`/api/accounts/${accountId}/rating-history`),
  refreshRatingHistory: (accountId) => request(`/api/accounts/${accountId}/rating-history/refresh`, { method: "POST" }),

  getProblems: (query = {}) => request(withQuery("/api/problems", query)),
  getSubmissions: (query = {}) => request(withQuery("/api/submissions", query)),
};
