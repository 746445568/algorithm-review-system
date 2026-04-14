import useSWR from "swr";
import { api } from "../lib/api.js";

/**
 * Dashboard 数据获取 Hook
 *
 * 使用 SWR 管理仪表盘数据，包含：
 * - 自动缓存和背景刷新
 * - 请求去重
 * - 错误重试
 * - 焦点/重连自动重新验证
 */

// 自定义 fetcher，使用 api.js 的方法
async function dashboardFetcher() {
  const [owner, accounts, syncTasks, reviewSummary, goals] = await Promise.all([
    api.getOwner(),
    api.getAccounts(),
    api.getSyncTasks(),
    api.getReviewSummary(),
    api.getGoals(),
  ]);

  return { owner, accounts, syncTasks, reviewSummary, goals };
}

export function useDashboardData(serviceStatus) {
  // 服务不健康时不执行请求
  const shouldFetch = serviceStatus?.state === "healthy";

  const { data, error, isLoading, isValidating, mutate } = useSWR(
    shouldFetch ? "dashboard-data" : null,
    dashboardFetcher,
    {
      // 请求去重间隔
      dedupingInterval: 20,

      // 背景刷新间隔：15 秒（与原有逻辑保持一致）
      refreshInterval: 15000,

      // 窗口聚焦时重新验证
      revalidateOnFocus: true,

      // 网络恢复时重新验证
      revalidateOnReconnect: true,

      // 错误重试
      shouldRetryOnError: true,
      errorRetryCount: 3,
      errorRetryInterval: (retryCount) => Math.min(1000 * Math.pow(2, retryCount), 8000),

      // 保持先前数据
      keepPreviousData: true,

      // 错误时不退化状态
      fallbackData: null,
    }
  );

  return {
    data,
    error,
    isLoading: isLoading && !data, // 有缓存数据时不显示加载
    isValidating,
    mutate,
  };
}

/**
 * 最新分析数据 Hook
 */
export function useLatestAnalysis() {
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    "latest-analysis",
    () => api.getLatestAnalysis().then((res) => res?.task ?? null),
    {
      dedupingInterval: 20,
      refreshInterval: 30000, // 30 秒背景刷新
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      shouldRetryOnError: true,
      errorRetryCount: 2,
      keepPreviousData: true,
    }
  );

  return {
    latestAnalysis: data,
    error,
    isLoading: isLoading && !data,
    isValidating,
    mutate,
  };
}
