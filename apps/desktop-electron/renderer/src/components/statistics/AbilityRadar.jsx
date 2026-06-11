import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";

export function AbilityRadar() {
  const { t } = useTranslation();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getRadarData()
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="panel"><p>{t("loading", "加载中…")}</p></div>;
  if (!data.length) return <div className="panel"><p>{t("noKnowledgeData", "暂无知识点数据")}</p></div>;

  const N = data.length;
  const angleStep = (2 * Math.PI) / N;
  const R = 120;
  const cx = 150;
  const cy = 150;

  const clampMastery = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
  };

  const computeAngle = (i) => angleStep * i - Math.PI / 2;

  const points = data.map((d, i) => {
    const angle = computeAngle(i);
    const r = R * clampMastery(d.mastery);
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), ...d, angle };
  });

  const axisLines = data.map((_, i) => {
    const angle = computeAngle(i);
    return { x2: cx + R * Math.cos(angle), y2: cy + R * Math.sin(angle) };
  });

  const gridLevels = [0.25, 0.5, 0.75, 1.0];
  const gridRings = gridLevels.map((level) =>
    data.map((_, i) => {
      const angle = computeAngle(i);
      const r = R * level;
      return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
    })
  );

  return (
    <div className="radar-panel">
      <h3>{t("abilityRadar", "能力雷达")}</h3>
      <svg viewBox="0 0 300 300" className="radar-svg" role="img" aria-label={t("abilityRadar", "能力雷达图")}>
        {gridRings.map((ring, li) => (
          <polygon
            key={li}
            points={ring.map((p) => `${p.x},${p.y}`).join(" ")}
            className="radar-grid-ring"
          />
        ))}
        {axisLines.map((a, i) => (
          <line key={i} x1={cx} y1={cy} x2={a.x2} y2={a.y2} className="radar-axis" />
        ))}
        <polygon
          points={points.map((p) => `${p.x},${p.y}`).join(" ")}
          className="radar-area"
        />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={3} className="radar-dot" />
            <text
              x={cx + (R + 16) * Math.cos(p.angle)}
              y={cy + (R + 16) * Math.sin(p.angle)}
              className="radar-label"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {p.name}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
