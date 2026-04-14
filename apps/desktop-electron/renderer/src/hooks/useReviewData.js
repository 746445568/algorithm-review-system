import useSWR from "swr";
import { api } from "../lib/api.js";

/**
 * Review 页面数据获取 Hook
 *
 * 使用 SWR 管理复习队列数据，包含：
 * - 自动缓存和背景刷新
 * - 请求去重
 * - 错误重试
 * - 乐观更新支持
 */

// 自定义 fetcher，使用 api.js 的方法
async function reviewFetcher() {
  const [reviewSummary, problems, submissions] = await Promise.all([
    api.getReviewSummary(),
    api.getProblems({ limit: 200 }),
    api.getSubmissions({ limit: 300 }),
  ]);

  return { reviewSummary, problems, submissions };
}

export function useReviewData(serviceStatus) {
  // 服务不健康时不执行请求
  const shouldFetch = serviceStatus?.state === "healthy";

  const { data, error, isLoading, isValidating, mutate } = useSWR(
    shouldFetch ? "review-data" : null,
    reviewFetcher,
    {
      // 请求去重间隔
      dedupingInterval: 20,

      // 背景刷新间隔：20 秒（复习页面需要更及时的更新）
      refreshInterval: 20000,

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

  // 提供乐观更新方法
  const updateReviewState = async (problemId, savedState) => {
    // 乐观更新本地缓存
    if (data) {
      const updatedData = applyReviewStateLocally(data, problemId, savedState);
      await mutate(updatedData, false); // false = 不触发重新验证
    }

    // 异步同步到服务器
    try {
      await api.saveReviewState(problemId, savedState);
      // 同步成功后重新验证
      await mutate();
    } catch (err) {
      // 同步失败，回退到原始数据
      console.error("saveReviewState failed:", err);
      await mutate(); // 重新从服务器获取
      throw err;
    }
  };

  return {
    reviewSummary: data?.reviewSummary ?? null,
    problems: data?.problems ?? [],
    submissions: data?.submissions ?? [],
    error,
    isLoading: isLoading && !data,
    isValidating,
    mutate,
    updateReviewState,
  };
}

/**
 * 本地应用 review state 变更
 */
function applyReviewStateLocally(data, problemId, savedState) {
  if (!data?.reviewSummary?.problemSummaries?.length) return data;

  const now = Date.now();
  const nextProblemSummaries = data.reviewSummary.problemSummaries.map((item) => {
    if (item.problemId !== problemId) return item;

    const nextReviewAt = savedState.nextReviewAt || null;
    const nextReviewTime = nextReviewAt ? new Date(nextReviewAt).getTime() : Number.NaN;

    return {
      ...item,
      reviewStatus: savedState.status || "TODO",
      nextReviewAt,
      lastReviewUpdatedAt: savedState.lastUpdatedAt || null,
      reviewDue: !Number.isNaN(nextReviewTime) && nextReviewTime <= now,
    };
  });

  // 重新计算统计
  const counts = { TODO: 0, REVIEWING: 0, SCHEDULED: 0, DONE: 0 };
  let dueReviewCount = 0;
  let scheduledReviewCount = 0;

  for (const item of nextProblemSummaries) {
    const status = (item.reviewStatus || "TODO").toUpperCase();
    if (counts[status] !== undefined) counts[status]++;
    if (item.nextReviewAt) {
      scheduledReviewCount++;
      const t = new Date(item.nextReviewAt).getTime();
      if (!Number.isNaN(t) && t <= now) dueReviewCount++;
    }
  }

  return {
    ...data,
    reviewSummary: {
      ...data.reviewSummary,
      problemSummaries: nextProblemSummaries,
      reviewStatusCounts: counts,
      dueReviewCount,
      scheduledReviewCount,
    },
  };
}
