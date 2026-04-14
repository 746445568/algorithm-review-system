import { memo, useState, useMemo, useCallback } from "react";

// ─── Tooltip Component for Heatmap ──────────────────────────
const HeatmapTooltip = memo(function HeatmapTooltip({ x, y, children, visible }) {
  if (!visible) return null;
  return (
    <g className="chart-tooltip heatmap-tooltip" transform={`translate(${x}, ${y})`}>
      <foreignObject x="-60" y="-35" width="120" height="40" style={{ overflow: "visible" }}>
        <div className="tooltip-content tooltip-mini">
          {children}
        </div>
      </foreignObject>
    </g>
  );
});

// ─── Review Heatmap (SVG with Tooltip) ──────────────────────

export const ReviewHeatmap = memo(function ReviewHeatmap({ data }) {
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, date: "", count: 0 });

  // Memoize heatmap calculations
  const heatmapConfig = useMemo(() => {
    const countMap = new Map((data ?? []).map((d) => [d.date, d.count]));
    const maxCount = Math.max(...(data ?? []).map((d) => d.count), 1);

    // Build 91 days ending today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = [];
    for (let i = 90; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      days.push(d);
    }

    const COLS = 13;
    const ROWS = 7;
    const W = 720;
    const padL = 28;
    const padT = 20;
    const cellSize = Math.floor((W - padL) / COLS);
    const gutter = 3;
    const cell = cellSize - gutter;
    const H = padT + ROWS * (cell + gutter) + 16;

    const toDateStr = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    // Pad front so day[0] lands on its weekday column
    const firstDay = days[0];
    const weekdayOfFirst = firstDay.getDay();
    const paddedDays = Array(weekdayOfFirst).fill(null).concat(days);

    const totalCols = Math.ceil(paddedDays.length / 7);
    const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];

    return { countMap, maxCount, COLS, ROWS, W, padL, padT, cell, gutter, H, toDateStr, paddedDays, totalCols, weekdayLabels };
  }, [data]);

  const clamp = useCallback((v, lo, hi) => Math.max(lo, Math.min(hi, v)), []);

  const handleCellHover = useCallback((col, row, dateStr, count) => {
    const x = heatmapConfig.padL + col * (heatmapConfig.cell + heatmapConfig.gutter) + heatmapConfig.cell / 2;
    const y = heatmapConfig.padT + row * (heatmapConfig.cell + heatmapConfig.gutter) + heatmapConfig.cell / 2;
    setTooltip({ visible: true, x, y, date: dateStr, count });
  }, [heatmapConfig]);

  const handleCellLeave = useCallback(() => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  }, []);

  const { countMap, maxCount, W, padL, padT, cell, gutter, H, toDateStr, paddedDays, totalCols, weekdayLabels } = heatmapConfig;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg heatmap-svg" data-testid="heatmap" aria-label="复习热力图">
      {/* Weekday labels */}
      {weekdayLabels.map((label, i) => (
        <text
          key={i}
          x={padL - 4}
          y={padT + i * (cell + gutter) + cell / 2 + 4}
          textAnchor="end"
          fontSize="9"
          fill="var(--muted)"
        >
          {label}
        </text>
      ))}

      {/* Cells */}
      {paddedDays.map((d, idx) => {
        if (d === null) return null;
        const col = Math.floor(idx / 7);
        const row = idx % 7;
        const dateStr = toDateStr(d);
        const count = countMap.get(dateStr) ?? 0;
        const opacity = count === 0 ? 0.08 : 0.2 + 0.8 * clamp(count / maxCount, 0, 1);
        const x = padL + col * (cell + gutter);
        const y = padT + row * (cell + gutter);
        return (
          <rect
            key={dateStr}
            x={x}
            y={y}
            width={cell}
            height={cell}
            rx="2"
            fill="#6366f1"
            opacity={opacity}
            className="heatmap-cell"
            onMouseEnter={() => handleCellHover(col, row, dateStr, count)}
            onMouseLeave={handleCellLeave}
          />
        );
      })}

      {/* Tooltip */}
      <HeatmapTooltip x={tooltip.x} y={tooltip.y} visible={tooltip.visible}>
        <div className="tooltip-inner tooltip-inner-mini">
          <div className="tooltip-value">{tooltip.count} 次</div>
          <div className="tooltip-label tooltip-label-mini">{tooltip.date}</div>
        </div>
      </HeatmapTooltip>

      {/* Column labels */}
      {Array.from({ length: totalCols }, (_, col) => {
        const idx = col * 7;
        const d = paddedDays[idx];
        if (!d) return null;
        if (d.getDate() > 7 && col !== 0) return null;
        const label = `${d.getMonth() + 1}/${d.getDate()}`;
        return (
          <text
            key={col}
            x={padL + col * (cell + gutter) + cell / 2}
            y={padT - 5}
            textAnchor="middle"
            fontSize="9"
            fill="var(--muted)"
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
});