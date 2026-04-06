import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

// ─── helpers ───────────────────────────────────────────────────

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// Parse "2026-W01" → week label "W01"
function weekLabel(weekStr) {
  return weekStr?.split("-")[1] ?? weekStr;
}

// ─── Submission Trend Line Chart (SVG) ─────────────────────────

function SubmissionChart({ data }) {
  if (!data || data.length === 0) {
    return <p className="muted-text">暂无提交数据</p>;
  }

  const W = 600;
  const H = 180;
  const padL = 40;
  const padR = 16;
  const padT = 16;
  const padB = 40;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const counts = data.map((d) => d.count);
  const maxCount = Math.max(...counts, 1);
  const n = data.length;

  const xOf = (i) => padL + (i / Math.max(n - 1, 1)) * chartW;
  const yOf = (v) => padT + chartH - (v / maxCount) * chartH;

  const points = data.map((d, i) => `${xOf(i)},${yOf(d.count)}`).join(" ");

  // Y-axis ticks: 0, half, max
  const yTicks = [0, Math.round(maxCount / 2), maxCount];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" aria-label="提交趋势折线图">
      {/* Y-axis grid lines and labels */}
      {yTicks.map((v) => {
        const y = yOf(v);
        return (
          <g key={v}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="var(--line)" strokeWidth="1" />
            <text x={padL - 6} y={y + 4} textAnchor="end" fontSize="11" fill="var(--muted)">
              {v}
            </text>
          </g>
        );
      })}

      {/* Polyline */}
      <polyline
        points={points}
        fill="none"
        stroke="#6366f1"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Data points */}
      {data.map((d, i) => (
        <circle key={i} cx={xOf(i)} cy={yOf(d.count)} r="4" fill="#6366f1" />
      ))}

      {/* X-axis labels — show every other label to avoid crowding */}
      {data.map((d, i) => {
        if (n > 8 && i % 2 !== 0) return null;
        return (
          <text
            key={i}
            x={xOf(i)}
            y={H - 8}
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
}

// ─── Tag Accuracy Bar Chart (SVG) ──────────────────────────────

function TagAccuracyChart({ data }) {
  if (!data || data.length === 0) {
    return <p className="muted-text">暂无标签数据</p>;
  }

  // Sort ascending by accuracy
  const sorted = [...data].sort((a, b) => {
    const ra = a.total > 0 ? a.correct / a.total : 0;
    const rb = b.total > 0 ? b.correct / b.total : 0;
    return ra - rb;
  });

  const W = 700;
  const H = 240;
  const padL = 16;
  const padR = 16;
  const padT = 16;
  const padB = 72; // room for rotated labels
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const n = sorted.length;
  const barW = clamp(Math.floor(chartW / n) - 4, 8, 40);

  const xCenter = (i) => padL + (i + 0.5) * (chartW / n);
  const accuracy = (d) => (d.total > 0 ? d.correct / d.total : 0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" aria-label="标签正确率柱状图">
      {/* Horizontal grid at 0%, 50%, 100% */}
      {[0, 0.5, 1].map((frac) => {
        const y = padT + chartH - frac * chartH;
        return (
          <g key={frac}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="var(--line)" strokeWidth="1" />
            <text x={padL - 2} y={y + 4} textAnchor="end" fontSize="10" fill="var(--muted)">
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
            <rect x={x} y={y} width={barW} height={Math.max(barH, 1)} fill={color} rx="3" />
            {/* Rotated X-axis label */}
            <text
              x={xCenter(i)}
              y={padT + chartH + 8}
              textAnchor="end"
              fontSize="10"
              fill="var(--muted)"
              transform={`rotate(-45, ${xCenter(i)}, ${padT + chartH + 8})`}
            >
              {d.tag}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Review Heatmap (SVG) ──────────────────────────────────────

function ReviewHeatmap({ data }) {
  // data: [{date: "2026-04-01", count: 3}, ...]
  // Build a map for O(1) lookup
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

  // Grid: 13 cols × 7 rows (7 days/week)
  const COLS = 13;
  const ROWS = 7;
  const W = 780;
  const H = 120;
  const padL = 28; // room for weekday labels
  const padT = 20; // room for week labels
  const cellSize = Math.floor((W - padL) / COLS);
  const gutter = 3;
  const cell = cellSize - gutter;

  const toDateStr = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  // Pad front so day[0] lands on its weekday column
  const firstDay = days[0];
  const weekdayOfFirst = firstDay.getDay(); // 0=Sun
  const paddedDays = Array(weekdayOfFirst).fill(null).concat(days);

  const totalCols = Math.ceil(paddedDays.length / 7);
  const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg heatmap-svg" aria-label="复习热力图">
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
          >
            <title>{`${dateStr}: ${count} 次复习`}</title>
          </rect>
        );
      })}

      {/* Column (week) labels: show month/day for first cell of each month */}
      {Array.from({ length: totalCols }, (_, col) => {
        const idx = col * 7;
        const d = paddedDays[idx];
        if (!d) return null;
        if (d.getDate() > 7 && col !== 0) return null; // only show near start of month
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
}

// ─── Page ──────────────────────────────────────────────────────

export function StatisticsPage() {
  const [submissionStats, setSubmissionStats] = useState(null);
  const [reviewStats, setReviewStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([api.getSubmissionStats(), api.getReviewStats()])
      .then(([sub, rev]) => {
        if (cancelled) return;
        setSubmissionStats(sub);
        setReviewStats(rev);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message ?? "加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="page-content">
        <p className="muted-text">加载中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-content">
        <p className="error-text">{error}</p>
      </div>
    );
  }

  return (
    <div className="page-content statistics-page">
      <section className="panel chart-wrap">
        <h3>提交趋势（近12周）</h3>
        <SubmissionChart data={submissionStats?.weekly ?? []} />
      </section>

      <section className="panel chart-wrap">
        <h3>标签正确率</h3>
        <TagAccuracyChart data={reviewStats?.tagAccuracy ?? []} />
      </section>

      <section className="panel chart-wrap">
        <h3>复习热力图（近91天）</h3>
        <ReviewHeatmap data={reviewStats?.daily ?? []} />
      </section>
    </div>
  );
}
