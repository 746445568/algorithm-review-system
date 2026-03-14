import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { formatDate, platformLabel, statusLabel } from "../lib/format.js";

export function DashboardPage({ serviceStatus, runtimeInfo }) {
  const [data, setData] = useState({
    owner: null,
    accounts: [],
    syncTasks: [],
    reviewSummary: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refreshSequenceRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = refreshSequenceRef.current + 1;
    refreshSequenceRef.current = requestId;

    if (serviceStatus.state !== "healthy") {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const [owner, accounts, syncTasks, reviewSummary] = await Promise.all([
        api.getOwner(),
        api.getAccounts(),
        api.getSyncTasks(),
        api.getReviewSummary(),
      ]);

      if (requestId !== refreshSequenceRef.current) {
        return;
      }

      setData({ owner, accounts, syncTasks, reviewSummary });
    } catch (nextError) {
      if (requestId !== refreshSequenceRef.current) {
        return;
      }
      setError(nextError.message);
    } finally {
      if (requestId === refreshSequenceRef.current) {
        setLoading(false);
      }
    }
  }, [serviceStatus.state]);

  useEffect(() => {
    void refresh();
    if (serviceStatus.state !== "healthy") {
      return undefined;
    }

    const timer = window.setInterval(() => {
      void refresh();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [refresh, serviceStatus.state]);

  const latestTask = data.syncTasks[0];
  const weakTags = data.reviewSummary?.weakTags ?? [];
  const repeatedFailures = data.reviewSummary?.repeatedFailures ?? [];
  const recentUnsolved = data.reviewSummary?.recentUnsolved ?? [];
  const reviewCounts = data.reviewSummary?.reviewStatusCounts ?? {};
  const serviceUnavailable = serviceStatus.state !== "healthy";

  return (
    <div className="page-grid">
      <section className="panel hero-panel">
        <div className="hero-copy">
          <span className="section-label">runtime health</span>
          <h3>
            {data.owner?.app?.name ?? "OJ Review Desktop"} on{" "}
            {serviceStatus.state === "healthy" ? "real local data" : "bootstrapping"}
          </h3>
          <p>
            This dashboard is wired to the Go local service rather than mock JSON. It now
            tracks both sync activity and the actual review pipeline state for each problem.
          </p>
        </div>
        <div className="hero-stats">
          <div>
            <span>Service</span>
            <strong>{statusLabel(serviceStatus.state)}</strong>
          </div>
          <div>
            <span>Accounts</span>
            <strong>{data.accounts.length}</strong>
          </div>
          <div>
            <span>Due now</span>
            <strong>{data.reviewSummary?.dueReviewCount ?? 0}</strong>
          </div>
          <div>
            <span>Scheduled</span>
            <strong>{data.reviewSummary?.scheduledReviewCount ?? 0}</strong>
          </div>
        </div>
      </section>

      <section className="panel stats-strip">
        <article>
          <span>Total submissions</span>
          <strong>{data.reviewSummary?.totalSubmissions ?? 0}</strong>
        </article>
        <article>
          <span>Todo</span>
          <strong>{reviewCounts.TODO ?? 0}</strong>
        </article>
        <article>
          <span>Reviewing</span>
          <strong>{reviewCounts.REVIEWING ?? 0}</strong>
        </article>
        <article>
          <span>Done</span>
          <strong>{reviewCounts.DONE ?? 0}</strong>
        </article>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>Connected accounts</h3>
          <button
            type="button"
            className="ghost-button"
            disabled={serviceUnavailable}
            onClick={() => void refresh()}
          >
            Refresh
          </button>
        </div>
        {serviceUnavailable ? (
          <p className="muted">
            Waiting for the local service at {runtimeInfo.serviceUrl || serviceStatus.url} to become healthy.
          </p>
        ) : null}
        {loading ? <p className="muted">Loading dashboard data...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
        <div className="stack-list">
          {data.accounts.length === 0 ? (
            <p className="muted">No platform accounts connected yet.</p>
          ) : (
            data.accounts.map((account) => (
              <article key={account.id} className="inline-card">
                <div>
                  <strong>{platformLabel(account.platform)}</strong>
                  <p>{account.externalHandle}</p>
                </div>
                <div className="meta-pill">
                  {statusLabel(account.status)}
                  <span>{formatDate(account.lastSyncedAt)}</span>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>Review pipeline</h3>
          <span className="caption">Current queue shape</span>
        </div>
        <div className="stack-list">
          <article className="inline-card">
            <div>
              <strong>Scheduled</strong>
              <p>Problems with a next review time</p>
            </div>
            <div className="meta-pill">{data.reviewSummary?.scheduledReviewCount ?? 0}</div>
          </article>
          <article className="inline-card">
            <div>
              <strong>Due now</strong>
              <p>Items whose next review time has passed</p>
            </div>
            <div className="meta-pill">{data.reviewSummary?.dueReviewCount ?? 0}</div>
          </article>
          <article className="inline-card">
            <div>
              <strong>Recovered</strong>
              <p>Problems that eventually reached AC</p>
            </div>
            <div className="meta-pill">
              {data.reviewSummary?.problemSummaries?.filter((item) => item.solvedLater).length ?? 0}
            </div>
          </article>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>Weak tags</h3>
          <span className="caption">Top low-accuracy clusters</span>
        </div>
        <div className="stack-list">
          {weakTags.length === 0 ? (
            <p className="muted">No aggregated tag signal yet.</p>
          ) : (
            weakTags.map((item) => (
              <article key={item.tag} className="inline-card">
                <div>
                  <strong>{item.tag}</strong>
                  <p>{item.attempts} attempts</p>
                </div>
                <div className="meta-pill">
                  {item.acRate}%
                  <span>{item.acCount} AC</span>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>Repeated failures</h3>
          <span className="caption">Problems that still loop</span>
        </div>
        <div className="stack-list">
          {repeatedFailures.length === 0 ? (
            <p className="muted">Nothing has crossed the repeated-failure threshold.</p>
          ) : (
            repeatedFailures.map((item) => (
              <article key={`${item.problemId}-${item.externalProblemId}`} className="inline-card">
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.externalProblemId}</p>
                </div>
                <div className="meta-pill">{item.failedCount} fails</div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>Recent unsolved</h3>
          <span className="caption">Fresh items for review</span>
        </div>
        <div className="stack-list">
          {recentUnsolved.length === 0 ? (
            <p className="muted">No unsolved items in the current snapshot.</p>
          ) : (
            recentUnsolved.map((item) => (
              <article key={`${item.problemId}-${item.externalProblemId}`} className="inline-card">
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.externalProblemId}</p>
                </div>
                <div className="meta-pill">{formatDate(item.lastSubmittedAt)}</div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>Latest task</h3>
          <span className="caption">Most recent sync activity</span>
        </div>
        {latestTask ? (
          <div className="task-card">
            <strong>{statusLabel(latestTask.status)}</strong>
            <p>{formatDate(latestTask.createdAt)}</p>
            <p>
              fetched {latestTask.fetchedCount} / inserted {latestTask.insertedCount}
            </p>
            {latestTask.errorMessage ? (
              <p className="error-text">{latestTask.errorMessage}</p>
            ) : null}
          </div>
        ) : (
          <p className="muted">No sync tasks yet.</p>
        )}
      </section>

      <section className="panel full-span">
        <div className="panel-header">
          <h3>Runtime</h3>
          <span className="caption">Local shell context</span>
        </div>
        <div className="mini-stats">
          <article>
            <span>Runtime dir</span>
            <strong title={runtimeInfo.runtimeDir || "pending"}>
              {runtimeInfo.runtimeDir || "pending"}
            </strong>
          </article>
          <article>
            <span>Service URL</span>
            <strong>{runtimeInfo.serviceUrl || "pending"}</strong>
          </article>
          <article>
            <span>Packaged</span>
            <strong>{runtimeInfo.isPackaged ? "Yes" : "No"}</strong>
          </article>
        </div>
      </section>
    </div>
  );
}
