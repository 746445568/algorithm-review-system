import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { StatCard } from "../components/statistics/StatCard.jsx";
import { SubmissionChart } from "../components/statistics/SubmissionChart.jsx";
import { TagAccuracyChart } from "../components/statistics/TagAccuracyChart.jsx";
import { ReviewHeatmap } from "../components/statistics/ReviewHeatmap.jsx";

// ─── Icon Components ─────────────────────────────────────────
function SubmissionIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function ReviewIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

// ─── Helper Functions ───────────────────────────────────────

function calculateStreak(dailyData) {
  if (!dailyData || dailyData.length === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const reviewDates = new Set(dailyData.map(d => d.date));
  let streak = 0;
  let checkDate = new Date(today);

  // Check if today has a review, if not start from yesterday
  const todayStr = formatDateStr(today);
  if (!reviewDates.has(todayStr)) {
    checkDate.setDate(checkDate.getDate() - 1);
  }

  while (true) {
    const dateStr = formatDateStr(checkDate);
    if (reviewDates.has(dateStr)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

function formatDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function calculateStats(submissionStats, reviewStats, reviewSummary) {
  // Total submissions
  const totalSubmissions = (submissionStats?.weekly ?? []).reduce((sum, w) => sum + (w.count || 0), 0);

  // AC rate
  const acCount = (submissionStats?.weekly ?? []).reduce((sum, w) => sum + (w.acCount || 0), 0);
  const acRate = totalSubmissions > 0 ? Math.round(100 * acCount / totalSubmissions) : 0;

  // Review completion rate
  const totalReviews = reviewSummary?.total ?? 0;
  const completedReviews = reviewSummary?.completed ?? 0;
  const reviewRate = totalReviews > 0 ? Math.round(100 * completedReviews / totalReviews) : 0;

  // Streak
  const streak = calculateStreak(reviewStats?.daily ?? []);

  return { totalSubmissions, acRate, reviewRate, streak };
}

// ─── Page ───────────────────────────────────────────────────

export function StatisticsPage() {
  const [submissionStats, setSubmissionStats] = useState(null);
  const [reviewStats, setReviewStats] = useState(null);
  const [reviewSummary, setReviewSummary] = useState(null);
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

  if (loading) {
    return (
      <div className="page-content statistics-page">
        <div className="stats-summary-grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="stat-card stat-card--skeleton">
              <div className="skeleton-line" style={{ width: "40%", height: 24, marginBottom: 8 }} />
              <div className="skeleton-line" style={{ width: "60%", height: 32, marginBottom: 8 }} />
              <div className="skeleton-line" style={{ width: "30%", height: 14 }} />
            </div>
          ))}
        </div>
        {[1, 2, 3].map((i) => (
          <section key={i} className="panel chart-wrap">
            <div className="skeleton-line" style={{ width: "40%", height: 14, marginBottom: 12 }} />
            <div className="skeleton-chart">
              <div className="skeleton-line" style={{ width: "100%", height: 140 }} />
            </div>
          </section>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-content">
        <p className="error-text">{error}</p>
      </div>
    );
  }

  const stats = calculateStats(submissionStats, reviewStats, reviewSummary);

  // Transform weekly data for chart
  const weeklyData = (submissionStats?.weekly ?? []).map(w => ({
    week: w.week,
    count: w.total || w.count || 0,
    acCount: w.acCount || 0,
  }));

  // Transform tag accuracy data
  const tagData = (reviewStats?.tagAccuracy ?? []).map(t => ({
    tag: t.tag,
    total: t.attempts || t.total || 0,
    correct: t.acCount || t.correct || 0,
  }));

  return (
    <div className="page-content statistics-page">
      {/* Summary Cards */}
      <div className="stats-summary-grid">
        <StatCard
          title="总提交数"
          value={stats.totalSubmissions}
          subtitle="近12周累计"
          icon={<SubmissionIcon />}
        />
        <StatCard
          title="AC 率"
          value={`${stats.acRate}%`}
          subtitle="通过提交占比"
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
          subtitle={stats.streak > 0 ? "保持势头!" : "开始复习吧"}
          icon={<StreakIcon />}
          trend={stats.streak >= 7 ? "优秀" : null}
          trendUp={stats.streak >= 7}
        />
      </div>

      {/* Submission Trend Chart */}
      <section className="panel chart-wrap">
        <h3>提交趋势（近12周）</h3>
        <SubmissionChart data={weeklyData} />
      </section>

      {/* Bottom Charts Row */}
      <div className="charts-row">
        <section className="panel chart-wrap">
          <h3>标签正确率</h3>
          <TagAccuracyChart data={tagData} />
        </section>
        <section className="panel chart-wrap">
          <h3>复习热力图（近91天）</h3>
          <ReviewHeatmap data={reviewStats?.daily ?? []} />
        </section>
      </div>
    </div>
  );
}