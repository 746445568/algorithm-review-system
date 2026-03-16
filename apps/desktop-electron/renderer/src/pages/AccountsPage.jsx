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
      const account = await api.createAccount(form.platform, form.handle.trim());
      setForm((current) => ({ ...current, handle: "" }));
      // 自动触发同步，无需用户手动点击
      try {
        await api.syncAccount(account.platform, account.id);
        setNotice("账号已绑定，正在后台同步数据...");
      } catch {
        setNotice("账号已保存。请点击「立即同步」开始同步。");
      }
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
      setNotice(`已将 ${account.externalHandle} 加入同步队列。`);
      await refresh();
    } catch (nextError) {
      setError(nextError.message);
    }
  }

  return (
    <div className="page-grid two-column">
      <section className="panel">
        <div className="panel-header">
          <h3>绑定平台账号</h3>
          <span className="caption">写入本地 SQLite 数据库</span>
        </div>
        <form className="form-stack" onSubmit={handleSubmit}>
          <label>
            <span>平台</span>
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
            <span>用户名</span>
            <input
              value={form.handle}
              placeholder="tourist / rng_58 / 你的 AtCoder ID"
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
            {submitting ? "保存中..." : "保存账号"}
          </button>
        </form>
        {serviceUnavailable ? (
          <p className="muted">
            本地服务 {runtimeInfo.serviceUrl || serviceStatus.url} 未就绪，账号操作暂不可用。
          </p>
        ) : null}
        {notice ? <p className="success-text">{notice}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>同步队列</h3>
          <button
            type="button"
            className="ghost-button"
            disabled={serviceUnavailable}
            onClick={() => void refresh()}
          >
            刷新
          </button>
        </div>
        <div className="stack-list">
          {syncTasks.length === 0 ? (
            <p className="muted">暂无同步任务。</p>
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
          <h3>已绑定账号</h3>
          <span className="caption">Electron 端的同步入口</span>
        </div>
        <div className="stack-list">
          {accounts.length === 0 ? (
            <p className="muted">尚无账号，请先绑定 Codeforces 或 AtCoder。</p>
          ) : (
            accounts.map((account) => {
              const latestTask = latestTaskByAccount.get(account.id);
              return (
                <article key={account.id} className="account-card">
                  <div className="account-main">
                    <span className="section-label">{platformLabel(account.platform)}</span>
                    <h4>{account.externalHandle}</h4>
                    <p>
                      {statusLabel(account.status)} / 上次同步{" "}
                      {formatDate(account.lastSyncedAt)}
                    </p>
                    {latestTask ? (
                      <p className="muted">
                        最新任务: {statusLabel(latestTask.status)} / 拉取{" "}
                        {latestTask.fetchedCount} / 写入 {latestTask.insertedCount}
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
                      立即同步
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
