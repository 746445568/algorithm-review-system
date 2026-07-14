import { useMemo, useState } from "react";
import { useTranslation } from 'react-i18next';
import useSWR from "swr";
import { api } from "../../lib/api.js";
import { useNavigation } from "../../lib/NavigationContext.jsx";
import { useDashboardData } from "../../hooks/useDashboardData.js";
import { HeroSection } from "./HeroSection.jsx";
import { GoalProgress } from "./GoalProgress.jsx";
import { LearningRecommendationCard } from "./LearningRecommendationCard.jsx";
import { SubmissionChart } from "../statistics/SubmissionChart.jsx";
import { ReviewCalendar } from "../ReviewCalendar.jsx";
import "../../styles/ui-dashboard-review.css";
import "../../styles/review-calendar.css";

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

function problemPlatformLabel(platform, fallback) {
  return platformShortLabel(platform) || fallback;
}

function formatContestTime(isoStr) {
  if (!isoStr) return "";
  const utcMs = new Date(isoStr).getTime();
  const d = new Date(utcMs + 8 * 60 * 60 * 1000);
  const M = d.getUTCMonth() + 1;
  const D = d.getUTCDate();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${M}/${D} ${hh}:${mm}`;
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
  const { t } = useTranslation();
  const [showAllDue, setShowAllDue] = useState(false);

  const { data, isLoading } = useDashboardData(serviceStatus);
  const dashboardData = data ?? DEFAULT_DASHBOARD_DATA;

  const {
    data: contestsRaw,
    error: contestsError,
    mutate: retryContests,
    isValidating: validatingContests,
  } = useSWR(
    serviceStatus?.state === "healthy" ? "dashboard-upcoming-contests" : null,
    () => api.getContests({ status: "UPCOMING" }),
    { refreshInterval: 60000, keepPreviousData: true }
  );

  const {
    data: submissionStatsRaw,
    error: submissionStatsError,
    mutate: retrySubmissionStats,
    isValidating: validatingSubmissionStats,
  } = useSWR(
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

      <LearningRecommendationCard serviceStatus={serviceStatus} navigateTo={navigateTo} />

      <ReviewCalendar />

      <section className="panel">
        <div className="dash-panel-head">
          <div>
            <div className="dash-panel-title">{t('dashboard.dueToday')}</div>
            <div className="dash-panel-sub">
              {hasMoreDue && !showAllDue
                ? t('dashboard.showingCount', { shown: visibleDueItems.length, total: recentUnsolved.length })
                : t('dashboard.problemCount', { count: recentUnsolved.length })}
            </div>
          </div>
          {hasMoreDue ? (
            <button
              type="button"
              className="dash-btn-ghost dash-btn-compact"
              onClick={() => setShowAllDue((current) => !current)}
            >
              {showAllDue ? t('dashboard.collapse') : t('dashboard.expandAll')}
            </button>
          ) : null}
        </div>
        {recentUnsolved.length === 0 ? (
          <p className="dash-muted">
            {isLoading ? t('common.loading') : t('dashboard.noDueToday')}
          </p>
        ) : (
          <div className="dash-due-list">
            {visibleDueItems.map((p, index) => (
              <div key={p.problemId ?? p.id ?? p.externalId ?? index} className="dash-due-row">
                <span className={`dash-chip ${platformChipClass(p.platform)}`}>
                  {problemPlatformLabel(p.platform, t('common.problem'))}
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
                <span className="dash-chip chip-red">{t('dashboard.due')}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="dash-grid2">
        <GoalProgress goals={dashboardData.goals} accounts={dashboardData.accounts} />

        <section className="panel">
          <div className="dash-panel-head">
            <div className="dash-panel-title">{t('dashboard.upcomingContests')}</div>
            <button
              type="button"
              className="dash-btn-ghost"
              onClick={() => navigateTo("contests")}
            >
              {t('review.filter.all')}
            </button>
          </div>
          {contestsError ? (
            <div className="dash-empty-action">
              <p className="dash-muted dash-error-text">{contestsError.message ?? t('errors.loadFailed')}</p>
              <button
                type="button"
                className="dash-btn-ghost dash-btn-compact"
                onClick={() => void retryContests()}
                disabled={validatingContests}
              >
                {validatingContests ? t('common.loading') : t('actions.retry')}
              </button>
            </div>
          ) : upcomingContests.length === 0 ? (
            <p className="dash-muted">{t('dashboard.noUpcomingContests')}</p>
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
            <div className="dash-panel-title">{t('dashboard.recentSubmissions')}</div>
            <div className="dash-panel-sub">{t('dashboard.last8Weeks')}</div>
          </div>
          {submissionStatsError ? (
            <div className="dash-empty-action">
              <p className="dash-muted dash-error-text">{submissionStatsError.message ?? t('errors.loadFailed')}</p>
              <button
                type="button"
                className="dash-btn-ghost dash-btn-compact"
                onClick={() => void retrySubmissionStats()}
                disabled={validatingSubmissionStats}
              >
                {validatingSubmissionStats ? t('common.loading') : t('actions.retry')}
              </button>
            </div>
          ) : (
            <div className="dash-charts-row">
              <div>
                <div className="dash-chart-head">{t('dashboard.totalSubmissions')}</div>
                <SubmissionChart data={weeklyData} valueKey="count" variant="total" emptyText={t('dashboard.noSubmissionData')} />
              </div>
              <div>
                <div className="dash-chart-head">AC</div>
                <SubmissionChart data={weeklyData} valueKey="acCount" variant="ac" emptyText={t('dashboard.noAcData')} />
              </div>
            </div>
          )}
        </section>
    </div>
  );
}
