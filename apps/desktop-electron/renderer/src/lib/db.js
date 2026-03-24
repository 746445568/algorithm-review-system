import { openDB as openIDB } from "idb";

const DATABASE_NAME = "OJReviewDB";
const DATABASE_VERSION = 2;
const CACHE_COLLECTIONS = ["problems", "submissions", "accounts", "reviewStates"];
const SYNC_META_KEY = "syncMetadata";

let databasePromise = null;
let hasLoggedDatabaseWarning = false;

/**
 * @typedef {Object} ProblemQuery
 * @property {string} [platform]
 * @property {string} [externalProblemId]
 * @property {string} [tag]
 * @property {string} [search]
 * @property {number} [limit]
 * @property {number} [offset]
 */

/**
 * @typedef {Object} SubmissionQuery
 * @property {string} [platform]
 * @property {number} [problemId]
 * @property {string} [verdict]
 * @property {number} [account_id]
 * @property {number} [limit]
 * @property {number} [offset]
 */

function logDatabaseWarning(error) {
  if (hasLoggedDatabaseWarning) {
    return;
  }
  hasLoggedDatabaseWarning = true;
  console.warn("[offline-db] IndexedDB is unavailable.", error);
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getTimeValue(value) {
  if (!value) {
    return 0;
  }
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function applyWindow(items, query = {}) {
  const offset = Math.max(0, toNumber(query.offset, 0));
  const limit = toNumber(query.limit, 0);
  const sliced = offset > 0 ? items.slice(offset) : items;
  if (limit > 0) {
    return sliced.slice(0, limit);
  }
  return sliced;
}

function parseTags(rawTagsJson) {
  if (!rawTagsJson) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawTagsJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildDefaultReviewState(problemId) {
  return {
    problemId,
    status: "TODO",
    notes: "",
    nextReviewAt: null,
    lastUpdatedAt: new Date().toISOString(),
  };
}

function buildDefaultSyncMetadata() {
  return CACHE_COLLECTIONS.reduce((accumulator, entity) => {
    accumulator[entity] = {
      entity,
      lastSyncedAt: null,
      lastFetchAttemptAt: null,
      stale: true,
      source: "empty-cache",
      lastError: "尚未同步",
    };
    return accumulator;
  }, {});
}

function normalizeMetadataEntry(entity, entry = {}) {
  return {
    entity,
    lastSyncedAt: entry.lastSyncedAt || null,
    lastFetchAttemptAt: entry.lastFetchAttemptAt || null,
    stale: Boolean(entry.stale ?? !entry.lastSyncedAt),
    source: entry.source || (entry.lastSyncedAt ? "cache" : "empty-cache"),
    lastError: entry.lastError || null,
  };
}

function mergeSyncMetadata(metadata = {}) {
  const base = buildDefaultSyncMetadata();
  for (const entity of CACHE_COLLECTIONS) {
    base[entity] = normalizeMetadataEntry(entity, metadata?.[entity]);
  }
  return base;
}

/**
 * Opens the IndexedDB database used by the renderer.
 *
 * @returns {Promise<import("idb").IDBPDatabase | null>}
 */
export async function openDB() {
  if (typeof indexedDB === "undefined") {
    logDatabaseWarning(new Error("IndexedDB global is missing."));
    return null;
  }

  if (!databasePromise) {
    databasePromise = openIDB(DATABASE_NAME, DATABASE_VERSION, {
      upgrade(database, oldVersion, _newVersion, transaction) {
        if (!database.objectStoreNames.contains("problems")) {
          const store = database.createObjectStore("problems", { keyPath: "id" });
          store.createIndex("platform", "platform", { unique: false });
          store.createIndex("externalProblemId", "externalProblemId", { unique: false });
        }

        if (!database.objectStoreNames.contains("submissions")) {
          const store = database.createObjectStore("submissions", { keyPath: "id" });
          store.createIndex("platform", "platform", { unique: false });
          store.createIndex("problemId", "problemId", { unique: false });
          store.createIndex("verdict", "verdict", { unique: false });
        }

        if (!database.objectStoreNames.contains("reviewStates")) {
          database.createObjectStore("reviewStates", { keyPath: "problemId" });
        }

        if (!database.objectStoreNames.contains("accounts")) {
          const store = database.createObjectStore("accounts", { keyPath: "id" });
          store.createIndex("platform", "platform", { unique: false });
        }

        if (!database.objectStoreNames.contains("settings")) {
          database.createObjectStore("settings", { keyPath: "key" });
        }

        if (!database.objectStoreNames.contains("syncQueue")) {
          database.createObjectStore("syncQueue", {
            keyPath: "id",
            autoIncrement: true,
          });
        }

        if (oldVersion < 2 && database.objectStoreNames.contains("syncQueue")) {
          const store = transaction.objectStore("syncQueue");
          if (store && !store.indexNames.contains("retryCount")) {
            store.createIndex("retryCount", "retryCount", { unique: false });
          }
        }
      },
    });
  }

  try {
    return await databasePromise;
  } catch (error) {
    databasePromise = null;
    logDatabaseWarning(error);
    return null;
  }
}

async function withStore(storeName, mode, action, fallbackValue) {
  const database = await openDB();
  if (!database) {
    return fallbackValue;
  }

  try {
    const transaction = database.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const result = await action(store, transaction);
    await transaction.done;
    return result;
  } catch (error) {
    logDatabaseWarning(error);
    return fallbackValue;
  }
}

async function saveCollectionSyncMetadata(entity, updates = {}) {
  const metadata = await getSyncMetadata();
  const nextMetadata = {
    ...metadata,
    [entity]: normalizeMetadataEntry(entity, {
      ...metadata?.[entity],
      ...updates,
    }),
  };
  await saveSettings(SYNC_META_KEY, nextMetadata);
  return nextMetadata[entity];
}

export async function getSyncMetadata() {
  const metadata = await getSettings(SYNC_META_KEY);
  return mergeSyncMetadata(metadata);
}

export async function getCollectionSyncMetadata(entity) {
  if (!CACHE_COLLECTIONS.includes(entity)) {
    return null;
  }

  const metadata = await getSyncMetadata();
  return metadata[entity] || null;
}

export async function markCollectionSyncAttempt(entity, updates = {}) {
  if (!CACHE_COLLECTIONS.includes(entity)) {
    return null;
  }

  return saveCollectionSyncMetadata(entity, {
    lastFetchAttemptAt: updates.lastFetchAttemptAt || new Date().toISOString(),
    source: updates.source,
    stale: updates.stale,
    lastError: updates.lastError,
  });
}

export async function markCollectionSynced(entity, updates = {}) {
  if (!CACHE_COLLECTIONS.includes(entity)) {
    return null;
  }

  const syncedAt = updates.lastSyncedAt || new Date().toISOString();
  return saveCollectionSyncMetadata(entity, {
    lastSyncedAt: syncedAt,
    lastFetchAttemptAt: updates.lastFetchAttemptAt || syncedAt,
    source: updates.source || "remote",
    stale: Boolean(updates.stale),
    lastError: updates.lastError || null,
  });
}

/**
 * Writes problem rows into local cache.
 *
 * @param {Array<Record<string, any>>} problems
 * @returns {Promise<number>}
 */
export async function saveProblems(problems) {
  const items = Array.isArray(problems) ? problems : [];
  return withStore(
    "problems",
    "readwrite",
    async (store) => {
      for (const item of items) {
        await store.put(item);
      }
      return items.length;
    },
    0
  );
}

/**
 * Reads problems from local cache using API-like filters.
 *
 * @param {ProblemQuery} [query]
 * @returns {Promise<Array<Record<string, any>>>}
 */
export async function getProblems(query = {}) {
  return withStore(
    "problems",
    "readonly",
    async (store) => {
      let items = [];

      if (query.platform) {
        items = await store.index("platform").getAll(query.platform);
      } else if (query.externalProblemId) {
        items = await store.index("externalProblemId").getAll(query.externalProblemId);
      } else {
        items = await store.getAll();
      }

      if (query.search) {
        const needle = String(query.search).trim().toLowerCase();
        items = items.filter((item) => {
          const title = String(item.title || "").toLowerCase();
          return title.includes(needle);
        });
      }

      if (query.tag) {
        const tagNeedle = String(query.tag).trim().toLowerCase();
        items = items.filter((item) =>
          parseTags(item.rawTagsJson).some((tag) => String(tag).toLowerCase() === tagNeedle)
        );
      }

      items.sort((left, right) => {
        const byUpdatedAt = getTimeValue(right.updatedAt) - getTimeValue(left.updatedAt);
        if (byUpdatedAt !== 0) {
          return byUpdatedAt;
        }
        return toNumber(right.id) - toNumber(left.id);
      });

      return applyWindow(items, query);
    },
    []
  );
}

/**
 * Reads a single problem row by id.
 *
 * @param {number} id
 * @returns {Promise<Record<string, any> | null>}
 */
export async function getProblem(id) {
  return withStore("problems", "readonly", (store) => store.get(id), null);
}

/**
 * Writes submission rows into local cache.
 *
 * @param {Array<Record<string, any>>} submissions
 * @returns {Promise<number>}
 */
export async function saveSubmissions(submissions) {
  const items = Array.isArray(submissions) ? submissions : [];
  return withStore(
    "submissions",
    "readwrite",
    async (store) => {
      for (const item of items) {
        await store.put(item);
      }
      return items.length;
    },
    0
  );
}

/**
 * Reads submissions from local cache using API-like filters.
 *
 * @param {SubmissionQuery} [query]
 * @returns {Promise<Array<Record<string, any>>>}
 */
export async function getSubmissions(query = {}) {
  return withStore(
    "submissions",
    "readonly",
    async (store) => {
      let items = [];

      if (query.problemId !== undefined && query.problemId !== null) {
        items = await store.index("problemId").getAll(toNumber(query.problemId));
      } else if (query.platform) {
        items = await store.index("platform").getAll(query.platform);
      } else if (query.verdict) {
        items = await store.index("verdict").getAll(query.verdict);
      } else {
        items = await store.getAll();
      }

      if (query.account_id !== undefined && query.account_id !== null) {
        const accountID = toNumber(query.account_id);
        items = items.filter((item) => toNumber(item.platformAccountId, -1) === accountID);
      }

      if (query.platform) {
        items = items.filter((item) => item.platform === query.platform);
      }

      if (query.verdict) {
        items = items.filter((item) => item.verdict === query.verdict);
      }

      items.sort((left, right) => {
        const bySubmittedAt = getTimeValue(right.submittedAt) - getTimeValue(left.submittedAt);
        if (bySubmittedAt !== 0) {
          return bySubmittedAt;
        }
        return toNumber(right.id) - toNumber(left.id);
      });

      return applyWindow(items, query);
    },
    []
  );
}

/**
 * Reads a single submission row by id.
 *
 * @param {number} id
 * @returns {Promise<Record<string, any> | null>}
 */
export async function getSubmission(id) {
  return withStore("submissions", "readonly", (store) => store.get(id), null);
}

/**
 * Saves a review state row using problem id as key.
 *
 * @param {Record<string, any>} state
 * @returns {Promise<Record<string, any> | null>}
 */
export async function saveReviewState(state) {
  const problemId = toNumber(state?.problemId);
  if (!problemId) {
    return null;
  }

  const payload = {
    ...state,
    problemId,
    status: state?.status || "TODO",
    notes: state?.notes || "",
    nextReviewAt: state?.nextReviewAt || null,
    lastUpdatedAt: state?.lastUpdatedAt || new Date().toISOString(),
  };

  return withStore(
    "reviewStates",
    "readwrite",
    async (store) => {
      await store.put(payload);
      return payload;
    },
    null
  );
}

/**
 * Reads a single review state row by problem id.
 *
 * @param {number} problemId
 * @returns {Promise<Record<string, any> | null>}
 */
export async function getReviewState(problemId) {
  const normalizedProblemId = toNumber(problemId);
  if (!normalizedProblemId) {
    return null;
  }

  const state = await withStore(
    "reviewStates",
    "readonly",
    (store) => store.get(normalizedProblemId),
    null
  );
  return state || buildDefaultReviewState(normalizedProblemId);
}

/**
 * Reads all saved review states.
 *
 * @returns {Promise<Array<Record<string, any>>>}
 */
export async function getAllReviewStates() {
  return withStore("reviewStates", "readonly", (store) => store.getAll(), []);
}

/**
 * Writes platform account rows into local cache.
 *
 * @param {Array<Record<string, any>>} accounts
 * @returns {Promise<number>}
 */
export async function saveAccounts(accounts) {
  const items = Array.isArray(accounts) ? accounts : [];
  return withStore(
    "accounts",
    "readwrite",
    async (store) => {
      for (const item of items) {
        await store.put(item);
      }
      return items.length;
    },
    0
  );
}

/**
 * Reads all cached accounts.
 *
 * @returns {Promise<Array<Record<string, any>>>}
 */
export async function getAccounts() {
  return withStore(
    "accounts",
    "readonly",
    async (store) => {
      const items = await store.getAll();
      return items.sort((left, right) => toNumber(left.id) - toNumber(right.id));
    },
    []
  );
}

/**
 * Reads a single account row by id.
 *
 * @param {number} id
 * @returns {Promise<Record<string, any> | null>}
 */
export async function getAccount(id) {
  return withStore("accounts", "readonly", (store) => store.get(id), null);
}

/**
 * Writes a generic setting key/value pair.
 *
 * @param {string} key
 * @param {any} value
 * @returns {Promise<Record<string, any> | null>}
 */
export async function saveSettings(key, value) {
  if (!key) {
    return null;
  }

  const payload = {
    key,
    value,
    updatedAt: new Date().toISOString(),
  };

  return withStore(
    "settings",
    "readwrite",
    async (store) => {
      await store.put(payload);
      return payload;
    },
    null
  );
}

/**
 * Reads a setting value by key.
 *
 * @param {string} key
 * @returns {Promise<any>}
 */
export async function getSettings(key) {
  if (!key) {
    return null;
  }

  const row = await withStore("settings", "readonly", (store) => store.get(key), null);
  return row?.value ?? null;
}

/**
 * Enqueues a deferred sync operation.
 *
 * @param {Record<string, any>} operation
 * @returns {Promise<number | null>}
 */
export async function addToSyncQueue(operation) {
  const payload = {
    retryCount: toNumber(operation?.retryCount, 0),
    lastError: operation?.lastError || null,
    lastTriedAt: operation?.lastTriedAt || null,
    ...operation,
    createdAt: operation?.createdAt || new Date().toISOString(),
  };
  return withStore(
    "syncQueue",
    "readwrite",
    (store) => store.add(payload),
    null
  );
}

/**
 * Reads pending sync operations ordered by id.
 *
 * @returns {Promise<Array<Record<string, any>>>}
 */
export async function getSyncQueue() {
  return withStore(
    "syncQueue",
    "readonly",
    async (store) => {
      const items = await store.getAll();
      return items.sort((left, right) => toNumber(left.id) - toNumber(right.id));
    },
    []
  );
}

export async function updateSyncQueueOperation(id, updates = {}) {
  if (!id) {
    return null;
  }

  return withStore(
    "syncQueue",
    "readwrite",
    async (store) => {
      const current = await store.get(id);
      if (!current) {
        return null;
      }
      const nextValue = {
        ...current,
        ...updates,
      };
      await store.put(nextValue);
      return nextValue;
    },
    null
  );
}

/**
 * Removes one queued sync operation.
 *
 * @param {number} id
 * @returns {Promise<boolean>}
 */
export async function removeFromSyncQueue(id) {
  if (!id) {
    return false;
  }

  return withStore(
    "syncQueue",
    "readwrite",
    async (store) => {
      await store.delete(id);
      return true;
    },
    false
  );
}

/**
 * Clears all pending sync operations.
 *
 * @returns {Promise<boolean>}
 */
export async function clearSyncQueue() {
  return withStore(
    "syncQueue",
    "readwrite",
    async (store) => {
      await store.clear();
      return true;
    },
    false
  );
}
