import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { api } from "../../lib/api.js";
import { useNavigation } from "../../lib/NavigationContext.jsx";
import { useDashboardData } from "../../hooks/useDashboardData.js";
import { HeroSection } from "./HeroSection.jsx";
import { GoalProgress } from "./GoalProgress.jsx";
import { AccountManager } from "./AccountManager.jsx";
import { SubmissionChart } from "../statistics/SubmissionChart.jsx";
import "../../styles/ui-dashboard-review.css";

const DEFAULT_DASHBOARD_DATA = {
  accounts: [],
  syncTasks: [],
  reviewSummary: {},
  goals: [],
};

function verdictClass(verdict) {
  const v = String(verdict ?? "").toUpperCase();
  if (v === "AC") return "chip-green";
  if (["WA", "RE", "MLE"].includes(v)) return "chip-red";
  return "chip-warn";
}

function platformChipClass(platform) {
  const v = String(platform ?? "").toUpperCase();
  if (v === "CODEFORCES") return "chip-cf";
  if (v === "ATCODER") return "chip-at";
  return "";
}

function platformShortLabel(platform) {
  const v = String(platform ?? "").toUpperCase();
  if (v === "CODEFORCES") return "CF";
  if (v === "ATCODER") return "AT";
  return platform ?? "?";
}

function formatContestTime(isoStr) {
  if (!isoStr) return "";
  const utcMs = new Date(isoStr).getTime();
  const d = new Date(utcMs + 8 * 60 * 60 * 1000);
  const M = d.getUTCMonth() + 1;
  const D = d.getUTCDate();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${M}/${D} ${hh}:${mm} 北京`;
}

function formatDuration(minutes) {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

export function DashboardPage({ serviceStatus }) {
  const { navigateTo } = useNavigation();
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ platform: "CODEFORCES", handle: "" });
  const [submitting, setSubmitting] = useState(false);
  const [refreshingIds, setRefreshingIds] = useState(new Set());

  const {
    data,
    error,
    isLoading,
    mutate: mutateDashboard,
  } = useDashboardData(serviceStatus);
  const dashboardData = data ?? DEFAULT_DASHBOARD_DATA;

  const { data: contestsRaw } = useSWR(
    serviceStatus?.state === "healthy" ? "dashboard-upcoming-contests" : null,
    () => api.getContests({ status: "UPCOMING" }),
    { refreshInterval: 60000, keepPreviousData: true }
  );

  const { data: submissionStatsRaw } = useSWR(
    serviceStatus?.state === "healthy" ? "dashboard-submission-stats" : null,
    () => api.getSubmissionStats(),
    { refreshInterval: 300000, keepPreviousData: true }
  );
  const upcomingContests = (
    Array.isArray(contestsRaw) ? contestsRaw : contestsRaw?.contests ?? []
  ).slice(0, 3);

  const latestTaskByAccount = useMemo(() => {
    const index = new Map();
    for (const task of dashboardData.syncTasks) {
      if (!index.has(task.platformAccountId)) {
        index.set(task.platformAccountId, task);
      }
    }
    return index;
  }, [dashboardData.syncTasks]);

  const weeklyData = useMemo(() => {
    const raw = submissionStatsRaw?.byWeek ?? [];
    return raw.slice(-8).map((w, i) => ({
      label: w.week ? `W${w.week.split("-W")[1] ?? i + 1}` : `W${i + 1}`,
      count: w.total ?? 0,
      acCount: w.acCount ?? 0,
    }));
  }, [submissionStatsRaw]);

  const refresh = useCallback(async () => {
    await mutateDashboard();
  }, [mutateDashboard]);

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
    setRefreshingIds((prev) => new Set(prev).add(account.id));
    try {
      await api.refreshRating(account.id);
      await mutateDashboard();
    } catch (e) {
      console.error("refreshRating failed:", e);
    } finally {
      setRefreshingIds((prev) => {
        const s = new Set(prev);
        s.delete(account.id);
        return s;
      });
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

  const recentUnsolved = dashboardData.reviewSummary?.recentUnsolved ?? [];
  const combinedError = error?.message ?? "";
  const serviceUnavailable = serviceStatus.state !== "healthy";

  return (
    <div className="dash-page">
      <HeroSection
        serviceStatus={serviceStatus}
        data={dashboardData}
        navigateTo={navigateTo}
        loading={isLoading}
      />

      {/* 今日到期 */}
      <section className="panel">
        <div className="dash-panel-head">
          <div className="dash-panel-title">今日到期</div>
          <div className="dash-panel-sub">{recentUnsolved.length} 题</div>
        </div>
        {recentUnsolved.length === 0 ? (
          <p className="dash-muted">
            {isLoading ? "加载中…" : "今天没有到期的复盘题，保持节奏！"}
          </p>
        ) : (
          <div className="dash-due-list">
            {recentUnsolved.map((p) => (
              <div key={p.id} className="dash-due-row">
                <span className={`dash-chip ${platformChipClass(p.platform)}`}>
                  {platformShortLabel(p.platform)}
                </span>
                <span className="dash-due-title">{p.title}</span>
                <span className="dash-due-eid">{p.externalId}</span>
                {p.lastVerdict || p.verdict ? (
                  <span className={`dash-chip ${verdictClass(p.lastVerdict ?? p.verdict)}`}>
                    {(p.lastVerdict ?? p.verdict)}
                  </span>
                ) : null}
                <span className="dash-chip chip-red">到期</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 评分目标 + 近期比赛 */}
      <div className="dash-grid2">
        <GoalProgress goals={dashboardData.goals} accounts={dashboardData.accounts} />

        <section className="panel">
          <div className="dash-panel-head">
            <div className="dash-panel-title">近期比赛</div>
            <button
              type="button"
              className="dash-btn-ghost"
              onClick={() => navigateTo("contests")}
            >
              全部
            </button>
          </div>
          {upcomingContests.length === 0 ? (
            <p className="dash-muted">暂无即将开始的比赛。</p>
          ) : (
            upcomingContests.map((c) => (
              <div key={c.id} className="dash-contest-card">
                <span className={`dash-chip ${platformChipClass(c.platform)}`}>
                  {platformShortLabel(c.platform)}
                </span>
                <div className="dash-contest-main">
                  <div className="dash-contest-name">{c.name}</div>
                  <div className="dash-contest-meta">
                    {formatContestTime(c.startTime)}
                    {c.durationMinutes ? ` · ${formatDuration(c.durationMinutes)}` : ""}
                  </div>
                </div>
              </div>
            ))
          )}
        </section>
      </div>

      {/* 近期提交 */}
      <section className="panel">
        <div className="dash-panel-head">
          <div className="dash-panel-title">近期提交</div>
          <div className="dash-panel-sub">近 8 周</div>
        </div>
        <div className="dash-charts-row">
          <div>
            <div className="dash-chart-head">总提交</div>
            <SubmissionChart data={weeklyData} valueKey="count" variant="total" emptyText="暂无提交数据" />
          </div>
          <div>
            <div className="dash-chart-head">AC</div>
            <SubmissionChart data={weeklyData} valueKey="acCount" variant="ac" emptyText="暂无 AC 数据" />
          </div>
        </div>
      </section>

      {/* 已绑定账号（账号管理保留在底部）*/}
      <AccountManager
        serviceUnavailable={serviceUnavailable}
        loading={isLoading}
        error={combinedError}
        notice={notice}
        form={form}
        submitting={submitting}
        setForm={setForm}
        handleSubmit={handleSubmit}
        accounts={dashboardData.accounts}
        latestTaskByAccount={latestTaskByAccount}
        refreshingIds={refreshingIds}
        handleRefreshRating={handleRefreshRating}
        triggerSync={triggerSync}
        deleteAccount={deleteAccount}
        refresh={refresh}
      />
    </div>
  );
}
