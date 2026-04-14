import useSWR from "swr";
import { api } from "../lib/api.js";

/**
 * 分析任务轮询 Hook
 *
 * 使用 SWR 的 refreshInterval 实现智能轮询：
 * - 任务进行中：快速轮询（2 秒）
 * - 任务完成：停止轮询
 * - 错误重试：指数退避
 */

export function useAnalysisTask(taskId) {
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    taskId ? `analysis-task-${taskId}` : null,
    () => api.getAnalysisTask(taskId),
    {
      // 请求去重间隔
      dedupingInterval: 20,

      // 动态刷新间隔在 useAnalysisTaskWithPoll 中处理
      refreshInterval: 0,

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
    }
  );

  return {
    task: data,
    error,
    isLoading: isLoading && !data,
    isValidating,
    mutate,
  };
}

/**
 * 带智能轮询的分析任务 Hook
 *
 * 根据任务状态动态调整轮询间隔：
 * - PENDING/RUNNING: 2 秒快速轮询
 * - SUCCESS/FAILED: 停止轮询
 */
export function useAnalysisTaskWithPoll(taskId) {
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    taskId ? `analysis-task-${taskId}` : null,
    () => api.getAnalysisTask(taskId),
    {
      dedupingInterval: 20,
      // 动态刷新间隔由 shouldPoll 控制
      refreshInterval: () => {
        if (!data || (data.status !== "SUCCESS" && data.status !== "FAILED")) {
          return 2000; // 任务进行中：2 秒轮询
        }
        return 0; // 任务完成：停止轮询
      },
      revalidateOnFocus: false, // 任务轮询不需要聚焦重新验证
      revalidateOnReconnect: true,
      shouldRetryOnError: true,
      errorRetryCount: 3,
      errorRetryInterval: (retryCount) => Math.min(1000 * Math.pow(2, retryCount), 8000),
      keepPreviousData: true,
    }
  );

  const isPolling = data && data.status !== "SUCCESS" && data.status !== "FAILED";

  return {
    task: data,
    error,
    isLoading: isLoading && !data,
    isValidating,
    isPolling,
    mutate,
  };
}

/**
 * 全局分析任务 Hook（带周期参数）
 */
export function useGlobalAnalysisTask(period) {
  const key = period ? `global-analysis-${period}` : null;

  const { data, error, isLoading, isValidating, mutate } = useSWR(
    key,
    () => api.generateAnalysis({ period }),
    {
      dedupingInterval: 20,
      refreshInterval: 0, // 不自动刷新，手动触发
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: true,
      errorRetryCount: 2,
      keepPreviousData: true,
    }
  );

  return {
    task: data?.task,
    error,
    isLoading: isLoading && !data,
    isValidating,
    mutate,
  };
}

/**
 * 对比分析任务 Hook
 */
export function useComparisonAnalysisTask(period) {
  const key = period ? `comparison-analysis-${period}` : null;

  const { data, error, isLoading, isValidating, mutate } = useSWR(
    key,
    () => api.generateComparisonAnalysis({ period }),
    {
      dedupingInterval: 20,
      refreshInterval: 0,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: true,
      errorRetryCount: 2,
      keepPreviousData: true,
    }
  );

  return {
    task: data?.task,
    error,
    isLoading: isLoading && !data,
    isValidating,
    mutate,
  };
}

/**
 * 单题分析任务 Hook
 */
export function useProblemAnalysisTask(problemId) {
  const key = problemId ? `problem-analysis-${problemId}` : null;

  const { data, error, isLoading, isValidating, mutate } = useSWR(
    key,
    () => api.generateProblemAnalysis(problemId, {}),
    {
      dedupingInterval: 20,
      refreshInterval: 0,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: true,
      errorRetryCount: 2,
      keepPreviousData: true,
    }
  );

  return {
    task: data?.task,
    error,
    isLoading: isLoading && !data,
    isValidating,
    mutate,
  };
}
