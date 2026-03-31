import { useCallback, useEffect, useMemo, useState } from "react";
import { NavigationProvider, useNavigation } from "./lib/NavigationContext.jsx";
import { AnalysisPage } from "./pages/AnalysisPage.jsx";
import { DashboardPage } from "./pages/DashboardPage.jsx";
import { AccountsPage } from "./pages/AccountsPage.jsx";
import { ReviewPage } from "./pages/ReviewPage.jsx";
import { SettingsPage } from "./pages/SettingsPage.jsx";
import { api } from "./lib/api.js";
import { formatDate } from "./lib/format.js";
import { useOfflineData } from "./hooks/useOfflineData.js";

function resolveEffectiveTheme(mode) {
  if (mode === "dark") return "dark";
  if (mode === "light") return "light";
  // follow-system
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyThemeToDOM(mode) {
  const effective = resolveEffectiveTheme(mode);
  if (effective === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

// Apply immediately at module load to prevent flash
applyThemeToDOM(localStorage.getItem("ojreview-theme") ?? "follow-system");

const navItems = [
  {
    id: "dashboard", label: "仪表盘", kicker: "总览",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" />
      </svg>
    ),
  },
  {
    id: "accounts", label: "账号管理", kicker: "同步",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    id: "review", label: "错题复习", kicker: "工作流",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    id: "analysis", label: "AI 分析", kicker: "洞察",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
      </svg>
    ),
  },
  {
    id: "settings", label: "设置", kicker: "配置",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

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
  const [serviceStatus, setServiceStatus] = useState(initialStatus);
  const [runtimeInfo, setRuntimeInfo] = useState({
    serviceUrl: initialStatus.url,
    runtimeDir: "",
    appPath: "",
    isPackaged: false,
  });
  const { isOnline, isSyncing, lastSyncAt, connectivity, cacheStatus, syncQueue, sync } = useOfflineData();
  const [themeMode, setThemeMode] = useState(
    () => localStorage.getItem("ojreview-theme") ?? "follow-system"
  );

  const handleThemeChange = useCallback((mode) => {
    localStorage.setItem("ojreview-theme", mode);
    setThemeMode(mode);
    applyThemeToDOM(mode);
  }, []);

  // Re-apply theme on every render cycle to guard against external resets
  useEffect(() => {
    applyThemeToDOM(themeMode);
  }, [themeMode]);

  // Listen for system theme changes when in follow-system mode
  useEffect(() => {
    if (themeMode !== "follow-system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyThemeToDOM("follow-system");
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [themeMode]);

  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false;
    api.setBaseUrl(initialStatus.url);

    async function bootstrap() {
      if (!window.desktopBridge) {
        // Browser dev mode: try Vite proxy first, fall back to direct connection
        const proxyWorks = await fetch("/health").then((r) => r.ok).catch(() => false);
        const baseUrl = proxyWorks ? "" : "http://127.0.0.1:38473";
        api.setBaseUrl(baseUrl);
        try {
          const resp = proxyWorks
            ? await fetch("/health")
            : await fetch("http://127.0.0.1:38473/health");
          if (resp.ok && !cancelled) {
            setServiceStatus({
              ...initialStatus,
              state: "healthy",
              source: "direct",
              message: "connected to local Go service (browser dev mode)",
            });
          } else if (!cancelled) {
            setServiceStatus({
              ...initialStatus,
              state: "error",
              source: "direct",
              message: "Go service /health returned non-OK",
            });
          }
        } catch {
          if (!cancelled) {
            setServiceStatus({
              ...initialStatus,
              state: "error",
              source: "direct",
              message: "Go service unreachable (is ojreviewd running on :38473?)",
            });
          }
        }
        return;
      }

      try {
        const [nextRuntimeInfo, nextServiceStatus] = await Promise.all([
          window.desktopBridge.getRuntimeInfo(),
          window.desktopBridge.getServiceStatus(),
        ]);

        if (cancelled) {
          return;
        }

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
  }, []);

  useEffect(() => {
    void sync();

    const intervalId = window.setInterval(() => {
      void sync();
    }, 5 * 60 * 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [sync]);

  const activeNav = useMemo(
    () => navItems.find((item) => item.id === page) ?? navItems[0],
    [page]
  );
  const lastSyncLabel = lastSyncAt ? formatDate(lastSyncAt.toISOString()) : "尚未同步";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-logo">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
            <div>
              <span className="brand-eyebrow">算法竞赛</span>
              <h1>OJ 错题复盘</h1>
            </div>
          </div>
        </div>

        <nav className="nav-list" aria-label="Primary">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === page ? "nav-item active" : "nav-item"}
              onClick={() => navigateTo(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <div className="nav-text">
                <span className="nav-label">{item.label}</span>
                <span className="nav-kicker">{item.kicker}</span>
              </div>
            </button>
          ))}
        </nav>

        <section className="sidebar-runtime">
          <span className="section-label">运行时</span>
          <dl>
            <div>
              <dt>服务地址</dt>
              <dd>{serviceStatus.url}</dd>
            </div>
            <div>
              <dt>数据目录</dt>
              <dd title={runtimeInfo.runtimeDir || "未就绪"}>
                {runtimeInfo.runtimeDir || "等待中"}
              </dd>
            </div>
            <div>
              <dt>模式</dt>
              <dd>{runtimeInfo.isPackaged ? "发布版" : "开发版"}</dd>
            </div>
          </dl>
        </section>
      </aside>

      <main className="workspace">
        <header className="workspace-header">
          <div>
            <span className="section-label">当前页面</span>
            <h2>{activeNav.label}</h2>
          </div>

          <div className="header-actions">
            <span className={`service-pill ${isOnline ? "healthy" : "error"}`}>
              {isOnline ? "在线" : "离线"}
            </span>
            <button
              type="button"
              className="ghost-button"
              disabled={isSyncing}
              onClick={() => void sync()}
            >
              {isSyncing ? "同步中..." : "立即同步"}
            </button>
            <span className={`service-pill ${serviceStatus.state}`}>
              {serviceStatus.state}
            </span>
            <button
              type="button"
              className="ghost-button"
              onClick={() => window.desktopBridge?.restartService()}
            >
              重启服务
            </button>
          </div>
        </header>

        <section className="service-banner">
          <div>
            <strong>{serviceStatus.message}</strong>
            <p>
              来源：{serviceStatus.source}
              {serviceStatus.pid ? ` / 进程 ${serviceStatus.pid}` : ""}
              {` / 上次同步 ${lastSyncLabel}`}
            </p>
          </div>
        </section>

        {page === "dashboard" ? (
          <DashboardPage serviceStatus={serviceStatus} runtimeInfo={runtimeInfo} cacheStatus={cacheStatus} connectivity={connectivity} syncQueue={syncQueue} onNavigate={navigateTo} />
        ) : null}

        {page === "accounts" ? (
          <AccountsPage serviceStatus={serviceStatus} runtimeInfo={runtimeInfo} />
        ) : null}

        {page === "review" ? (
          <ReviewPage serviceStatus={serviceStatus} runtimeInfo={runtimeInfo} onNavigate={navigateTo} />
        ) : null}

        {page === "analysis" ? (
          <AnalysisPage serviceStatus={serviceStatus} runtimeInfo={runtimeInfo} />
        ) : null}

        {page === "settings" ? (
          <SettingsPage
            runtimeInfo={runtimeInfo}
            serviceStatus={serviceStatus}
            themeMode={themeMode}
            onThemeChange={handleThemeChange}
          />
        ) : null}
      </main>
    </div>
  );
}

export function App() {
  return (
    <NavigationProvider>
      <AppShell />
    </NavigationProvider>
  );
}
