import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { StatCard } from "../components/statistics/StatCard.jsx";
import { SubmissionChart } from "../components/statistics/SubmissionChart.jsx";
import { TagAccuracyChart } from "../components/statistics/TagAccuracyChart.jsx";
import { ReviewHeatmap } from "../components/statistics/ReviewHeatmap.jsx";
import "../styles/ui-statistics.css";

function SubmissionIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function AccuracyIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function ReviewIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <path d="M8 14h.01" />
      <path d="M12 14h.01" />
      <path d="M16 14h.01" />
      <path d="M8 18h.01" />
      <path d="M12 18h.01" />
      <path d="M16 18h.01" />
    </svg>
  );
}

function StreakIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

function formatDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function calculateStreak(dailyData) {
  if (!dailyData || dailyData.length === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const reviewDates = new Set(dailyData.map((d) => d.date));
  let streak = 0;
  let checkDate = new Date(today);

  if (!reviewDates.has(formatDateStr(today))) {
    checkDate.setDate(checkDate.getDate() - 1);
  }

  while (reviewDates.has(formatDateStr(checkDate))) {
    streak += 1;
    checkDate.setDate(checkDate.getDate() - 1);
  }

  return streak;
}

function calculateStats(submissionStats, reviewStats, reviewSummary) {
  const totalSubmissions = (submissionStats?.weekly ?? []).reduce((sum, w) => sum + (w.count || w.total || 0), 0);
  const acCount = (submissionStats?.weekly ?? []).reduce((sum, w) => sum + (w.acCount || 0), 0);
  const acRate = totalSubmissions > 0 ? Math.round((100 * acCount) / totalSubmissions) : 0;
  const totalReviews = reviewSummary?.total ?? 0;
  const completedReviews = reviewSummary?.completed ?? 0;
  const reviewRate = totalReviews > 0 ? Math.round((100 * completedReviews) / totalReviews) : 0;
  const streak = calculateStreak(reviewStats?.daily ?? []);

  return { totalSubmissions, acCount, acRate, reviewRate, streak };
}

function normalizeWeeklyData(submissionStats) {
  return (submissionStats?.weekly ?? []).map((w, index) => ({
    label: w.label || w.week || `W${index + 1}`,
    count: w.total || w.count || 0,
    acCount: w.acCount || 0,
  }));
}

function normalizeTagData(reviewStats) {
  return (reviewStats?.tagAccuracy ?? []).map((t) => ({
    tag: t.tag,
    total: t.attempts || t.total || 0,
    correct: t.acCount || t.correct || 0,
  }));
}

export function StatisticsPage() {
  const [submissionStats, setSubmissionStats] = useState(null);
  const [reviewStats, setReviewStats] = useState(null);
  const [reviewSummary, setReviewSummary] = useState(null);
  const [period, setPeriod] = useState("week");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      api.getSubmissionStats(),
      api.getReviewStats(),
      api.getReviewSummary(),
    ])
      .then(([sub, rev, summary]) => {
        if (cancelled) return;
        setSubmissionStats(sub);
        setReviewStats(rev);
        setReviewSummary(summary);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message ?? "加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(
    () => calculateStats(submissionStats, reviewStats, reviewSummary),
    [submissionStats, reviewStats, reviewSummary],
  );
  const weeklyData = useMemo(() => normalizeWeeklyData(submissionStats), [submissionStats]);
  const tagData = useMemo(() => normalizeTagData(reviewStats), [reviewStats]);
  const trendSubtitle = period === "month" ? "按月视图（沿用当前统计接口）" : "按周视图";

  if (loading) {
    return (
      <div className="page-content statistics-page stats-page">
        <div className="stats-summary-grid stats-grid4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="stat-card stat-card--skeleton">
              <div className="skeleton-line" style={{ width: "40%", height: 18, marginBottom: 12 }} />
              <div className="skeleton-line" style={{ width: "58%", height: 36, marginBottom: 10 }} />
              <div className="skeleton-line" style={{ width: "32%", height: 14 }} />
            </div>
          ))}
        </div>
        <div className="stats-grid2">
          {[1, 2].map((i) => (
            <section key={i} className="panel chart-wrap stats-panel">
              <div className="skeleton-line" style={{ width: "40%", height: 16, marginBottom: 16 }} />
              <div className="skeleton-line" style={{ width: "100%", height: 140 }} />
            </section>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-content statistics-page stats-page">
        <p className="error-text">{error}</p>
      </div>
    );
  }

  return (
    <div className="page-content statistics-page stats-page">
      <div className="stats-summary-grid stats-grid4">
        <StatCard title="总提交数" value={stats.totalSubmissions} subtitle="近 12 周累计" icon={<SubmissionIcon />} />
        <StatCard
          title="AC 率"
          value={`${stats.acRate}%`}
          subtitle={`${stats.acCount}/${stats.totalSubmissions} 次通过`}
          icon={<AccuracyIcon />}
          trend={stats.acRate >= 50 ? "良好" : "待提升"}
          trendUp={stats.acRate >= 50}
        />
        <StatCard
          title="复习完成率"
          value={`${stats.reviewRate}%`}
          subtitle={`${reviewSummary?.completed ?? 0}/${reviewSummary?.total ?? 0} 题`}
          icon={<ReviewIcon />}
        />
        <StatCard
          title="连续复习"
          value={`${stats.streak} 天`}
          subtitle={stats.streak > 0 ? "保持节奏" : "今日可开始"}
          icon={<StreakIcon />}
          trend={stats.streak >= 7 ? "优秀" : null}
          trendUp={stats.streak >= 7}
        />
      </div>

      <div className="switch-row stats-switch-row" role="tablist" aria-label="统计周期">
        {[
          ["week", "本周"],
          ["month", "本月"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`switch-btn ${period === value ? "active" : ""}`}
            onClick={() => setPeriod(value)}
            role="tab"
            aria-selected={period === value}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="stats-grid2 stats-trend-grid">
        <section className="panel chart-wrap stats-panel chart-panel">
          <div className="stats-panel-head">
            <h3>总提交趋势</h3>
            <span>{trendSubtitle}</span>
          </div>
          <SubmissionChart data={weeklyData} valueKey="count" variant="total" emptyText="暂无提交数据" />
        </section>
        <section className="panel chart-wrap stats-panel chart-panel">
          <div className="stats-panel-head">
            <h3>AC 趋势</h3>
            <span>{trendSubtitle}</span>
          </div>
          <SubmissionChart data={weeklyData} valueKey="acCount" variant="ac" emptyText="暂无 AC 数据" />
        </section>
      </div>

      <div className="stats-grid2">
        <section className="panel chart-wrap stats-panel">
          <div className="stats-panel-head">
            <h3>标签正确率</h3>
            <span>按标签聚合</span>
          </div>
          <TagAccuracyChart data={tagData} />
        </section>
        <section className="panel chart-wrap stats-panel">
          <div className="stats-panel-head">
            <h3>复习热力图</h3>
            <span>近 91 天</span>
          </div>
          <ReviewHeatmap data={reviewStats?.daily ?? []} />
        </section>
      </div>
    </div>
  );
}
