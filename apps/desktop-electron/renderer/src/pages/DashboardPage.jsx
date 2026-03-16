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
          <span className="section-label">运行状态</span>
          <h3>
            {data.owner?.app?.name ?? "OJ 错题复盘"}{" "}
            {serviceStatus.state === "healthy" ? "已连接本地数据" : "正在启动"}
          </h3>
          <p>
            仪表盘已接入本地 Go 服务的真实数据，实时追踪同步活动和每道题的复习状态。
          </p>
        </div>
        <div className="hero-stats">
          <div>
            <span>服务状态</span>
            <strong>{statusLabel(serviceStatus.state)}</strong>
          </div>
          <div>
            <span>绑定账号</span>
            <strong>{data.accounts.length}</strong>
          </div>
          <div>
            <span>待复习</span>
            <strong>{data.reviewSummary?.dueReviewCount ?? 0}</strong>
          </div>
          <div>
            <span>已排期</span>
            <strong>{data.reviewSummary?.scheduledReviewCount ?? 0}</strong>
          </div>
        </div>
      </section>

      <section className="panel stats-strip">
        <article>
          <span>总提交数</span>
          <strong>{data.reviewSummary?.totalSubmissions ?? 0}</strong>
        </article>
        <article>
          <span>待复习</span>
          <strong>{reviewCounts.TODO ?? 0}</strong>
        </article>
        <article>
          <span>复习中</span>
          <strong>{reviewCounts.REVIEWING ?? 0}</strong>
        </article>
        <article>
          <span>已完成</span>
          <strong>{reviewCounts.DONE ?? 0}</strong>
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
          <p className="muted">
            等待本地服务 {runtimeInfo.serviceUrl || serviceStatus.url} 就绪。
          </p>
        ) : null}
        {loading ? <p className="muted">正在加载仪表盘数据...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
        <div className="stack-list">
          {data.accounts.length === 0 && !loading ? (
            <p className="muted">
              尚未绑定账号。前往左侧「账号管理」，填入 Codeforces 或 AtCoder 用户名即可开始同步。无需登录，无需 OAuth。
            </p>
          ) : data.accounts.length === 0 ? (
            <p className="muted">正在加载账号信息...</p>
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
                  <strong>{item.tag}</strong>
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
            {latestTask.errorMessage ? (
              <p className="error-text">{latestTask.errorMessage}</p>
            ) : null}
          </div>
        ) : (
          <p className="muted">
            尚无同步任务。绑定账号后将自动开始第一次同步。
          </p>
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
            <strong title={runtimeInfo.runtimeDir || "等待中"}>
              {runtimeInfo.runtimeDir || "等待中"}
            </strong>
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
