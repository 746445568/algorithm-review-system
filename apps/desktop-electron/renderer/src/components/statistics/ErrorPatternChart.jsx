import { memo, useMemo } from "react";

const VERDICT_LABELS = {
  AC: "Accepted",
  WA: "Wrong Answer",
  TLE: "Time Limit",
  MLE: "Memory Limit",
  RE: "Runtime Error",
  CE: "Compile Error",
  OLE: "Output Limit",
  IE: "Internal Error",
  UNKNOWN: "Unknown",
};

const VERDICT_COLORS = {
  AC: "var(--good, #22c55e)",
  WA: "var(--warn, #f59e0b)",
  TLE: "var(--accent, #3b82f6)",
  MLE: "#8b5cf6",
  RE: "#ef4444",
  CE: "#64748b",
  OLE: "#f97316",
  IE: "#6b7280",
  UNKNOWN: "#94a3b8",
};

export const ErrorPatternChart = memo(function ErrorPatternChart({ data }) {
  const rows = useMemo(() => {
    const items = (data ?? []).filter((d) => d.verdict !== "AC");
    if (items.length === 0) return [];

    const total = items.reduce((sum, d) => sum + (d.count || 0), 0);
    return items
      .map((item) => ({
        ...item,
        label: VERDICT_LABELS[item.verdict] || item.verdict,
        color: VERDICT_COLORS[item.verdict] || VERDICT_COLORS.UNKNOWN,
        rate: total > 0 ? Math.round((100 * (item.count || 0)) / total) : 0,
      }))
      .sort((a, b) => (b.count || 0) - (a.count || 0));
  }, [data]);

  if (rows.length === 0) {
    return <p className="muted-text stats-empty">暂无错误数据</p>;
  }

  return (
    <div className="tag-rate-list" data-testid="error-pattern-chart" aria-label="错误类型分布">
      {rows.map((item) => (
        <div className="tag-rate-row" key={item.verdict}>
          <div className="tag-rate-head">
            <span>{item.label}</span>
            <span>
              {item.count} 次 · {item.rate}%
            </span>
          </div>
          <div className="rate-track" aria-label={`${item.label} ${item.rate}%`}>
            <div
              className="rate-fill"
              style={{ width: `${item.rate}%`, background: item.color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
});
