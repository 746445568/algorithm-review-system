import { memo } from "react";

const PLATFORM_CONFIG = {
  CODEFORCES: { chip: "CF", cls: "chip-cf", color: "#818cf8" },
  ATCODER:    { chip: "AT", cls: "chip-at", color: "#FDBA74" },
};

export const GoalProgress = memo(function GoalProgress({ goals, accounts }) {
  if (goals.length === 0) {
    return (
      <section className="panel">
        <div className="dash-panel-head">
          <div className="dash-panel-title">评分目标</div>
        </div>
        <p className="dash-muted">暂未设置目标，前往设置页添加。</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="dash-panel-head">
        <div className="dash-panel-title">评分目标</div>
      </div>
      {goals.map((goal) => {
        const account = accounts.find((a) => a.platform === goal.platform);
        const current = account?.rating ?? 0;
        const pct = goal.targetRating > 0
          ? Math.min(100, Math.round((current / goal.targetRating) * 100))
          : 0;
        const cfg = PLATFORM_CONFIG[goal.platform] ?? { chip: goal.platform, cls: "", color: "var(--ojdr-accent)" };

        return (
          <div key={goal.id} className="dash-goal-row">
            <span className={`dash-chip ${cfg.cls}`}>{cfg.chip}</span>
            <div className="dash-goal-ratings">
              <span className="dash-goal-now" style={{ color: cfg.color }}>{current}</span>
              <span className="dash-goal-arrow">→</span>
              <span className="dash-goal-target">{goal.targetRating}</span>
            </div>
            <div className="dash-goal-bar">
              <div className="dash-goal-fill" style={{ width: `${pct}%`, background: cfg.color }} />
            </div>
            <div className="dash-goal-pct">{pct}%</div>
          </div>
        );
      })}
    </section>
  );
});
