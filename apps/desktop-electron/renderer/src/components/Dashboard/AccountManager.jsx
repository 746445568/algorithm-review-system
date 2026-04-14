import { memo } from "react";
import { formatDate, platformLabel, statusLabel } from "../../lib/format.js";

const platforms = [
  { value: "CODEFORCES", label: "Codeforces" },
  { value: "ATCODER", label: "AtCoder" },
];

export const AccountManager = memo(function AccountManager({
  serviceUnavailable,
  loading,
  error,
  notice,
  form,
  submitting,
  setForm,
  handleSubmit,
  accounts,
  latestTaskByAccount,
  refreshingIds,
  handleRefreshRating,
  triggerSync,
  deleteAccount,
  refresh,
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h3>已绑定账号</h3>
        <button
          type="button"
          className="ghost-button"
          disabled={serviceUnavailable}
          onClick={() => void refresh()}
        >
          刷新
        </button>
      </div>
      {loading ? <p className="muted">正在加载仪表盘数据...</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
      {notice ? <p className="success-text">{notice}</p> : null}

      <form className="form-stack" onSubmit={handleSubmit} style={{ marginBottom: 16 }}>
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
            placeholder="输入你的用户名"
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

      <div className="stack-list">
        {accounts.length === 0 ? (
          <p className="muted">尚未绑定任何平台账号。</p>
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
                      最新任务：{statusLabel(latestTask.status)} / 拉取{" "}
                      {latestTask.fetchedCount} / 写入 {latestTask.insertedCount}
                    </p>
                  ) : null}
                  {account.rating != null ? (
                    <p className="muted">评分：{account.rating}（最高 {account.maxRating ?? account.rating}）</p>
                  ) : (
                    <p className="muted">评分：暂未获取</p>
                  )}
                </div>
                <div className="account-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={serviceUnavailable || refreshingIds.has(account.id)}
                    onClick={() => void handleRefreshRating(account)}
                  >
                    {refreshingIds.has(account.id) ? "刷新中..." : "刷新评分"}
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={serviceUnavailable}
                    onClick={() => void triggerSync(account)}
                  >
                    立即同步
                  </button>
                  <button
                    type="button"
                    className="ghost-button danger"
                    disabled={serviceUnavailable}
                    onClick={() => void deleteAccount(account)}
                  >
                    删除
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
});
