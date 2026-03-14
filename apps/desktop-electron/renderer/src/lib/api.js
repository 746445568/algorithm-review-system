const DEFAULT_API_BASE = "http://127.0.0.1:38473";
const REQUEST_TIMEOUT_MS = 10000;
let apiBase = DEFAULT_API_BASE;

function normalizeApiBase(nextBase) {
  if (!nextBase) {
    return DEFAULT_API_BASE;
  }

  return nextBase.endsWith("/") ? nextBase.slice(0, -1) : nextBase;
}

function withQuery(path, query = {}) {
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
    } catch {
      // Keep fallback message.
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export const api = {
  setBaseUrl: (nextBase) => {
    apiBase = normalizeApiBase(nextBase);
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
  saveReviewState: (problemId, payload) =>
    request(`/api/review/items/${problemId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
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
  getProblems: (query = {}) => request(withQuery("/api/problems", query)),
  getSubmissions: (query = {}) => request(withQuery("/api/submissions", query)),
};
