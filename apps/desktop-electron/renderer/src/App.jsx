import { useEffect, useMemo, useState } from "react";
import { DashboardPage } from "./pages/DashboardPage.jsx";
import { AccountsPage } from "./pages/AccountsPage.jsx";
import { ReviewPage } from "./pages/ReviewPage.jsx";
import { SettingsPage } from "./pages/SettingsPage.jsx";
import { formatDate } from "./lib/format.js";
import { useOfflineData } from "./hooks/useOfflineData.js";
import { useThemeMode } from "./hooks/useThemeMode.js";
import { useDesktopRuntime } from "./hooks/useDesktopRuntime.js";
import { ServiceRuntimePanel } from "./components/ServiceRuntimePanel.jsx";
import { desktopBridge } from "./lib/desktopBridge.js";

const navItems = [
  { id: "dashboard", label: "仪表盘", kicker: "总览" },
  { id: "accounts", label: "账号管理", kicker: "同步" },
  { id: "review", label: "错题复习", kicker: "工作流" },
  { id: "settings", label: "设置", kicker: "配置" },
];

export function App() {
  const [page, setPage] = useState("dashboard");
  const { runtimeInfo, serviceStatus } = useDesktopRuntime();
  const { isOnline, isSyncing, lastSyncAt, sync } = useOfflineData();
  const { themeMode, onThemeChange } = useThemeMode();

  useEffect(() => {
    void sync();
    const intervalId = window.setInterval(() => {
      void sync();
    }, 5 * 60 * 1000);
    return () => window.clearInterval(intervalId);
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
  const staleCollections = Object.entries(cacheStatus)
    .filter(([, value]) => value?.stale)
    .map(([key]) => key);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <span className="brand-eyebrow">算法竞赛</span>
          <h1>OJ 错题复盘</h1>
          <p>基于本地 Go 服务的 Electron 桌面端，专注于真实数据、运行稳定性和可用的复习闭环。</p>
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

        <ServiceRuntimePanel runtimeInfo={runtimeInfo} serviceStatus={serviceStatus} />
      </aside>

      <main className="workspace">
        <header className="workspace-header">
          <div>
            <span className="section-label">当前页面</span>
            <h2>{activeNav.label}</h2>
          </div>

          <div className="header-actions">
            <span className={`service-pill ${isOnline ? "healthy" : "error"}`}>{isOnline ? "在线" : "离线"}</span>
            <button type="button" className="ghost-button" disabled={isSyncing} onClick={() => void sync()}>
              {isSyncing ? "同步中..." : "立即同步"}
            </button>
            <span className={`service-pill ${serviceStatus.state}`}>{serviceStatus.state}</span>
            <button type="button" className="ghost-button" onClick={() => desktopBridge.restartService()}>
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
              {staleCollections.length > 0 ? ` / 陈旧缓存 ${staleCollections.join("、")}` : " / 缓存新鲜"}
            </p>
            <p>{statusMessage}</p>
          </div>
          <div className="banner-meta">
            <span className="meta-pill">待同步操作 {syncQueue.length}</span>
            <span className="meta-pill">
              题库 {cacheStatus.problems?.lastSyncedAt ? formatDate(cacheStatus.problems.lastSyncedAt) : "未同步"}
            </span>
            <span className="meta-pill">
              提交 {cacheStatus.submissions?.lastSyncedAt ? formatDate(cacheStatus.submissions.lastSyncedAt) : "未同步"}
            </span>
          </div>
        </section>

        {page === "dashboard" ? <DashboardPage serviceStatus={serviceStatus} runtimeInfo={runtimeInfo} /> : null}
        {page === "accounts" ? <AccountsPage serviceStatus={serviceStatus} runtimeInfo={runtimeInfo} /> : null}
        {page === "review" ? <ReviewPage serviceStatus={serviceStatus} runtimeInfo={runtimeInfo} /> : null}
        {page === "settings" ? (
          <SettingsPage
            runtimeInfo={runtimeInfo}
            serviceStatus={serviceStatus}
            serviceCapabilities={serviceCapabilities}
            themeMode={themeMode}
            onThemeChange={onThemeChange}
          />
        ) : null}
      </main>
    </div>
  );
}
