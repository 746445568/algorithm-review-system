import { useEffect, useMemo, useState } from "react";
import { DashboardPage } from "./pages/DashboardPage.jsx";
import { AccountsPage } from "./pages/AccountsPage.jsx";
import { ReviewPage } from "./pages/ReviewPage.jsx";
import { SettingsPage } from "./pages/SettingsPage.jsx";
import { api } from "./lib/api.js";

const navItems = [
  { id: "dashboard", label: "Dashboard", kicker: "overview" },
  { id: "accounts", label: "Accounts", kicker: "sync" },
  { id: "review", label: "Review", kicker: "workflow" },
  { id: "settings", label: "Settings", kicker: "configure" },
];

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

  const activeNav = useMemo(
    () => navItems.find((item) => item.id === page) ?? navItems[0],
    [page]
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <span className="brand-eyebrow">competitive programming</span>
          <h1>OJ Review</h1>
          <p>
            Electron shell over the local Go service. This cut only focuses on
            real data, runtime stability, and the first usable review loop.
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
          <span className="section-label">runtime</span>
          <dl>
            <div>
              <dt>service</dt>
              <dd>{serviceStatus.url}</dd>
            </div>
            <div>
              <dt>dir</dt>
              <dd title={runtimeInfo.runtimeDir || "not ready"}>
                {runtimeInfo.runtimeDir || "pending"}
              </dd>
            </div>
            <div>
              <dt>mode</dt>
              <dd>{runtimeInfo.isPackaged ? "packaged" : "development"}</dd>
            </div>
          </dl>
        </section>
      </aside>

      <main className="workspace">
        <header className="workspace-header">
          <div>
            <span className="section-label">current page</span>
            <h2>{activeNav.label}</h2>
          </div>

          <div className="header-actions">
            <span className={`service-pill ${serviceStatus.state}`}>
              {serviceStatus.state}
            </span>
            <button
              type="button"
              className="ghost-button"
              onClick={() => window.desktopBridge?.restartService()}
            >
              Restart local service
            </button>
          </div>
        </header>

        <section className="service-banner">
          <div>
            <strong>{serviceStatus.message}</strong>
            <p>
              source: {serviceStatus.source}
              {serviceStatus.pid ? ` / pid ${serviceStatus.pid}` : ""}
            </p>
          </div>
        </section>

        {page === "dashboard" ? (
          <DashboardPage serviceStatus={serviceStatus} runtimeInfo={runtimeInfo} />
        ) : null}

        {page === "accounts" ? (
          <AccountsPage serviceStatus={serviceStatus} runtimeInfo={runtimeInfo} />
        ) : null}

        {page === "review" ? (
          <ReviewPage serviceStatus={serviceStatus} runtimeInfo={runtimeInfo} />
        ) : null}

        {page === "settings" ? (
          <SettingsPage runtimeInfo={runtimeInfo} serviceStatus={serviceStatus} />
        ) : null}
      </main>
    </div>
  );
}
