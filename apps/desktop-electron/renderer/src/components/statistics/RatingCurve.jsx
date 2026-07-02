import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";

export function RatingCurve() {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    api.getAccounts()
      .then((data) => {
        setAccounts(data || []);
        if (data?.length) setSelectedId(data[0].id);
      })
      .catch(() => setAccounts([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    api.getRatingHistory(selectedId)
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [selectedId]);

  const handleRefresh = useCallback(() => {
    if (!selectedId || refreshing) return;
    setRefreshing(true);
    api.refreshRatingHistory(selectedId)
      .then(() => api.getRatingHistory(selectedId))
      .then(setHistory)
      .catch(() => {})
      .finally(() => setRefreshing(false));
  }, [selectedId, refreshing]);

  if (loading) return <div className="panel"><p>{t("loading", "加载中…")}</p></div>;
  if (!accounts.length) return <div className="panel"><p>{t("noAccount", "暂无平台账号")}</p></div>;

  const W = 500, H = 200, PL = 40, PB = 30;
  const ratings = history.map((e) => e.rating);
  const minR = ratings.length ? Math.min(...ratings) - 50 : 0;
  const maxR = ratings.length ? Math.max(...ratings) + 50 : 3000;
  const scaleX = (i) => PL + (i / Math.max(ratings.length - 1, 1)) * (W - PL - 10);
  const scaleY = (r) => H - PB - ((r - minR) / (maxR - minR || 1)) * (H - PB - 10);

  const pathD = ratings.map((r, i) => `${i === 0 ? "M" : "L"}${scaleX(i)},${scaleY(r)}`).join(" ");

  return (
    <div className="panel rating-curve-panel">
      <h3>{t("ratingCurve", "Rating 曲线")}</h3>
      <select value={selectedId || ""} onChange={(e) => setSelectedId(Number(e.target.value))} className="rating-account-select">
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>{a.platform} — {a.externalHandle}</option>
        ))}
      </select>
      {ratings.length >= 1 ? (
        <svg viewBox={`0 0 ${W} ${H}`} className="rating-curve-svg" role="img" aria-label={t("ratingCurve", "Rating 曲线")}>
          {[0.25, 0.5, 0.75].map((frac) => {
            const y = scaleY(minR + (maxR - minR) * frac);
            return <line key={frac} x1={PL} y1={y} x2={W - 10} y2={y} className="curve-grid" />;
          })}
          <path d={pathD} className="curve-line" />
          {ratings.map((r, i) => (
            <circle key={i} cx={scaleX(i)} cy={scaleY(r)} r={2.5} className="curve-dot" />
          ))}
        </svg>
      ) : (
        <p className="curve-empty">{t("clickRefresh", "点击刷新获取 Rating 历史")}</p>
      )}
      {selectedId && (
        <button onClick={handleRefresh} disabled={refreshing} className="curve-refresh-btn">
          {refreshing ? t("refreshing", "刷新中…") : t("refresh", "刷新")}
        </button>
      )}
    </div>
  );
}
