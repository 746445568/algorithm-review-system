import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { formatDate, platformLabel, statusLabel, tagLabel } from "../lib/format.js";
import { useNavigation } from "../lib/NavigationContext.jsx";

const platforms = [
  { value: "CODEFORCES", label: "Codeforces" },
  { value: "ATCODER", label: "AtCoder" },
];

function getFreshnessLabel(meta) {
  if (!meta?.lastSyncedAt) {
    return "未同步";
  }
  return meta.stale ? "缓存可能陈旧" : "已更新";
}

export function DashboardPage({ serviceStatus, runtimeInfo, cacheStatus = {}, connectivity, syncQueue = [], onNavigate }) {
  const [data, setData] = useState({
    owner: null,
    accounts: [],
    syncTasks: [],
    reviewSummary: null,
    goals: [],
  });
  const { navigateTo } = useNavigation();
  const [latestAnalysis, setLatestAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ platform: "CODEFORCES", handle: "" });
  const [submitting, setSubmitting] = useState(false);
  const [refreshingIds, setRefreshingIds] = useState(new Set());
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
      const [owner, accounts, syncTasks, reviewSummary, goals] = await Promise.all([
        api.getOwner(),
        api.getAccounts(),
        api.getSyncTasks(),
        api.getReviewSummary(),
        api.getGoals(),
      ]);

      if (requestId !== refreshSequenceRef.current) {
        return;
      }

      setData({ owner, accounts, syncTasks, reviewSummary, goals });
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

  useEffect(() => {
    api.getLatestAnalysis()
      .then((data) => setLatestAnalysis(data?.task ?? null))
      .catch((err) => console.error("getLatestAnalysis failed:", err));
  }, []);

  const latestTaskByAccount = useMemo(() => {
    const index = new Map();
    for (const task of data.syncTasks) {
      if (!index.has(task.platformAccountId)) {
        index.set(task.platformAccountId, task);
      }
    }
    return index;
  }, [data.syncTasks]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setNotice("");

    try {
      await api.createAccount(form.platform, form.handle.trim());
      setForm((current) => ({ ...current, handle: "" }));
      setNotice("账号已保存。");
      await refresh();
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteAccount(account) {
    setError("");
    setNotice("");

    try {
      await api.deleteAccount(account.id);
      setNotice(`已删除 ${account.externalHandle}。`);
      await refresh();
    } catch (nextError) {
      setError(nextError.message);
    }
  }

  const handleRefreshRating = useCallback(async (account) => {
    setRefreshingIds(prev => new Set(prev).add(account.id));
    setError("");
    try {
      await api.refreshRating(account.id);
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setRefreshingIds(prev => { const s = new Set(prev); s.delete(account.id); return s; });
    }
  }, [refresh]);

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

  const latestTask = data.syncTasks[0];
  const weakTags = data.reviewSummary?.weakTags ?? [];
  const repeatedFailures = data.reviewSummary?.repeatedFailures ?? [];
  const recentUnsolved = data.reviewSummary?.recentUnsolved ?? [];
  const reviewCounts = data.reviewSummary?.reviewStatusCounts ?? {};
  const serviceUnavailable = serviceStatus.state !== "healthy";

  return (
    <div className="page-grid">
      <section className="dash-ai-card">
        <div className="dash-ai-header">
          <span className="dash-ai-title">🤖 AI 分析</span>
          {latestAnalysis ? (
            <span className="muted">{latestAnalysis.period === "week" ? "本周" : "本月"} · {new Date(latestAnalysis.updatedAt).toLocaleString('zh-CN')}</span>
          ) : (
            <span className="muted">暂无历史记录</span>
          )}
        </div>
        {latestAnalysis ? (
          <>
            <p className="dash-ai-preview">
              {latestAnalysis.resultText?.slice(0, 80)}…
            </p>
            <button
              type="button"
              className="ghost-button"
              onClick={() => navigateTo("analysis")}
            >
              进入分析页 →
            </button>
          </>
        ) : (
          <button
            type="button"
            className="primary-button"
            onClick={() => navigateTo("analysis")}
          >
            生成首份分析
          </button>
        )}
      </section>

        <section className="panel hero-panel">
        <div className="hero-copy">
          <span className="section-label">
            {serviceStatus.state === "healthy" ? "已连接" : "连接中"}
          </span>
          <h3>
            {serviceStatus.state === "healthy"
              ? `欢迎回来，${data.accounts[0]?.externalHandle || "开发者"}`
              : "OJ 错题复盘 正在启动"}
          </h3>
          <p>
            {serviceStatus.state === "healthy"
              ? `当前有 ${data.reviewSummary?.dueReviewCount ?? 0} 道题目等待复习，${data.reviewSummary?.totalSubmissions ?? 0} 次提交记录已同步。`
              : "正在连接本地 Go 服务..."}
          </p>
        </div>
        <div className="hero-stats">
          <div className={serviceStatus.state === "healthy" ? "stat-good" : ""}>
            <span>服务状态</span>
            <strong>{statusLabel(serviceStatus.state)}</strong>
          </div>
          <div>
            <span>网络判定</span>
            <strong>{connectivity === "service-unreachable" ? "服务不可达" : connectivity === "offline" ? "离线" : "在线"}</strong>
          </div>
          <div className={data.reviewSummary?.dueReviewCount > 0 ? "stat-accent" : ""}>
            <span>待复习</span>
            <strong>{data.reviewSummary?.dueReviewCount ?? 0}</strong>
          </div>
          <div>
            <span>待同步操作</span>
            <strong>{syncQueue.length}</strong>
          </div>
        </div>
      </section>

      {data.goals.length > 0 ? (
        <section className="panel">
          <div className="panel-header">
            <h3>目标进度</h3>
          </div>
          <div className="stack-list">
            {data.goals.map((goal) => {
              const account = data.accounts.find((a) => a.platform === goal.platform);
              const current = account?.rating ?? 0;
              const pct = Math.min(100, Math.round((current / goal.targetRating) * 100));
              return (
                <article key={goal.id} className="goal-card">
                  <div className="goal-header">
                    <strong>{goal.title}</strong>
                    <span className="muted">{current} / {goal.targetRating}</span>
                  </div>
                  <div className="goal-bar-track">
                    <div className="goal-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="goal-footer muted">
                    {pct}% 完成
                    {goal.deadline ? ` · 截止 ${new Date(goal.deadline).toLocaleDateString("zh-CN")}` : ""}
                  </p>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="panel stats-strip full-span">
        <article>
          <span>题库缓存</span>
          <strong>{getFreshnessLabel(cacheStatus.problems)}</strong>
          <small>{formatDate(cacheStatus.problems?.lastSyncedAt)}</small>
        </article>
        <article>
          <span>提交缓存</span>
          <strong>{getFreshnessLabel(cacheStatus.submissions)}</strong>
          <small>{formatDate(cacheStatus.submissions?.lastSyncedAt)}</small>
        </article>
        <article>
          <span>账号缓存</span>
          <strong>{getFreshnessLabel(cacheStatus.accounts)}</strong>
          <small>{formatDate(cacheStatus.accounts?.lastSyncedAt)}</small>
        </article>
        <article>
          <span>复习状态缓存</span>
          <strong>{getFreshnessLabel(cacheStatus.reviewStates)}</strong>
          <small>{formatDate(cacheStatus.reviewStates?.lastSyncedAt)}</small>
        </article>
      </section>

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
        {serviceUnavailable ? (
          <p className="muted">等待本地服务 {runtimeInfo.serviceUrl || serviceStatus.url} 就绪。</p>
        ) : null}
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
          {data.accounts.length === 0 ? (
            <p className="muted">尚未绑定任何平台账号。</p>
          ) : (
            data.accounts.map((account) => {
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

      <section className="panel">
        <div className="panel-header">
          <h3>离线可预期性</h3>
          <span className="caption">缓存与重试状态</span>
        </div>
        <div className="stack-list">
          {syncQueue.length === 0 ? (
            <p className="muted">同步队列为空，没有待重试的离线写操作。</p>
          ) : (
            syncQueue.map((item) => (
              <article key={item.id} className="inline-card">
                <div>
                  <strong>{item.type || "unknown"}</strong>
                  <p>{item.path}</p>
                </div>
                <div className="meta-pill">
                  重试 {item.retryCount ?? 0} 次
                  <span>{item.lastError || "等待发送"}</span>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>复习管线</h3>
          <span className="caption">当前队列概况</span>
        </div>
        <div className="stack-list">
          <article className="inline-card">
            <div>
              <strong>已排期</strong>
              <p>设置了下次复习时间的题目</p>
            </div>
            <div className="meta-pill">{data.reviewSummary?.scheduledReviewCount ?? 0}</div>
          </article>
          <article className="inline-card">
            <div>
              <strong>待复习</strong>
              <p>复习时间已到的题目</p>
            </div>
            <div className="meta-pill">{data.reviewSummary?.dueReviewCount ?? 0}</div>
          </article>
          <article className="inline-card">
            <div>
              <strong>已恢复</strong>
              <p>最终通过 (AC) 的题目</p>
            </div>
            <div className="meta-pill">
              {data.reviewSummary?.problemSummaries?.filter((item) => item.solvedLater).length ?? 0}
            </div>
          </article>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>薄弱标签</h3>
          <span className="caption">正确率最低的知识点</span>
        </div>
        <div className="stack-list">
          {weakTags.length === 0 ? (
            <p className="muted">暂无标签统计数据。</p>
          ) : (
            weakTags.map((item) => (
              <article key={item.tag} className="inline-card">
                <div>
                  <strong>{tagLabel(item.tag)}</strong>
                  <p>{item.attempts} 次尝试</p>
                </div>
                <div className="meta-pill">
                  {item.acRate}%
                  <span>{item.acCount} 次 AC</span>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>反复失败</h3>
          <span className="caption">仍在循环出错的题目</span>
        </div>
        <div className="stack-list">
          {repeatedFailures.length === 0 ? (
            <p className="muted">没有题目超过反复失败阈值。</p>
          ) : (
            repeatedFailures.map((item) => (
              <article key={`${item.problemId}-${item.externalProblemId}`} className="inline-card">
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.externalProblemId}</p>
                </div>
                <div className="meta-pill">{item.failedCount} 次失败</div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>最近未解决</h3>
          <span className="caption">需要复习的新题目</span>
        </div>
        <div className="stack-list">
          {recentUnsolved.length === 0 ? (
            <p className="muted">当前快照中没有未解决的题目。</p>
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
          <h3>最新任务</h3>
          <span className="caption">最近一次同步活动</span>
        </div>
        {latestTask ? (
          <div className="task-card">
            <strong>{statusLabel(latestTask.status)}</strong>
            <p>{formatDate(latestTask.createdAt)}</p>
            <p>
              拉取 {latestTask.fetchedCount} / 写入 {latestTask.insertedCount}
            </p>
            {latestTask.errorMessage ? <p className="error-text">{latestTask.errorMessage}</p> : null}
          </div>
        ) : (
          <p className="muted">尚无同步任务。</p>
        )}
      </section>

      <section className="panel full-span">
        <div className="panel-header">
          <h3>运行时信息</h3>
          <span className="caption">本地环境上下文</span>
        </div>
        <div className="mini-stats">
          <article>
            <span>数据目录</span>
            <strong title={runtimeInfo.runtimeDir || "等待中"}>{runtimeInfo.runtimeDir || "等待中"}</strong>
          </article>
          <article>
            <span>服务地址</span>
            <strong>{runtimeInfo.serviceUrl || "等待中"}</strong>
          </article>
          <article>
            <span>打包模式</span>
            <strong>{runtimeInfo.isPackaged ? "是" : "否"}</strong>
          </article>
        </div>
      </section>
    </div>
  );
}
