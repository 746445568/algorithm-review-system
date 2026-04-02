import test from "node:test";
import assert from "node:assert/strict";

import {
  BROWSER_PROXY_LABEL,
  getAnalysisErrorMessage,
  getBrowserRuntimeServiceUrl,
  getRenderedServiceIndicator,
  getServiceStatusSnapshot,
  shouldShowRestartService,
} from "../renderer/src/lib/runtimeStatus.js";

test("browser preview uses online indicator instead of raw service state", () => {
  const indicator = getRenderedServiceIndicator({
    hasDesktopBridge: false,
    isOnline: false,
    serviceStatus: { state: "healthy" },
  });

  assert.deepEqual(indicator, {
    tone: "error",
    text: "\u670d\u52a1\u4e0d\u53ef\u8fbe",
  });
});

test("electron runtime keeps raw service state indicator", () => {
  const indicator = getRenderedServiceIndicator({
    hasDesktopBridge: true,
    isOnline: false,
    serviceStatus: { state: "healthy" },
  });

  assert.deepEqual(indicator, {
    tone: "healthy",
    text: "HEALTHY",
  });
});

test("restart button is hidden in browser preview", () => {
  assert.equal(shouldShowRestartService(false), false);
  assert.equal(shouldShowRestartService(true), true);
});

test("browser runtime uses proxy label instead of preview page origin", () => {
  assert.equal(
    getBrowserRuntimeServiceUrl({
      proxyWorks: true,
      fallbackUrl: "http://127.0.0.1:38473",
    }),
    BROWSER_PROXY_LABEL
  );
});

test("browser status snapshot maps online connectivity to healthy state", () => {
  const snapshot = getServiceStatusSnapshot({
    hasDesktopBridge: false,
    isOnline: true,
    serviceStatus: { state: "starting" },
    serviceUrl: BROWSER_PROXY_LABEL,
    source: "vite-proxy",
  });

  assert.equal(snapshot.state, "healthy");
  assert.equal(snapshot.url, BROWSER_PROXY_LABEL);
  assert.equal(snapshot.source, "vite-proxy");
});

test("analysis busy errors are mapped to a user-facing message", () => {
  const message = getAnalysisErrorMessage("database is locked (5) (SQLITE_BUSY)");
  assert.equal(
    message,
    "\u5f53\u524d\u6709\u5206\u6790\u6216\u540c\u6b65\u4efb\u52a1\u6b63\u5728\u5360\u7528\u6570\u636e\u5e93\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002"
  );
});
