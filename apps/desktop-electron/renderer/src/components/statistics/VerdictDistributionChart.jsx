import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";

const VERDICT_LABELS = {
  AC: "AC",
  WA: "WA",
  TLE: "TLE",
  MLE: "MLE",
  RE: "RE",
  CE: "CE",
  OLE: "OLE",
  UNKNOWN: "UNKNOWN",
};

export const VerdictDistributionChart = memo(function VerdictDistributionChart({ data }) {
  const { t } = useTranslation();
  const rows = useMemo(() => {
    const items = Array.isArray(data) ? data : [];
    const total = items.reduce((sum, item) => sum + (Number(item.count) || 0), 0);
    return items.map((item) => {
      const count = Number(item.count) || 0;
      const verdict = String(item.verdict || "UNKNOWN");
      const percent = total > 0 ? Math.round((100 * count) / total) : 0;
      return {
        verdict,
        label: VERDICT_LABELS[verdict] || verdict,
        count,
        percent,
      };
    });
  }, [data]);

  if (rows.length === 0) {
    return <p className="muted-text stats-empty">{t("statistics.noVerdictData")}</p>;
  }

  return (
    <div className="verdict-list" data-testid="verdict-chart" aria-label={t("statistics.verdictDistribution")}>
      {rows.map((item) => (
        <div className="verdict-row" key={item.verdict}>
          <div className="verdict-head">
            <span className={`verdict-pill verdict-pill--${item.verdict.toLowerCase()}`}>{item.label}</span>
            <span>{t("statistics.verdictCount", { count: item.count, percent: item.percent })}</span>
          </div>
          <div className="rate-track" aria-label={t("statistics.verdictRate", { verdict: item.label, rate: item.percent })}>
            <div className="rate-fill verdict-fill" style={{ width: `${item.percent}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
});
