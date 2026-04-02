const BROWSER_PROXY_LABEL = "Vite \u4ee3\u7406 /api";
const BROWSER_SERVICE_OK = "\u670d\u52a1\u53ef\u8fbe";
const BROWSER_SERVICE_DOWN = "\u670d\u52a1\u4e0d\u53ef\u8fbe";

export function getBrowserRuntimeServiceUrl({ proxyWorks, fallbackUrl }) {
  return proxyWorks ? BROWSER_PROXY_LABEL : fallbackUrl;
}

export function getServiceStatusSnapshot({
  hasDesktopBridge,
  isOnline,
  serviceStatus,
  serviceUrl,
  source,
}) {
  if (hasDesktopBridge) {
    return serviceStatus;
  }

  return {
    ...serviceStatus,
    state: isOnline ? "healthy" : "error",
    url: serviceUrl || serviceStatus?.url || BROWSER_PROXY_LABEL,
    source: source || serviceStatus?.source || "browser",
    message: isOnline
      ? "browser preview connected to local Go service"
      : "browser preview cannot reach local Go service",
  };
}

export function getRenderedServiceIndicator({ hasDesktopBridge, isOnline, serviceStatus }) {
  if (!hasDesktopBridge) {
    return isOnline
      ? { tone: "healthy", text: BROWSER_SERVICE_OK }
      : { tone: "error", text: BROWSER_SERVICE_DOWN };
  }

  const normalizedState = String(serviceStatus?.state || "starting").toLowerCase();
  return {
    tone: normalizedState,
    text: normalizedState.toUpperCase(),
  };
}

export function shouldShowRestartService(hasDesktopBridge) {
  return Boolean(hasDesktopBridge);
}

export function getServiceBannerMessage({ hasDesktopBridge, isOnline, connectivity, serviceStatus }) {
  if (hasDesktopBridge) {
    return serviceStatus?.message || "waiting for desktop bridge";
  }

  if (!isOnline && connectivity === "service-unreachable") {
    return "\u6d4f\u89c8\u5668\u65e0\u6cd5\u8bbf\u95ee\u672c\u5730 Go \u670d\u52a1\uff0c\u8bf7\u786e\u8ba4 ojreviewd \u6b63\u5728\u8fd0\u884c\u5e76\u76d1\u542c 38473 \u7aef\u53e3\u3002";
  }

  if (!isOnline) {
    return "\u5f53\u524d\u5904\u4e8e\u79bb\u7ebf\u6a21\u5f0f\uff0c\u6b63\u5728\u4f7f\u7528\u672c\u5730\u7f13\u5b58\u6570\u636e\u3002";
  }

  return "\u6d4f\u89c8\u5668\u9884\u89c8\u5df2\u8fde\u63a5\u5230\u672c\u5730 Go \u670d\u52a1\uff0c\u53ef\u76f4\u63a5\u6d4b\u8bd5\u540c\u6b65\u548c AI \u5206\u6790\u529f\u80fd\u3002";
}

export function getAnalysisErrorMessage(rawMessage) {
  const message = String(rawMessage || "");
  if (message.includes("provider and model are required")) {
    return "\u8bf7\u5148\u5728\u8bbe\u7f6e\u9875\u9762\u914d\u7f6e AI \u670d\u52a1\uff08\u63d0\u4f9b\u5546\u3001\u6a21\u578b\u548c API Key\uff09\u3002";
  }
  if (message.toLowerCase().includes("database is locked") || message.includes("SQLITE_BUSY")) {
    return "\u5f53\u524d\u6709\u5206\u6790\u6216\u540c\u6b65\u4efb\u52a1\u6b63\u5728\u5360\u7528\u6570\u636e\u5e93\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002";
  }
  return message ? `\u751f\u6210\u5931\u8d25\uff1a${message}` : "\u751f\u6210\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002";
}

export { BROWSER_PROXY_LABEL };
