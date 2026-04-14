/**
 * 统一的日志工具模块
 *
 * 提供结构化的日志记录功能，便于调试和错误追踪
 */

const LOG_PREFIX = "[OJReview]";
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

/**
 * @typedef {Object} LogLevel
 * @property {string} label
 * @property {number} priority
 * @property {string} color
 */

const LOG_STYLE = {
  [LOG_LEVELS.DEBUG]: "color: #6c757d",
  [LOG_LEVELS.INFO]: "color: #0d6efd",
  [LOG_LEVELS.WARN]: "color: #ffc107",
  [LOG_LEVELS.ERROR]: "color: #dc3545",
};

/**
 * 获取当前日志级别（从 localStorage 读取，默认为 INFO）
 * @returns {number}
 */
function getLogLevel() {
  const stored = typeof localStorage !== "undefined"
    ? localStorage.getItem("ojreview-log-level")
    : null;

  if (stored === "DEBUG") return LOG_LEVELS.DEBUG;
  if (stored === "WARN") return LOG_LEVELS.WARN;
  if (stored === "ERROR") return LOG_LEVELS.ERROR;
  return LOG_LEVELS.INFO;
}

/**
 * 格式化日志消息
 * @param {string} level
 * @param {string} module
 * @param {string} message
 * @returns {string}
 */
function formatMessage(level, module, message) {
  const timestamp = new Date().toLocaleTimeString("zh-CN");
  return `${LOG_PREFIX} [${level}] ${timestamp} ${module ? `[${module}] ` : ""}${message}`;
}

/**
 * 内部日志记录函数
 * @param {number} level
 * @param {string} levelName
 * @param {string} module
 * @param {string} message
 * @param {any[]} args
 */
function log(level, levelName, module, message, ...args) {
  const currentLevel = getLogLevel();
  if (level < currentLevel) return;

  const formattedMessage = formatMessage(levelName, module, message);
  const style = LOG_STYLE[level] || "";

  switch (level) {
    case LOG_LEVELS.DEBUG:
      console.debug(`%c${formattedMessage}`, style, ...args);
      break;
    case LOG_LEVELS.INFO:
      console.info(`%c${formattedMessage}`, style, ...args);
      break;
    case LOG_LEVELS.WARN:
      console.warn(`%c${formattedMessage}`, style, ...args);
      break;
    case LOG_LEVELS.ERROR:
      console.error(`%c${formattedMessage}`, style, ...args);
      break;
  }
}

/**
 * 记录调试日志
 * @param {string} message
 * @param {string} [module]
 * @param {...any} args
 */
export function debug(message, module = "", ...args) {
  log(LOG_LEVELS.DEBUG, "DEBUG", module, message, ...args);
}

/**
 * 记录信息日志
 * @param {string} message
 * @param {string} [module]
 * @param {...any} args
 */
export function info(message, module = "", ...args) {
  log(LOG_LEVELS.INFO, "INFO", module, message, ...args);
}

/**
 * 记录警告日志
 * @param {string} message
 * @param {string} [module]
 * @param {...any} args
 */
export function warn(message, module = "", ...args) {
  log(LOG_LEVELS.WARN, "WARN", module, message, ...args);
}

/**
 * 记录错误日志
 * @param {string} message
 * @param {string} [module]
 * @param {Error|null} [error]
 * @param {...any} args
 */
export function error(message, module = "", error = null, ...args) {
  const extraArgs = [];
  if (error instanceof Error) {
    extraArgs.push(error);
    extraArgs.push(error.stack || "");
  }
  extraArgs.push(...args);
  log(LOG_LEVELS.ERROR, "ERROR", module, message, ...extraArgs);
}

/**
 * 设置日志级别
 * @param {"DEBUG"|"INFO"|"WARN"|"ERROR"} level
 */
export function setLogLevel(level) {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("ojreview-log-level", level);
  }
  info(`日志级别已设置为 ${level}`, "Logger");
}

/**
 * 错误处理工具
 * @param {string} message - 默认错误消息
 * @param {unknown} error - 捕获的错误
 * @returns {string}
 */
export function getErrorMessage(message = "操作失败", error) {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return message;
}

/**
 * 异步操作包装器 - 自动记录错误
 * @template T
 * @param {() => Promise<T>} fn
 * @param {string} context - 操作描述
 * @param {string} [module]
 * @param {T|null} [fallback] - 失败时的返回值
 * @returns {Promise<T|null>}
 */
export async function wrapAsync(fn, context, module = "", fallback = null) {
  try {
    return await fn();
  } catch (error) {
    error(`失败：${context}`, module, error);
    return fallback;
  }
}
