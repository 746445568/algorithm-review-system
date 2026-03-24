import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { getCollectionSyncMetadata, getSyncQueue } from "../lib/db.js";
import { getConnectivityStatus, processSyncQueue, syncAll } from "../lib/sync.js";

const STALE_LABELS = {
  problems: "题目",
  submissions: "提交",
  accounts: "账号",
  reviewStates: "复习状态",
};

function buildEmptyCacheStatus() {
  return {
    problems: null,
    submissions: null,
    accounts: null,
    reviewStates: null,
  };
}

/**
 * @typedef {Object} OfflineDataState
 * @property {boolean} isOnline
 * @property {boolean} isSyncing
 * @property {Date | null} lastSyncAt
 * @property {string} connectivity
 * @property {string} statusMessage
 * @property {Record<string, any>} cacheStatus
 * @property {Array<Record<string, any>>} syncQueue
 * @property {() => Promise<boolean>} sync
 * @property {(filter?: Record<string, any>) => Promise<Array<Record<string, any>>>} getProblems
 * @property {(filter?: Record<string, any>) => Promise<Array<Record<string, any>>>} getSubmissions
 * @property {(problemId: number, state: Record<string, any>) => Promise<Record<string, any> | null>} saveReviewState
 */

/**
 * Provides offline-aware read and sync helpers for renderer pages.
 *
 * @returns {OfflineDataState}
 */
export function useOfflineData() {
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [connectivity, setConnectivity] = useState("offline");
  const [statusMessage, setStatusMessage] = useState("正在检查离线缓存状态...");
  const [cacheStatus, setCacheStatus] = useState(buildEmptyCacheStatus);
  const [syncQueue, setSyncQueue] = useState([]);

  const refreshCacheStatus = useCallback(async () => {
    const [problems, submissions, accounts, reviewStates, queue] = await Promise.all([
      getCollectionSyncMetadata("problems"),
      getCollectionSyncMetadata("submissions"),
      getCollectionSyncMetadata("accounts"),
      getCollectionSyncMetadata("reviewStates"),
      getSyncQueue(),
    ]);

    const nextCacheStatus = {
      problems,
      submissions,
      accounts,
      reviewStates,
    };

    setCacheStatus(nextCacheStatus);
    setSyncQueue(queue);

    const staleCollections = Object.entries(nextCacheStatus)
      .filter(([, value]) => value?.stale)
      .map(([key]) => STALE_LABELS[key]);

    if (staleCollections.length > 0) {
      setStatusMessage(`缓存可能陈旧：${staleCollections.join("、")}`);
    }

    const latestSyncedAt = Object.values(nextCacheStatus)
      .map((value) => value?.lastSyncedAt)
      .filter(Boolean)
      .sort()
      .at(-1);

    setLastSyncAt(latestSyncedAt ? new Date(latestSyncedAt) : null);
    return nextCacheStatus;
  }, []);

  const refreshOnlineState = useCallback(async () => {
    const result = await getConnectivityStatus();
    setIsOnline(result.isOnline);
    setConnectivity(result.reason);

    if (result.reason === "offline") {
      setStatusMessage("设备当前离线，正在使用本地缓存。");
    } else if (result.reason === "service-unreachable") {
      setStatusMessage(result.errorMessage || "本地服务不可达，正在使用缓存数据。");
    } else {
      setStatusMessage("本地服务在线，可按需刷新缓存。");
    }

    return result;
  }, []);

  const sync = useCallback(async () => {
    setIsSyncing(true);

    try {
      const connectivityResult = await refreshOnlineState();
      if (!connectivityResult.isOnline) {
        await refreshCacheStatus();
        return false;
      }

      await processSyncQueue();
      await syncAll();
      await refreshCacheStatus();
      setStatusMessage("缓存已刷新到最新服务快照。");
      return true;
    } catch (error) {
      console.warn("[offline-data] sync failed", error);
      setStatusMessage(error?.message || "同步失败，继续展示缓存数据。");
      await refreshCacheStatus();
      return false;
    } finally {
      setIsSyncing(false);
    }
  }, [refreshCacheStatus, refreshOnlineState]);

  const getProblems = useCallback(async (filter = {}) => {
    try {
      const result = await api.getProblems(filter, { includeCacheInfo: true });
      await refreshCacheStatus();
      if (result?.cache?.isStale) {
        setStatusMessage("题目缓存已返回，后台正在尝试刷新。");
      }
      return Array.isArray(result?.rows) ? result.rows : [];
    } catch (error) {
      console.warn("[offline-data] getProblems failed", error);
      setStatusMessage(error?.message || "加载题目失败。");
      return [];
    }
  }, [refreshCacheStatus]);

  const getSubmissions = useCallback(async (filter = {}) => {
    try {
      const result = await api.getSubmissions(filter, { includeCacheInfo: true });
      await refreshCacheStatus();
      if (result?.cache?.isStale) {
        setStatusMessage("提交缓存已返回，后台正在尝试刷新。");
      }
      return Array.isArray(result?.rows) ? result.rows : [];
    } catch (error) {
      console.warn("[offline-data] getSubmissions failed", error);
      setStatusMessage(error?.message || "加载提交失败。");
      return [];
    }
  }, [refreshCacheStatus]);

  const saveReviewState = useCallback(async (problemId, state) => {
    try {
      const saved = await api.saveReviewState(problemId, state);
      await refreshOnlineState();
      await refreshCacheStatus();
      return saved;
    } catch (error) {
      console.warn("[offline-data] saveReviewState failed", error);
      setStatusMessage(error?.message || "保存复习状态失败。");
      return null;
    }
  }, [refreshCacheStatus, refreshOnlineState]);

  useEffect(() => {
    const updateOnlineState = () => {
      void refreshOnlineState();
      void refreshCacheStatus();
    };

    void refreshOnlineState();
    void refreshCacheStatus();
    window.addEventListener("online", updateOnlineState);
    window.addEventListener("offline", updateOnlineState);

    return () => {
      window.removeEventListener("online", updateOnlineState);
      window.removeEventListener("offline", updateOnlineState);
    };
  }, [refreshCacheStatus, refreshOnlineState]);

  return {
    isOnline,
    isSyncing,
    lastSyncAt,
    connectivity,
    statusMessage,
    cacheStatus,
    syncQueue,
    sync,
    getProblems,
    getSubmissions,
    saveReviewState,
  };
}
