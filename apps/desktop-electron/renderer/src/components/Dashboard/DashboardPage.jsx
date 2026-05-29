import { useMemo, useState } from "react";
import useSWR from "swr";
import { api } from "../../lib/api.js";
import { useNavigation } from "../../lib/NavigationContext.jsx";
import { useDashboardData } from "../../hooks/useDashboardData.js";
import { HeroSection } from "./HeroSection.jsx";
import { GoalProgress } from "./GoalProgress.jsx";
import { SubmissionChart } from "../statistics/SubmissionChart.jsx";
import "../../styles/ui-dashboard-review.css";

const DUE_PREVIEW_LIMIT = 4;

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
  return "";
}

function problemPlatformLabel(platform) {
  return platformShortLabel(platform) || "题目";
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
  const [showAllDue, setShowAllDue] = useState(false);

  const { data, isLoading } = useDashboardData(serviceStatus);
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

  const weeklyData = useMemo(() => {
    const raw = submissionStatsRaw?.byWeek ?? [];
    return raw.slice(-8).map((w, i) => ({
      label: w.week ? `W${w.week.split("-W")[1] ?? i + 1}` : `W${i + 1}`,
      count: w.total ?? 0,
      acCount: w.acCount ?? 0,
    }));
  }, [submissionStatsRaw]);

  const recentUnsolved = dashboardData.reviewSummary?.recentUnsolved ?? [];
  const hasMoreDue = recentUnsolved.length > DUE_PREVIEW_LIMIT;
  const visibleDueItems = showAllDue
    ? recentUnsolved
    : recentUnsolved.slice(0, DUE_PREVIEW_LIMIT);

  return (
    <div className="dash-page">
      <HeroSection
        serviceStatus={serviceStatus}
        data={dashboardData}
        navigateTo={navigateTo}
        loading={isLoading}
      />

      <section className="panel">
        <div className="dash-panel-head">
          <div>
            <div className="dash-panel-title">今日到期</div>
            <div className="dash-panel-sub">
              {hasMoreDue && !showAllDue
                ? `显示 ${visibleDueItems.length} / ${recentUnsolved.length} 题`
                : `${recentUnsolved.length} 题`}
            </div>
          </div>
          {hasMoreDue ? (
            <button
              type="button"
              className="dash-btn-ghost dash-btn-compact"
              onClick={() => setShowAllDue((current) => !current)}
            >
              {showAllDue ? "收起" : "展开全部"}
            </button>
          ) : null}
        </div>
        {recentUnsolved.length === 0 ? (
          <p className="dash-muted">
            {isLoading ? "加载中..." : "今天没有到期的复盘题，保持节奏。"}
          </p>
        ) : (
          <div className="dash-due-list">
            {visibleDueItems.map((p) => (
              <div key={p.id} className="dash-due-row">
                <span className={`dash-chip ${platformChipClass(p.platform)}`}>
                  {problemPlatformLabel(p.platform)}
                </span>
                <span className="dash-due-title">{p.title}</span>
                {p.externalId ? (
                  <span className="dash-due-eid">{p.externalId}</span>
                ) : null}
                {p.lastVerdict || p.verdict ? (
                  <span className={`dash-chip ${verdictClass(p.lastVerdict ?? p.verdict)}`}>
                    {p.lastVerdict ?? p.verdict}
                  </span>
                ) : null}
                <span className="dash-chip chip-red">到期</span>
              </div>
            ))}
          </div>
        )}
      </section>

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
                {platformShortLabel(c.platform) ? (
                  <span className={`dash-chip ${platformChipClass(c.platform)}`}>
                    {platformShortLabel(c.platform)}
                  </span>
                ) : null}
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
    </div>
  );
}
