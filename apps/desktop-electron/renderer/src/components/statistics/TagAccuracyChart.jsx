import { memo, useMemo } from "react";

export const TagAccuracyChart = memo(function TagAccuracyChart({ data }) {
  const rows = useMemo(() => {
    return [...(data ?? [])]
      .sort((a, b) => {
        const ar = a.total > 0 ? a.correct / a.total : 0;
        const br = b.total > 0 ? b.correct / b.total : 0;
        return ar - br;
      })
      .map((item) => {
        const rate = item.total > 0 ? Math.round((100 * item.correct) / item.total) : 0;
        return { ...item, rate };
      });
  }, [data]);

  if (rows.length === 0) {
    return <p className="muted-text stats-empty">暂无标签数据</p>;
  }

  return (
    <div className="tag-rate-list" data-testid="tag-chart" aria-label="标签正确率">
      {rows.map((item) => (
        <div className="tag-rate-row" key={item.tag}>
          <div className="tag-rate-head">
            <span>{item.tag}</span>
            <span>
              {item.correct}/{item.total} · {item.rate}%
            </span>
          </div>
          <div className="rate-track" aria-label={`${item.tag} 正确率 ${item.rate}%`}>
            <div className="rate-fill" style={{ width: `${item.rate}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
});
