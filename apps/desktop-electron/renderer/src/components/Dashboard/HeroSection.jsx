import { memo } from "react";

export const HeroSection = memo(function HeroSection({ data, navigateTo, loading }) {
  const dueCount = data.reviewSummary?.dueReviewCount ?? 0;
  const scheduledCount = data.reviewSummary?.scheduledReviewCount ?? 0;
  const totalSubmissions = data.reviewSummary?.totalSubmissions ?? 0;
  const totalToday = dueCount + scheduledCount;
  const progress = totalToday > 0 ? Math.min(100, Math.round((scheduledCount / totalToday) * 100)) : 0;

  return (
    <div className="dash-hero">
      <div className="dash-hero-content">
        <div className="dash-hero-label">今日任务</div>
        <div className="dash-hero-count">{loading ? "—" : dueCount}</div>
        <div className="dash-hero-sub">题目待复盘</div>
        <button
          type="button"
          className="dash-hero-cta"
          onClick={() => navigateTo("reviews")}
        >
          ▷ 开始今日复习
        </button>
        <div className="dash-hero-progress">
          <div className="dash-hero-progress-label">
            <span>今日复习进度</span>
            <span>{scheduledCount}/{totalToday} 题完成</span>
          </div>
          <div className="dash-hero-track">
            <div className="dash-hero-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="dash-hero-stats">
          <div>
            <div className="dash-hero-stat-val">{totalSubmissions}</div>
            <div className="dash-hero-stat-label">总提交数</div>
          </div>
          <div>
            <div className="dash-hero-stat-val">{data.accounts?.length ?? 0}</div>
            <div className="dash-hero-stat-label">已绑平台</div>
          </div>
          <div>
            <div className="dash-hero-stat-val">{data.goals?.length ?? 0}</div>
            <div className="dash-hero-stat-label">进行中目标</div>
          </div>
        </div>
      </div>
    </div>
  );
});
