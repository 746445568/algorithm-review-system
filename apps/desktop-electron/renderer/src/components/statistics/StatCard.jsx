import { memo } from "react";

export const StatCard = memo(function StatCard({ title, value, subtitle, icon, trend, trendUp }) {
  return (
    <div className="stat-card" data-testid="stat-card">
      <div className="stat-card-header">
        <div className="stat-card-icon" aria-hidden="true">{icon}</div>
        {trend && (
          <span className={`stat-trend ${trendUp ? "trend-up" : "trend-down"}`}>
            {trendUp ? "↑" : "↓"} {trend}
          </span>
        )}
      </div>
      <div className="stat-card-body">
        <div className="stat-card-title">{title}</div>
        <div className="stat-card-value" data-testid="stat-value">{value}</div>
        {subtitle && <div className="stat-card-subtitle">{subtitle}</div>}
      </div>
    </div>
  );
});
