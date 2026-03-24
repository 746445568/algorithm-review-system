import {
  addToSyncQueue,
  getProblems as getCachedProblems,
  getSubmissions as getCachedSubmissions,
  saveProblems as saveCachedProblems,
  saveReviewState as saveCachedReviewState,
  saveSubmissions as saveCachedSubmissions,
} from "./db.js";
import { DEFAULT_BASE_URL, buildUrl, isNetworkError, normalizeBaseUrl, requestJson } from "./http.js";
import { isOnline as checkOnline, setSyncBaseUrl } from "./sync.js";

let apiBase = DEFAULT_BASE_URL;

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

function request(pathOrUrl, options = {}) {
  return requestJson(apiBase, pathOrUrl, options);
}

export const api = {
  setBaseUrl: (nextBase) => {
    apiBase = normalizeBaseUrl(nextBase);
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
  getProblems: async (query = {}) => {
    const cached = await getCachedProblems(query);
    if (cached.length > 0) {
      return cached;
    }

    try {
      const problems = await request(buildUrl(apiBase, "/api/problems", query));
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
      const submissions = await request(buildUrl(apiBase, "/api/submissions", query));
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
