import {
  addToSyncQueue,
  getAccounts as getCachedAccounts,
  getCollectionSyncMetadata,
  getProblems as getCachedProblems,
  getSubmissions as getCachedSubmissions,
  markCollectionSyncAttempt,
  markCollectionSynced,
  saveAccounts as saveCachedAccounts,
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

function getCacheAgeMs(lastSyncedAt) {
  if (!lastSyncedAt) {
    return Number.POSITIVE_INFINITY;
  }

  const syncedAt = new Date(lastSyncedAt).getTime();
  if (Number.isNaN(syncedAt)) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(0, Date.now() - syncedAt);
}

function buildCacheState(entity, metadata, cachedCount) {
  const ttlMs = CACHE_TTLS_MS[entity] ?? 5 * 60 * 1000;
  const ageMs = getCacheAgeMs(metadata?.lastSyncedAt);
  const hasCache = cachedCount > 0;
  const isStale = !hasCache || ageMs > ttlMs || metadata?.stale === true;

  return {
    entity,
    ttlMs,
    ageMs,
    hasCache,
    isStale,
    metadata,
  };
}

async function fetchAndPersistCollection({
  entity,
  path,
  query,
  saveRows,
  background = false,
}) {
  const attemptAt = new Date().toISOString();
  await markCollectionSyncAttempt(entity, {
    lastFetchAttemptAt: attemptAt,
    source: background ? "background-refresh" : "remote-request",
    stale: true,
    lastError: null,
  });

  try {
    const response = await request(withQuery(path, query));
    const rows = Array.isArray(response) ? response : [];
    await saveRows(rows);
    await markCollectionSynced(entity, {
      lastSyncedAt: new Date().toISOString(),
      lastFetchAttemptAt: attemptAt,
      source: background ? "background-refresh" : "remote",
      stale: false,
      lastError: null,
    });
    return rows;
  } catch (error) {
    await markCollectionSyncAttempt(entity, {
      lastFetchAttemptAt: attemptAt,
      source: background ? "background-refresh" : "remote-request",
      stale: true,
      lastError: error?.message || "请求失败",
    });
    throw error;
  }
}

async function getCachedFirstCollection({
  entity,
  query,
  getCachedRows,
  path,
  saveRows,
}) {
  const [cachedRows, metadata] = await Promise.all([
    getCachedRows(query),
    getCollectionSyncMetadata(entity),
  ]);
  const cacheState = buildCacheState(entity, metadata, cachedRows.length);

  if (cacheState.hasCache) {
    if (cacheState.isStale) {
      const online = await checkOnline();
      if (online) {
        void fetchAndPersistCollection({
          entity,
          path,
          query,
          saveRows,
          background: true,
        }).catch((error) => {
          console.warn(`[api] background refresh failed for ${entity}`, error);
        });
      }
    }

    return {
      rows: cachedRows,
      cache: {
        ...cacheState,
        source: "cache",
        refreshStartedAt: cacheState.isStale ? new Date().toISOString() : null,
      },
    };
  }

  try {
    const rows = await fetchAndPersistCollection({
      entity,
      path,
      query,
      saveRows,
    });
    const nextMetadata = await getCollectionSyncMetadata(entity);
    return {
      rows,
      cache: {
        ...buildCacheState(entity, nextMetadata, rows.length),
        source: "remote",
        refreshStartedAt: null,
      },
    };
  } catch (error) {
    if (isNetworkError(error)) {
      return {
        rows: cachedRows,
        cache: {
          ...cacheState,
          source: cacheState.hasCache ? "cache-network-fallback" : "empty-network-fallback",
          refreshStartedAt: null,
          lastError: error.message,
        },
      };
    }
    throw error;
  }
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
  getAccounts: async () => {
    const cached = await getCachedAccounts();
    if (cached.length > 0) {
      void (async () => {
        try {
          const online = await checkOnline();
          if (!online) {
            return;
          }
          await markCollectionSyncAttempt("accounts", {
            source: "background-refresh",
            stale: false,
            lastError: null,
          });
          const remote = await request("/api/accounts");
          const rows = Array.isArray(remote) ? remote : [];
          await saveCachedAccounts(rows);
          await markCollectionSynced("accounts", {
            source: "background-refresh",
            stale: false,
          });
        } catch (error) {
          await markCollectionSyncAttempt("accounts", {
            source: "background-refresh",
            stale: true,
            lastError: error?.message || "请求失败",
          });
        }
      })();
      return cached;
    }

    const accounts = await request("/api/accounts");
    const rows = Array.isArray(accounts) ? accounts : [];
    await saveCachedAccounts(rows);
    await markCollectionSynced("accounts", { source: "remote", stale: false });
    return rows;
  },
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
      await markCollectionSynced("reviewStates", {
        source: "remote",
        stale: false,
      });
      return saved;
    } catch (error) {
      if (isNetworkError(error)) {
        await queueReviewStateSync(normalizedProblemId, normalizedPayload);
        await markCollectionSyncAttempt("reviewStates", {
          source: "queue-fallback",
          stale: true,
          lastError: error.message,
        });
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
  getServiceCapabilities: () => detectServiceCapabilities(),
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

async function detectServiceCapabilities() {
  try {
    const payload = await request("/api/system/capabilities");
    return normalizeServiceCapabilities(payload, "capabilities-endpoint");
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
  }

  const checks = await Promise.allSettled([
    request("/api/review/items/1"),
    request("/api/settings/ai"),
    request("/api/settings/data/export-diagnostics", {
      method: "POST",
      body: JSON.stringify({ dryRun: true }),
    }),
    request("/api/me"),
  ]);

  const [reviewStateResult, aiSettingsResult, diagnosticsResult, meResult] = checks;
  const reviewStateSupported =
    reviewStateResult.status === "fulfilled" || !isNotFoundError(reviewStateResult.reason);
  const aiSettingsSupported =
    aiSettingsResult.status === "fulfilled" || !isNotFoundError(aiSettingsResult.reason);
  const diagnosticsExportSupported =
    diagnosticsResult.status === "fulfilled" || !isNotFoundError(diagnosticsResult.reason);
  const serviceVersion =
    meResult.status === "fulfilled"
      ? meResult.value?.app?.version || DEFAULT_SERVICE_CAPABILITIES.serviceVersion
      : DEFAULT_SERVICE_CAPABILITIES.serviceVersion;

  return normalizeServiceCapabilities(
    {
      reviewStateSupported,
      aiSettingsSupported,
      diagnosticsExportSupported,
      serviceVersion,
    },
    "fallback-probe"
  );
}
