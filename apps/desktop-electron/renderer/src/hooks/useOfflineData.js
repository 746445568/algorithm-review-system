import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { getProblems as getCachedProblems, getSubmissions as getCachedSubmissions } from "../lib/db.js";
import { isOnline as checkOnline, processSyncQueue, syncAll } from "../lib/sync.js";

/**
 * @typedef {Object} OfflineDataState
 * @property {boolean} isOnline
 * @property {boolean} isSyncing
 * @property {Date | null} lastSyncAt
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

  const refreshOnlineState = useCallback(async () => {
    const nextOnline = await checkOnline();
    setIsOnline(nextOnline);
    return nextOnline;
  }, []);

  const sync = useCallback(async () => {
    setIsSyncing(true);

    try {
      const nextOnline = await refreshOnlineState();
      if (!nextOnline) {
        return false;
      }

      await processSyncQueue();
      await syncAll();
      setLastSyncAt(new Date());
      return true;
    } catch (error) {
      console.warn("[offline-data] sync failed", error);
      return false;
    } finally {
      setIsSyncing(false);
    }
  }, [refreshOnlineState]);

  const getProblems = useCallback(
    async (filter = {}) => {
      try {
        const cached = await getCachedProblems(filter);
        if (cached.length > 0) {
          return cached;
        }

        const nextOnline = await refreshOnlineState();
        if (!nextOnline) {
          return cached;
        }

        const remote = await api.getProblems(filter);
        return Array.isArray(remote) ? remote : [];
      } catch (error) {
        console.warn("[offline-data] getProblems failed", error);
        return [];
      }
    },
    [refreshOnlineState]
  );

  const getSubmissions = useCallback(
    async (filter = {}) => {
      try {
        const cached = await getCachedSubmissions(filter);
        if (cached.length > 0) {
          return cached;
        }

        const nextOnline = await refreshOnlineState();
        if (!nextOnline) {
          return cached;
        }

        const remote = await api.getSubmissions(filter);
        return Array.isArray(remote) ? remote : [];
      } catch (error) {
        console.warn("[offline-data] getSubmissions failed", error);
        return [];
      }
    },
    [refreshOnlineState]
  );

  const saveReviewState = useCallback(
    async (problemId, state) => {
      try {
        const saved = await api.saveReviewState(problemId, state);
        await refreshOnlineState();
        return saved;
      } catch (error) {
        console.warn("[offline-data] saveReviewState failed", error);
        return null;
      }
    },
    [refreshOnlineState]
  );

  useEffect(() => {
    const updateOnlineState = () => {
      void refreshOnlineState();
    };

    void refreshOnlineState();
    window.addEventListener("online", updateOnlineState);
    window.addEventListener("offline", updateOnlineState);

    return () => {
      window.removeEventListener("online", updateOnlineState);
      window.removeEventListener("offline", updateOnlineState);
    };
  }, [refreshOnlineState]);

  return {
    isOnline,
    isSyncing,
    lastSyncAt,
    sync,
    getProblems,
    getSubmissions,
    saveReviewState,
  };
}
