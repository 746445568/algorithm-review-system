import { memo, useMemo } from "react";

function formatDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const ReviewHeatmap = memo(function ReviewHeatmap({ data }) {
  const cells = useMemo(() => {
    const countMap = new Map((data ?? []).map((d) => [d.date, d.count || 0]));
    const maxCount = Math.max(...(data ?? []).map((d) => d.count || 0), 1);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return Array.from({ length: 91 }, (_, index) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (90 - index));
      const date = formatDateStr(d);
      const count = countMap.get(date) ?? 0;
      const level = count === 0 ? 0 : Math.max(1, Math.min(4, Math.ceil((count / maxCount) * 4)));

      return { date, count, level };
    });
  }, [data]);

  return (
    <div className="review-heatmap-wrap" data-testid="heatmap">
      <div className="heatmap" aria-label="复习热力图">
        {cells.map((cell) => (
          <div
            key={cell.date}
            className={`heat-cell ${cell.level > 0 ? `heat-${cell.level}` : ""}`}
            title={`${cell.date}: ${cell.count} 次`}
            aria-label={`${cell.date}: ${cell.count} 次`}
          />
        ))}
      </div>
      <div className="heat-labels" aria-hidden="true">
        <span>13 周前</span>
        <span>今天</span>
      </div>
    </div>
  );
});
