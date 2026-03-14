import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { formatDate, platformLabel, statusLabel } from "../lib/format.js";

const platforms = [
  { value: "CODEFORCES", label: "Codeforces" },
  { value: "ATCODER", label: "AtCoder" },
];

export function AccountsPage({ serviceStatus, runtimeInfo }) {
  const [accounts, setAccounts] = useState([]);
  const [syncTasks, setSyncTasks] = useState([]);
  const [form, setForm] = useState({ platform: "CODEFORCES", handle: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const refreshSequenceRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = refreshSequenceRef.current + 1;
    refreshSequenceRef.current = requestId;

    if (serviceStatus.state !== "healthy") {
      return;
    }

    setError("");
    try {
      const [nextAccounts, nextSyncTasks] = await Promise.all([
        api.getAccounts(),
        api.getSyncTasks(),
      ]);
      if (requestId !== refreshSequenceRef.current) {
        return;
      }
      setAccounts(nextAccounts);
      setSyncTasks(nextSyncTasks);
    } catch (nextError) {
      if (requestId !== refreshSequenceRef.current) {
        return;
      }
      setError(nextError.message);
    }
  }, [serviceStatus.state]);

  useEffect(() => {
    void refresh();
    if (serviceStatus.state !== "healthy") {
      return undefined;
    }

    const timer = window.setInterval(() => {
      void refresh();
    }, 12000);
    return () => window.clearInterval(timer);
  }, [refresh, serviceStatus.state]);

  const latestTaskByAccount = useMemo(() => {
    const index = new Map();
    for (const task of syncTasks) {
      if (!index.has(task.platformAccountId)) {
        index.set(task.platformAccountId, task);
      }
    }
    return index;
  }, [syncTasks]);

  const serviceUnavailable = serviceStatus.state !== "healthy";

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setNotice("");

    try {
      await api.createAccount(form.platform, form.handle.trim());
      setForm((current) => ({ ...current, handle: "" }));
      setNotice("Account saved.");
      await refresh();
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function triggerSync(account) {
    setError("");
    setNotice("");

    try {
      await api.syncAccount(account.platform, account.id);
      setNotice(`Queued sync for ${account.externalHandle}.`);
      await refresh();
    } catch (nextError) {
      setError(nextError.message);
    }
  }

  return (
    <div className="page-grid two-column">
      <section className="panel">
        <div className="panel-header">
          <h3>Bind platform account</h3>
          <span className="caption">Writes directly into the local SQLite runtime</span>
        </div>
        <form className="form-stack" onSubmit={handleSubmit}>
          <label>
            <span>Platform</span>
            <select
              value={form.platform}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  platform: event.target.value,
                }))
              }
            >
              {platforms.map((platform) => (
                <option key={platform.value} value={platform.value}>
                  {platform.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Handle</span>
            <input
              value={form.handle}
              placeholder="tourist / rng_58 / your_atcoder_id"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  handle: event.target.value,
                }))
              }
            />
          </label>

          <button
            type="submit"
            className="primary-button"
            disabled={submitting || !form.handle.trim() || serviceUnavailable}
          >
            {submitting ? "Saving..." : "Save account"}
          </button>
        </form>
        {serviceUnavailable ? (
          <p className="muted">
            Account actions stay disabled until the local service at {runtimeInfo.serviceUrl || serviceStatus.url} is healthy.
          </p>
        ) : null}
        {notice ? <p className="success-text">{notice}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>Recent sync queue</h3>
          <button
            type="button"
            className="ghost-button"
            disabled={serviceUnavailable}
            onClick={() => void refresh()}
          >
            Refresh
          </button>
        </div>
        <div className="stack-list">
          {syncTasks.length === 0 ? (
            <p className="muted">No sync task has been created yet.</p>
          ) : (
            syncTasks.slice(0, 8).map((task) => (
              <article key={task.id} className="inline-card">
                <div>
                  <strong>{statusLabel(task.status)}</strong>
                  <p>{formatDate(task.createdAt)}</p>
                </div>
                <div className="meta-pill">
                  {task.fetchedCount}/{task.insertedCount}
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="panel full-span">
        <div className="panel-header">
          <h3>Connected accounts</h3>
          <span className="caption">First real sync surface for Electron</span>
        </div>
        <div className="stack-list">
          {accounts.length === 0 ? (
            <p className="muted">No account exists yet. Start with Codeforces or AtCoder.</p>
          ) : (
            accounts.map((account) => {
              const latestTask = latestTaskByAccount.get(account.id);
              return (
                <article key={account.id} className="account-card">
                  <div className="account-main">
                    <span className="section-label">{platformLabel(account.platform)}</span>
                    <h4>{account.externalHandle}</h4>
                    <p>
                      {statusLabel(account.status)} / last synced{" "}
                      {formatDate(account.lastSyncedAt)}
                    </p>
                    {latestTask ? (
                      <p className="muted">
                        latest task: {statusLabel(latestTask.status)} / fetched{" "}
                        {latestTask.fetchedCount} / inserted {latestTask.insertedCount}
                      </p>
                    ) : null}
                  </div>
                  <div className="account-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={serviceUnavailable}
                      onClick={() => void triggerSync(account)}
                    >
                      Sync now
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
