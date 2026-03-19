import { useCallback, useEffect, useMemo, useState } from "react";
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
  { id: "dashboard", label: "仪表盘", kicker: "总览" },
  { id: "accounts", label: "账号管理", kicker: "同步" },
  { id: "review", label: "错题复习", kicker: "工作流" },
  { id: "settings", label: "设置", kicker: "配置" },
];

const unsupportedServiceMessage =
  "当前服务版本过旧，请重新构建 apps/server，以启用桌面端所需的新接口。";

const initialServiceCapabilities = {
  reviewStateSupported: false,
  aiSettingsSupported: false,
  diagnosticsExportSupported: false,
  serviceVersion: "unknown",
  detectionSource: "unknown",
};

const initialStatus = {
  state: "starting",
  url: "http://127.0.0.1:38473",
  runtimeDir: "",
  source: "bridge",
  message: "waiting for desktop bridge",
  pid: null,
};

export function App() {
  const [page, setPage] = useState("dashboard");
  const [serviceStatus, setServiceStatus] = useState(initialStatus);
  const [runtimeInfo, setRuntimeInfo] = useState({
    serviceUrl: initialStatus.url,
    runtimeDir: "",
    appPath: "",
    isPackaged: false,
  });
  const [serviceCapabilities, setServiceCapabilities] = useState(initialServiceCapabilities);
  const { isOnline, isSyncing, lastSyncAt, sync } = useOfflineData();
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
        if (!cancelled) {
          setServiceStatus({
            ...initialStatus,
            state: "error",
            source: "bridge",
            message: "desktop bridge unavailable; preload did not initialize",
          });
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


  useEffect(() => {
    let cancelled = false;

    async function loadServiceCapabilities() {
      if (serviceStatus.state !== "healthy") {
        if (!cancelled) {
          setServiceCapabilities(initialServiceCapabilities);
        }
        return;
      }

      try {
        const nextCapabilities = await api.getServiceCapabilities();
        if (!cancelled) {
          setServiceCapabilities(nextCapabilities);
        }
      } catch (error) {
        if (!cancelled) {
          setServiceCapabilities({
            ...initialServiceCapabilities,
            detectionSource: "unavailable",
          });
          setServiceStatus((current) => ({
            ...current,
            message: `${current.message}; capability check failed: ${error.message}`,
          }));
        }
      }
    }

    void loadServiceCapabilities();
    return () => {
      cancelled = true;
    };
  }, [serviceStatus.state, serviceStatus.url]);

  const hasLegacyServiceMismatch =
    serviceStatus.state === "healthy" &&
    (!serviceCapabilities.reviewStateSupported ||
      !serviceCapabilities.aiSettingsSupported ||
      !serviceCapabilities.diagnosticsExportSupported);

  const unsupportedFeatures = [
    !serviceCapabilities.reviewStateSupported ? "复习状态" : null,
    !serviceCapabilities.aiSettingsSupported ? "AI 设置" : null,
    !serviceCapabilities.diagnosticsExportSupported ? "诊断导出" : null,
  ].filter(Boolean);
  const serviceVersionLabel = serviceCapabilities.serviceVersion || "unknown";

  const activeNav = useMemo(
    () => navItems.find((item) => item.id === page) ?? navItems[0],
    [page]
  );
  const lastSyncLabel = lastSyncAt ? formatDate(lastSyncAt.toISOString()) : "尚未同步";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <span className="brand-eyebrow">算法竞赛</span>
          <h1>OJ 错题复盘</h1>
          <p>
            基于本地 Go 服务的 Electron 桌面端，专注于真实数据、运行稳定性和可用的复习闭环。
          </p>
        </div>

        <nav className="nav-list" aria-label="Primary">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === page ? "nav-item active" : "nav-item"}
              onClick={() => setPage(item.id)}
            >
              <span className="nav-kicker">{item.kicker}</span>
              <span className="nav-label">{item.label}</span>
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
              来源: {serviceStatus.source}
              {serviceStatus.pid ? ` / 进程 ${serviceStatus.pid}` : ""}
              {` / 上次同步 ${lastSyncLabel}`}
            </p>
          </div>
        </section>

        {hasLegacyServiceMismatch ? (
          <section className="service-warning-banner" role="alert">
            <div>
              <strong>{unsupportedServiceMessage}</strong>
              <p>
                当前服务版本: {serviceVersionLabel}
                {unsupportedFeatures.length > 0 ? ` / 缺失能力: ${unsupportedFeatures.join("、")}` : ""}
                {serviceCapabilities.detectionSource !== "unknown"
                  ? ` / 检测方式: ${serviceCapabilities.detectionSource}`
                  : ""}
              </p>
            </div>
          </section>
        ) : null}

        {page === "dashboard" ? (
          <DashboardPage serviceStatus={serviceStatus} runtimeInfo={runtimeInfo} />
        ) : null}

        {page === "accounts" ? (
          <AccountsPage serviceStatus={serviceStatus} runtimeInfo={runtimeInfo} />
        ) : null}

        {page === "review" ? (
          <ReviewPage
            serviceStatus={serviceStatus}
            runtimeInfo={runtimeInfo}
            serviceCapabilities={serviceCapabilities}
          />
        ) : null}

        {page === "settings" ? (
          <SettingsPage
            runtimeInfo={runtimeInfo}
            serviceStatus={serviceStatus}
            serviceCapabilities={serviceCapabilities}
            themeMode={themeMode}
            onThemeChange={handleThemeChange}
          />
        ) : null}
      </main>
    </div>
  );
}
