import React, { useCallback, useEffect, useMemo, useState } from "react";
import { SWRConfig } from "swr";
import { NavigationProvider, useNavigation } from "./lib/NavigationContext.jsx";
import { api } from "./lib/api.js";
import { formatDate } from "./lib/format.js";
import { useOfflineData } from "./hooks/useOfflineData.js";
import { useThemeMode } from "./hooks/useThemeMode.js";
import { resolveEffectiveTheme } from "./lib/theme.js";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";
import { ErrorPageFallback } from "./components/ErrorPageFallback.jsx";
import { DashboardPage } from "./pages/DashboardPage.jsx";
import { OnboardingPage } from "./pages/OnboardingPage.jsx";
import { ReviewPage } from "./pages/ReviewPage.jsx";
import { AnalysisPage } from "./pages/AnalysisPage.jsx";
import { ContestsPage } from "./pages/ContestsPage.jsx";
import { StatisticsPage } from "./pages/StatisticsPage.jsx";
import { SettingsPage } from "./pages/SettingsPage.jsx";
import {
  getBrowserRuntimeServiceUrl,
  getRenderedServiceIndicator,
  getServiceStatusSnapshot,
  shouldShowRestartService,
} from "./lib/runtimeStatus.js";

const swrConfig = {
  dedupingInterval: 20,
  timeout: 10000,
  errorRetryCount: 3,
  errorRetryInterval: (retryCount) => Math.min(1000 * Math.pow(2, retryCount), 8000),
};

const navItemsBase = [
  {
    id: "dashboard",
    label: "仪表盘",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="9" rx="1" />
        <rect x="14" y="3" width="7" height="5" rx="1" />
        <rect x="14" y="12" width="7" height="9" rx="1" />
        <rect x="3" y="16" width="7" height="5" rx="1" />
      </svg>
    ),
  },
  {
    id: "review",
    label: "错题复习",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
  {
    id: "analysis",
    label: "AI 分析",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </svg>
    ),
  },
  {
    id: "contests",
    label: "比赛日历",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    id: "statistics",
    label: "统计",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
];

const settingsIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 0 1 7.1 5.3l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const refreshIcon = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 0 1-15.2 6.5" />
    <path d="M3 12A9 9 0 0 1 18.2 5.5" />
    <path d="M21 3v6h-6" />
    <path d="M3 21v-6h6" />
  </svg>
);

const initialStatus = {
  state: "starting",
  url: "http://127.0.0.1:38473",
  runtimeDir: "",
  source: "bridge",
  message: "waiting for desktop bridge",
  pid: null,
};

function AppShell() {
  const { page, navigateTo } = useNavigation();
  const [visitedPages, setVisitedPages] = useState(() => new Set([page]));
  const hasDesktopBridge = Boolean(window.desktopBridge);
  const [serviceStatus, setServiceStatus] = useState(initialStatus);
  const [runtimeInfo, setRuntimeInfo] = useState({
    serviceUrl: initialStatus.url,
    runtimeDir: "",
    appPath: "",
    isPackaged: false,
  });
  const [browserRuntime, setBrowserRuntime] = useState(null);
  const { isOnline, isSyncing, lastSyncAt, connectivity, cacheStatus, syncQueue, sync } = useOfflineData();
  const { themeMode, onThemeChange: handleThemeChange } = useThemeMode();
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    setVisitedPages((prev) => {
      if (prev.has(page)) return prev;
      const next = new Set(prev);
      next.add(page);
      return next;
    });
  }, [page]);

  const handleSync = useCallback(() => {
    void sync();
  }, [sync]);

  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false;
    api.setBaseUrl(initialStatus.url);

    async function bootstrap() {
      if (!hasDesktopBridge) {
        const proxyWorks = await fetch("/health").then((response) => response.ok).catch(() => false);
        const baseUrl = proxyWorks ? "" : "http://127.0.0.1:38473";
        const serviceUrl = getBrowserRuntimeServiceUrl({
          proxyWorks,
          fallbackUrl: baseUrl,
        });
        api.setBaseUrl(baseUrl);

        if (!cancelled) {
          const source = proxyWorks ? "vite-proxy" : "browser-direct";
          setRuntimeInfo((current) => ({ ...current, serviceUrl }));
          setBrowserRuntime({ source, serviceUrl });
          setServiceStatus(
            getServiceStatusSnapshot({
              hasDesktopBridge: false,
              isOnline,
              serviceStatus: initialStatus,
              serviceUrl,
              source,
            })
          );
        }
        return;
      }

      try {
        const [nextRuntimeInfo, nextServiceStatus] = await Promise.all([
          window.desktopBridge.getRuntimeInfo(),
          window.desktopBridge.getServiceStatus(),
        ]);

        if (cancelled) return;

        setRuntimeInfo(nextRuntimeInfo);
        setServiceStatus(nextServiceStatus);
        api.setBaseUrl(nextRuntimeInfo?.serviceUrl || nextServiceStatus?.url || initialStatus.url);
        unsubscribe = window.desktopBridge.onServiceStatus(setServiceStatus);
      } catch (error) {
        if (!cancelled) {
          setServiceStatus({
            ...initialStatus,
            state: "error",
            source: "bridge",
            message: `desktop bridge failed: ${error.message}`,
          });
        }
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [hasDesktopBridge, isOnline]);

  useEffect(() => {
    if (hasDesktopBridge || !browserRuntime) return;

    setServiceStatus((current) =>
      getServiceStatusSnapshot({
        hasDesktopBridge: false,
        isOnline,
        serviceStatus: current,
        serviceUrl: browserRuntime.serviceUrl,
        source: browserRuntime.source,
      })
    );
  }, [browserRuntime, hasDesktopBridge, isOnline, connectivity]);

  useEffect(() => {
    void sync();

    const intervalId = window.setInterval(() => {
      void sync();
    }, 5 * 60 * 1000);

    return () => window.clearInterval(intervalId);
  }, [sync]);

  useEffect(() => {
    if (serviceStatus?.state !== "healthy") return undefined;
    let cancelled = false;

    async function syncAllAccounts() {
      try {
        const accounts = await api.getAccounts();
        if (cancelled) return;
        for (const account of accounts) {
          await api.syncAccount(account.platform, account.id);
          if (cancelled) return;
        }
      } catch (err) {
        if (!String(err?.message || "").includes("already running")) {
          console.error("Auto sync accounts failed:", err);
        }
      }
    }

    void syncAllAccounts();
    const syncIntervalId = window.setInterval(() => {
      void syncAllAccounts();
    }, 30 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(syncIntervalId);
    };
  }, [serviceStatus?.state]);

  useEffect(() => {
    if (serviceStatus?.state === "healthy") {
      api.getHealth().then((payload) => {
        if (payload?.firstRun) setShowOnboarding(true);
      }).catch(() => {});
    }
  }, [serviceStatus?.state]);

  const renderedIndicator = getRenderedServiceIndicator({
    hasDesktopBridge,
    isOnline,
    serviceStatus,
  });
  const lastSyncLabel = useMemo(
    () => (lastSyncAt ? formatDate(lastSyncAt.toISOString()) : "尚未同步"),
    [lastSyncAt]
  );
  const effectiveTheme = resolveEffectiveTheme(themeMode);
  const nextThemeMode = effectiveTheme === "dark" ? "light" : "dark";
  const themeToggleLabel = effectiveTheme === "dark" ? "切换到浅色主题" : "切换到深色主题";
  const themeToggleGlyph = effectiveTheme === "dark" ? "☾" : "☀";

  if (showOnboarding) {
    return <OnboardingPage onComplete={() => setShowOnboarding(false)} />;
  }

  return (
    <div className="app-shell app-shell-v2">
      <header className="nav top-nav">
        <div className="brand-block logo">
          <div className="brand-logo" aria-label="OJReview">
            <span className="logo-mark">OJ</span>
            <div>
              <h1>OJReview</h1>
              <span className="brand-eyebrow">错题复盘</span>
            </div>
          </div>
        </div>

        <nav className="nav-items nav-list" aria-label="Primary">
          {navItemsBase.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === page ? "nav-btn nav-item active" : "nav-btn nav-item"}
              onClick={() => navigateTo(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="nav-right header-actions">
          <span className={`nav-status-lite ${renderedIndicator.tone}`} title={`${renderedIndicator.text} / 上次同步 ${lastSyncLabel}`}>
            <span className="nav-status-dot" />
            {renderedIndicator.text}
          </span>
          <button type="button" className="sync-btn btn-sync" disabled={isSyncing} onClick={handleSync}>
            {refreshIcon}
            <span>{isSyncing ? "同步中" : "同步"}</span>
          </button>
          {shouldShowRestartService(hasDesktopBridge) ? (
            <button type="button" className="icon-btn nav-icon-btn" onClick={() => window.desktopBridge?.restartService()} title="重启服务" aria-label="重启服务">
              {refreshIcon}
            </button>
          ) : null}
          <button
            type="button"
            id="themeToggle"
            className="icon-btn nav-icon-btn theme-toggle"
            onClick={() => handleThemeChange(nextThemeMode)}
            title={themeToggleLabel}
            aria-label={themeToggleLabel}
          >
            {themeToggleGlyph}
          </button>
          <button
            type="button"
            className={page === "settings" ? "icon-btn nav-icon-btn active" : "icon-btn nav-icon-btn"}
            onClick={() => navigateTo("settings")}
            title="设置"
            aria-label="设置"
          >
            {settingsIcon}
          </button>
        </div>
      </header>

      <main className="workspace workspace-v2">
        {visitedPages.has("dashboard") && (
          <div style={{ display: page === "dashboard" ? "" : "none" }}>
            <ErrorBoundary moduleName="DashboardPage" fallback={<ErrorPageFallback />}>
              <DashboardPage serviceStatus={serviceStatus} runtimeInfo={runtimeInfo} cacheStatus={cacheStatus} connectivity={connectivity} syncQueue={syncQueue} onNavigate={navigateTo} />
            </ErrorBoundary>
          </div>
        )}

        {visitedPages.has("review") && (
          <div style={{ display: page === "review" ? "" : "none" }}>
            <ErrorBoundary moduleName="ReviewPage" fallback={<ErrorPageFallback />}>
              <ReviewPage serviceStatus={serviceStatus} runtimeInfo={runtimeInfo} onNavigate={navigateTo} />
            </ErrorBoundary>
          </div>
        )}

        {visitedPages.has("analysis") && (
          <div style={{ display: page === "analysis" ? "" : "none" }}>
            <ErrorBoundary moduleName="AnalysisPage" fallback={<ErrorPageFallback />}>
              <AnalysisPage serviceStatus={serviceStatus} runtimeInfo={runtimeInfo} />
            </ErrorBoundary>
          </div>
        )}

        {visitedPages.has("contests") && (
          <div style={{ display: page === "contests" ? "" : "none" }}>
            <ErrorBoundary moduleName="ContestsPage" fallback={<ErrorPageFallback />}>
              <ContestsPage />
            </ErrorBoundary>
          </div>
        )}

        {visitedPages.has("statistics") && (
          <div style={{ display: page === "statistics" ? "" : "none" }}>
            <ErrorBoundary moduleName="StatisticsPage" fallback={<ErrorPageFallback />}>
              <StatisticsPage />
            </ErrorBoundary>
          </div>
        )}

        {visitedPages.has("settings") && (
          <div style={{ display: page === "settings" ? "" : "none" }}>
            <ErrorBoundary moduleName="SettingsPage" fallback={<ErrorPageFallback />}>
              <SettingsPage runtimeInfo={runtimeInfo} serviceStatus={serviceStatus} />
            </ErrorBoundary>
          </div>
        )}
      </main>
    </div>
  );
}

export function App() {
  return (
    <SWRConfig value={swrConfig}>
      <NavigationProvider>
        <AppShell />
      </NavigationProvider>
    </SWRConfig>
  );
}
