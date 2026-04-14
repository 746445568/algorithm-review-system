import { useCallback, useMemo, useState } from "react";
import { api } from "../../lib/api.js";
import { formatDate, statusLabel } from "../../lib/format.js";
import { useNavigation } from "../../lib/NavigationContext.jsx";
import { useDashboardData, useLatestAnalysis } from "../../hooks/useDashboardData.js";
import { HeroSection } from "./HeroSection.jsx";
import { GoalProgress } from "./GoalProgress.jsx";
import { CacheStatusStrip } from "./CacheStatusStrip.jsx";
import { AccountManager } from "./AccountManager.jsx";
import { ReviewPipeline } from "./ReviewPipeline.jsx";
import { WeakTagsList } from "./WeakTagsList.jsx";

export function DashboardPage({ serviceStatus, runtimeInfo, cacheStatus = {}, connectivity, syncQueue = [] }) {
  const { navigateTo } = useNavigation();
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ platform: "CODEFORCES", handle: "" });
  const [submitting, setSubmitting] = useState(false);
  const [refreshingIds, setRefreshingIds] = useState(new Set());

  // 使用 SWR 获取仪表盘数据
  const { data, isLoading } = useDashboardData(serviceStatus);

  // 使用 SWR 获取最新分析
  const { latestAnalysis } = useLatestAnalysis();

  const latestTaskByAccount = useMemo(() => {
    const index = new Map();
    for (const task of data?.syncTasks || []) {
      if (!index.has(task.platformAccountId)) {
        index.set(task.platformAccountId, task);
      }
    }
    return index;
  }, [data?.syncTasks]);

  // 刷新一轮数据（用于创建账号、删除账号等操作后）
  const refresh = useCallback(async () => {
    await mutateDashboard();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setNotice("");

    try {
      await api.createAccount(form.platform, form.handle.trim());
      setForm((current) => ({ ...current, handle: "" }));
      setNotice("账号已保存。");
      await refresh();
    } catch (nextError) {
      console.error("createAccount failed:", nextError);
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteAccount(account) {
    setNotice("");

    try {
      await api.deleteAccount(account.id);
      setNotice(`已删除 ${account.externalHandle}。`);
      await refresh();
    } catch (nextError) {
      console.error("deleteAccount failed:", nextError);
    }
  }

  const handleRefreshRating = useCallback(async (account) => {
    setRefreshingIds(prev => new Set(prev).add(account.id));
    try {
      await api.refreshRating(account.id);
      await mutateDashboard();
    } catch (e) {
      console.error("refreshRating failed:", e);
    } finally {
      setRefreshingIds(prev => { const s = new Set(prev); s.delete(account.id); return s; });
    }
  }, [mutateDashboard]);

  async function triggerSync(account) {
    setNotice("");

    try {
      await api.syncAccount(account.platform, account.id);
      setNotice(`已将 ${account.externalHandle} 加入同步队列。`);
      await refresh();
    } catch (nextError) {
      console.error("syncAccount failed:", nextError);
    }
  }

  const weakTags = data?.reviewSummary?.weakTags ?? [];
  const repeatedFailures = data?.reviewSummary?.repeatedFailures ?? [];
  const recentUnsolved = data?.reviewSummary?.recentUnsolved ?? [];
  const serviceUnavailable = serviceStatus.state !== "healthy";

  return (
    <div className="page-grid">
      <HeroSection
        serviceStatus={serviceStatus}
        connectivity={connectivity}
        data={data}
        latestAnalysis={latestAnalysis}
        navigateTo={navigateTo}
        loading={isLoading || analysisLoading}
      />

      {data.goals.length > 0 ? (
        <GoalProgress goals={data.goals} accounts={data.accounts} />
      ) : null}

      <CacheStatusStrip cacheStatus={cacheStatus} />

      <AccountManager
        serviceUnavailable={serviceUnavailable}
        loading={isLoading}
        error={combinedError}
        notice={notice}
        form={form}
        submitting={submitting}
        setForm={setForm}
        handleSubmit={handleSubmit}
        accounts={data?.accounts || []}
        latestTaskByAccount={latestTaskByAccount}
        refreshingIds={refreshingIds}
        handleRefreshRating={handleRefreshRating}
        triggerSync={triggerSync}
        deleteAccount={deleteAccount}
        refresh={refresh}
      />

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

      <ReviewPipeline reviewSummary={data.reviewSummary} />

      <WeakTagsList
        weakTags={weakTags}
        repeatedFailures={repeatedFailures}
        recentUnsolved={recentUnsolved}
      />

      <section className="panel">
        <div className="panel-header">
          <h3>最新任务</h3>
          <span className="caption">最近一次同步活动</span>
        </div>
        {data.syncTasks[0] ? (
          <div className="task-card">
            <strong>{statusLabel(data.syncTasks[0].status)}</strong>
            <p>{formatDate(data.syncTasks[0].createdAt)}</p>
            <p>
              拉取 {data.syncTasks[0].fetchedCount} / 写入 {data.syncTasks[0].insertedCount}
            </p>
            {data.syncTasks[0].errorMessage ? <p className="error-text">{data.syncTasks[0].errorMessage}</p> : null}
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
