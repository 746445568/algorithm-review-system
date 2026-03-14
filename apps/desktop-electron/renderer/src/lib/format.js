export function formatDate(value) {
  if (!value) {
    return "pending";
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
      return "Healthy";
    case "IDLE":
      return "Idle";
    case "STARTING":
      return "Starting";
    case "STOPPING":
      return "Stopping";
    case "STOPPED":
      return "Stopped";
    case "PENDING":
      return "Pending";
    case "RUNNING":
      return "Running";
    case "SUCCESS":
      return "Success";
    case "FAILED":
      return "Failed";
    case "PARTIAL_SUCCESS":
      return "Partial";
    case "ACTIVE":
      return "Active";
    case "TODO":
      return "Todo";
    case "REVIEWING":
      return "Reviewing";
    case "SCHEDULED":
      return "Scheduled";
    case "DONE":
      return "Done";
    default:
      return status || "Unknown";
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
