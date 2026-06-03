import { memo, useMemo } from "react";
import { useTranslation } from 'react-i18next';

function formatLabel(label) {
  if (!label) return "";
  const text = String(label);
  if (text.includes("-W")) return text.split("-W").at(-1);
  if (text.includes("-")) return text.split("-").slice(-2).join("/");
  return text;
}

export const SubmissionChart = memo(function SubmissionChart({
  data,
  valueKey = "count",
  variant = "total",
  emptyText,
}) {
  const { t } = useTranslation();
  const chartData = useMemo(() => {
    const rows = data ?? [];
    const max = Math.max(...rows.map((d) => Number(d[valueKey] || 0)), 1);

    return rows.map((d, index) => {
      const value = Number(d[valueKey] || 0);
      const height = value > 0 ? Math.max(6, Math.round((value / max) * 100)) : 0;

      return {
        id: `${d.label ?? index}-${valueKey}`,
        label: formatLabel(d.label),
        value,
        height,
      };
    });
  }, [data, valueKey]);

  if (chartData.length === 0) {
    return <p className="muted-text stats-empty">{emptyText || t('common.noData')}</p>;
  }

  return (
    <div
      className="submission-bar-chart"
      style={{ "--bar-count": chartData.length }}
      data-testid="submission-chart"
      aria-label={t('statistics.submissionTrendChart')}
    >
      <div className="fixed-bar-chart">
        {chartData.map((item) => (
          <div className="bar-cell" key={item.id}>
            <div className="bar-tooltip">{t('statistics.timesCount', { count: item.value })}</div>
            <div
              className={`bar-rect ${variant === "ac" ? "ac" : "total"}`}
              style={{ height: `${item.height}%` }}
              aria-label={t('statistics.barLabel', { label: item.label, count: item.value })}
            />
          </div>
        ))}
      </div>
      <div className="chart-labels">
        {chartData.map((item) => (
          <span key={`${item.id}-label`}>{item.label}</span>
        ))}
      </div>
    </div>
  );
});
