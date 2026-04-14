import { memo } from "react";

export const GoalProgress = memo(function GoalProgress({ goals, accounts }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h3>目标进度</h3>
      </div>
      <div className="stack-list">
        {goals.map((goal) => {
          const account = accounts.find((a) => a.platform === goal.platform);
          const current = account?.rating ?? 0;
          const pct = Math.min(100, Math.round((current / goal.targetRating) * 100));
          return (
            <article key={goal.id} className="goal-card">
              <div className="goal-header">
                <strong>{goal.title}</strong>
                <span className="muted">{current} / {goal.targetRating}</span>
              </div>
              <div className="goal-bar-track">
                <div className="goal-bar-fill" style={{ width: `${pct}%` }} />
              </div>
              <p className="goal-footer muted">
                {pct}% 完成
                {goal.deadline ? ` · 截止 ${new Date(goal.deadline).toLocaleDateString("zh-CN")}` : ""}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
});
