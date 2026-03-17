export function formatDate(value) {
  if (!value) {
    return "等待中";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function platformLabel(platform) {
  switch ((platform || "").toUpperCase()) {
    case "CODEFORCES":
      return "Codeforces";
    case "ATCODER":
      return "AtCoder";
    case "MANUAL":
      return "Manual";
    default:
      return platform || "Unknown";
  }
}

export function statusLabel(status) {
  switch ((status || "").toUpperCase()) {
    case "HEALTHY":
      return "正常";
    case "IDLE":
      return "空闲";
    case "STARTING":
      return "启动中";
    case "STOPPING":
      return "停止中";
    case "STOPPED":
      return "已停止";
    case "PENDING":
      return "等待中";
    case "RUNNING":
      return "运行中";
    case "SUCCESS":
      return "成功";
    case "FAILED":
      return "失败";
    case "PARTIAL_SUCCESS":
      return "部分成功";
    case "ACTIVE":
      return "活跃";
    case "TODO":
      return "待复习";
    case "REVIEWING":
      return "复习中";
    case "SCHEDULED":
      return "已排期";
    case "DONE":
      return "已完成";
    default:
      return status || "未知";
  }
}

export function verdictTone(verdict) {
  switch ((verdict || "").toUpperCase()) {
    case "AC":
      return "good";
    case "WA":
    case "RE":
    case "TLE":
    case "MLE":
    case "CE":
      return "bad";
    default:
      return "neutral";
  }
}

const TAG_ZH = {
  "implementation": "模拟",
  "math": "数学",
  "greedy": "贪心",
  "dp": "动态规划",
  "data structures": "数据结构",
  "brute force": "暴力枚举",
  "constructive algorithms": "构造",
  "graphs": "图论",
  "sortings": "排序",
  "binary search": "二分查找",
  "dfs and similar": "深搜",
  "trees": "树",
  "strings": "字符串",
  "number theory": "数论",
  "combinatorics": "组合数学",
  "geometry": "几何",
  "bitmasks": "位运算",
  "two pointers": "双指针",
  "dsu": "并查集",
  "shortest paths": "最短路",
  "probabilities": "概率",
  "divide and conquer": "分治",
  "hashing": "哈希",
  "games": "博弈论",
  "flows": "网络流",
  "interactive": "交互",
  "matrices": "矩阵",
  "fft": "快速傅里叶变换",
  "ternary search": "三分查找",
  "expression parsing": "表达式解析",
  "meet-in-the-middle": "折半搜索",
  "2-sat": "2-SAT",
  "chinese remainder theorem": "中国剩余定理",
  "schedules": "调度",
  "string suffix structures": "后缀结构",
};

export function tagLabel(tag) {
  if (!tag) return "未知";
  return TAG_ZH[tag.toLowerCase()] || tag;
}

export function parseTags(rawTagsJson) {
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

export function toDatetimeLocalValue(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}
