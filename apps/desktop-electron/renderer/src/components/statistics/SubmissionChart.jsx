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

// ─── Submission Trend Line Chart (SVG with Tooltip) ─────────

export const SubmissionChart = memo(function SubmissionChart({ data }) {
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, week: "", count: 0 });

  // Memoize chart calculations
  const chartConfig = useMemo(() => {
    if (!data || data.length === 0) return null;

    const W = 600;
    const H = 220;
    const padL = 50;
    const padR = 20;
    const padT = 20;
    const padB = 50;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;

    const counts = data.map((d) => d.count);
    const maxCount = Math.max(...counts, 1);
    const n = data.length;

    const xOf = (i) => padL + (i / Math.max(n - 1, 1)) * chartW;
    const yOf = (v) => padT + chartH - (v / maxCount) * chartH;

    // Generate gradient area path
    const areaPoints = data
      .map((d, i) => `${i === 0 ? "M" : "L"} ${xOf(i)},${yOf(d.count)}`)
      .join(" ");
    const areaPath = areaPoints + ` L ${xOf(n - 1)},${padT + chartH} L ${padL},${padT + chartH} Z`;

    // Generate line path
    const linePath = data
      .map((d, i) => `${i === 0 ? "M" : "L"} ${xOf(i)},${yOf(d.count)}`)
      .join(" ");

    // Y-axis ticks
    const yTicks = [0, Math.round(maxCount / 2), maxCount];

    return { W, H, padL, padR, padT, padB, chartW, chartH, maxCount, n, xOf, yOf, areaPath, linePath, yTicks };
  }, [data]);

  const handlePointHover = useCallback((i) => {
    const d = data[i];
    setTooltip({
      visible: true,
      x: chartConfig.xOf(i),
      y: chartConfig.yOf(d.count) - 10,
      week: d.week,
      count: d.count,
    });
  }, [data, chartConfig]);

  const handlePointLeave = useCallback(() => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  }, []);

  if (!chartConfig) {
    return <p className="muted-text">暂无提交数据</p>;
  }

  const { W, H, padL, padR, padT, padB, maxCount, n, xOf, yOf, areaPath, linePath, yTicks } = chartConfig;

  // Week label helper
  const weekLabel = useCallback((weekStr) => weekStr?.split("-")[1] ?? weekStr, []);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg submission-chart" data-testid="submission-chart" aria-label="提交趋势折线图">
      <defs>
        <linearGradient id="submissionGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Y-axis grid lines and labels */}
      {yTicks.map((v) => {
        const y = yOf(v);
        return (
          <g key={v}>
            <line
              x1={padL}
              y1={y}
              x2={W - padR}
              y2={y}
              stroke="var(--line)"
              strokeWidth="1"
              strokeDasharray="4,4"
            />
            <text x={padL - 8} y={y + 4} textAnchor="end" fontSize="11" fill="var(--muted)">
              {v}
            </text>
          </g>
        );
      })}

      {/* Area fill */}
      <path d={areaPath} fill="url(#submissionGradient)" />

      {/* Line */}
      <path
        d={linePath}
        fill="none"
        stroke="#6366f1"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Data points with hover */}
      {data.map((d, i) => (
        <g key={i}>
          <circle
            cx={xOf(i)}
            cy={yOf(d.count)}
            r="5"
            fill="#6366f1"
            stroke="var(--panel-strong)"
            strokeWidth="2"
            className="chart-data-point"
            onMouseEnter={() => handlePointHover(i)}
            onMouseLeave={handlePointLeave}
          />
          <circle
            cx={xOf(i)}
            cy={yOf(d.count)}
            r="12"
            fill="transparent"
            className="chart-hit-area"
            onMouseEnter={() => handlePointHover(i)}
            onMouseLeave={handlePointLeave}
          />
        </g>
      ))}

      {/* Tooltip */}
      <ChartTooltip x={tooltip.x} y={tooltip.y} visible={tooltip.visible}>
        <div className="tooltip-inner">
          <div className="tooltip-label">{weekLabel(tooltip.week)}</div>
          <div className="tooltip-value">{tooltip.count} 次提交</div>
        </div>
      </ChartTooltip>

      {/* X-axis labels */}
      {data.map((d, i) => {
        if (n > 8 && i % 2 !== 0) return null;
        return (
          <text
            key={i}
            x={xOf(i)}
            y={H - 12}
            textAnchor="middle"
            fontSize="10"
            fill="var(--muted)"
          >
            {weekLabel(d.week)}
          </text>
        );
      })}
    </svg>
  );
});