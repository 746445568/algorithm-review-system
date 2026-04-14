import useSWR from "swr";

/**
 * SWR 全局配置
 *
 * 提供统一的 SWR 配置，包括：
 * - 请求去重间隔：20ms（防止重复请求）
 * - 重新验证间隔：30 秒（背景刷新）
 * - 错误重试次数：3 次
 * - 错误重试间隔：指数退避
 */

// 通用 fetcher，用于所有 API 请求
async function fetcher(path) {
  const response = await fetch(path);
  if (!response.ok) {
    const error = new Error(response.statusText);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

// 默认配置
const defaultConfig = {
  // 请求去重间隔（毫秒）
  dedupingInterval: 20,

  // 背景刷新间隔（毫秒）- 组件保持可见时自动刷新
  refreshInterval: 30000,

  // 窗口聚焦时重新验证
  revalidateOnFocus: true,

  // 网络恢复时重新验证
  revalidateOnReconnect: true,

  // 错误重试次数
  shouldRetryOnError: true,
  errorRetryCount: 3,

  // 错误重试间隔（毫秒），指数退避
  errorRetryInterval: (retryCount) => {
    // 第 1 次：1s, 第 2 次：2s, 第 3 次：4s
    return Math.min(1000 * Math.pow(2, retryCount), 8000);
  },

  // 保持先前数据同时显示加载状态
  keepPreviousData: true,

  // 超时时间（毫秒）
  fetcher,
};

/**
 * 使用 SWR hook 获取数据
 *
 * @param {string} key - 缓存键（通常是 API 路径）
 * @param {object} options - 覆盖默认配置
 * @returns {object} SWR 返回值 { data, error, isLoading, isValidating, mutate }
 */
export function useSWRConfig(key, options = {}) {
  const config = { ...defaultConfig, ...options };
  return useSWR(key, config);
}

// 重新验证间隔预设
export const REVALIDATE_INTERVALS = {
  FAST: 5000,      // 快速轮询（任务状态）
  NORMAL: 30000,   // 正常刷新（仪表盘数据）
  SLOW: 60000,     // 慢速刷新（不常变的数据）
  NEVER: 0,        // 不自动刷新
};

// 缓存时间预设
export const CACHE_MAX_AGE = {
  INSTANT: 0,         // 不缓存
  SHORT: 10000,       // 10 秒
  NORMAL: 60000,      // 1 分钟
  LONG: 300000,       // 5 分钟
  FOREVER: Infinity,  // 永久缓存
};

export { fetcher };
