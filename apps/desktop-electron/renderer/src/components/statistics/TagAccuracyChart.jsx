import { memo, useState, useMemo, useCallback } from "react";

// ─── Tooltip Component ──────────────────────────────────────
const ChartTooltip = memo(function ChartTooltip({ x, y, children, visible }) {
  if (!visible) return null;
  return (
    <g className="chart-tooltip" transform={`translate(${x}, ${y})`}>
      <foreignObject x="-80" y="-45" width="160" height="50" style={{ overflow: "visible" }}>
        <div className="tooltip-content">
          {children}
        </div>
      </foreignObject>
    </g>
  );
});

// ─── Tag Accuracy Bar Chart (SVG with Tooltip) ──────────────

export const TagAccuracyChart = memo(function TagAccuracyChart({ data }) {
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, tag: "", total: 0, correct: 0 });

  // Memoize sorted data and chart config
  const chartConfig = useMemo(() => {
    if (!data || data.length === 0) return null;

    // Sort ascending by accuracy
    const sorted = [...data].sort((a, b) => {
      const ra = a.total > 0 ? a.correct / a.total : 0;
      const rb = b.total > 0 ? b.correct / b.total : 0;
      return ra - rb;
    });

    const W = 640;
    const H = 280;
    const padL = 36;
    const padR = 16;
    const padT = 20;
    const padB = 60;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;
    const n = sorted.length;
    const barW = Math.max(Math.min(Math.floor(chartW / n) - 6, 36), 12);

    const xCenter = (i) => padL + (i + 0.5) * (chartW / n);
    const accuracy = (d) => (d.total > 0 ? d.correct / d.total : 0);

    return { W, H, padL, padR, padT, padB, chartW, chartH, n, barW, sorted, xCenter, accuracy };
  }, [data]);

  const handleBarHover = useCallback((i, d) => {
    if (!chartConfig) return;
    const acc = chartConfig.accuracy(d);
    const barH = acc * chartConfig.chartH;
    setTooltip({
      visible: true,
      x: chartConfig.xCenter(i),
      y: chartConfig.padT + chartConfig.chartH - barH - 5,
      tag: d.tag,
      total: d.total,
      correct: d.correct,
    });
  }, [chartConfig]);

  const handleBarLeave = useCallback(() => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  }, []);

  if (!chartConfig) {
    return <p className="muted-text">暂无标签数据</p>;
  }

  const { W, H, padL, padR, padT, padB, chartH, n, barW, sorted, xCenter, accuracy } = chartConfig;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg tag-chart" data-testid="tag-chart" aria-label="标签正确率柱状图">
      {/* Horizontal grid at 0%, 50%, 100% */}
      {[0, 0.5, 1].map((frac) => {
        const y = padT + chartH - frac * chartH;
        return (
          <g key={frac}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="var(--line)" strokeWidth="1" strokeDasharray="4,4" />
            <text x={padL - 4} y={y + 4} textAnchor="end" fontSize="10" fill="var(--muted)">
              {Math.round(frac * 100)}%
            </text>
          </g>
        );
      })}

      {/* Bars */}
      {sorted.map((d, i) => {
        const acc = accuracy(d);
        const barH = acc * chartH;
        const x = xCenter(i) - barW / 2;
        const y = padT + chartH - barH;
        const color = acc >= 0.7 ? "#22c55e" : acc >= 0.4 ? "#f59e0b" : "#ef4444";
        return (
          <g key={d.tag}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={Math.max(barH, 2)}
              fill={color}
              rx="3"
              className="chart-bar"
              onMouseEnter={() => handleBarHover(i, d)}
              onMouseLeave={handleBarLeave}
            />
            {/* Rotated X-axis label */}
            <text
              x={xCenter(i)}
              y={padT + chartH + 12}
              textAnchor="end"
              fontSize="10"
              fill="var(--muted)"
              transform={`rotate(-45, ${xCenter(i)}, ${padT + chartH + 12})`}
            >
              {d.tag}
            </text>
          </g>
        );
      })}

      {/* Tooltip */}
      <ChartTooltip x={tooltip.x} y={tooltip.y} visible={tooltip.visible}>
        <div className="tooltip-inner">
          <div className="tooltip-label">{tooltip.tag}</div>
          <div className="tooltip-value">
            {tooltip.correct}/{tooltip.total} ({tooltip.total > 0 ? Math.round(100 * tooltip.correct / tooltip.total) : 0}%)
          </div>
        </div>
      </ChartTooltip>
    </svg>
  );
});