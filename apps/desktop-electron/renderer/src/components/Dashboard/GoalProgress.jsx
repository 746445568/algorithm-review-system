import { memo } from "react";
import { useTranslation } from 'react-i18next';
import { useNavigation } from "../../lib/NavigationContext.jsx";

const PLATFORM_CONFIG = {
  CODEFORCES: { chip: "CF", cls: "chip-cf", color: "#818cf8" },
  ATCODER: { chip: "AT", cls: "chip-at", color: "#FDBA74" },
};

export const GoalProgress = memo(function GoalProgress({ goals = [], accounts = [] }) {
  const { navigateTo } = useNavigation();
  const { t, i18n } = useTranslation();

  if (goals.length === 0) {
    return (
      <section className="panel">
        <div className="dash-panel-head">
          <div className="dash-panel-title">{t('dashboard.goal.ratingGoal')}</div>
        </div>
        <div className="dash-empty-action">
          <p className="dash-muted">{t('dashboard.goal.noGoalHint')}</p>
          <button
            type="button"
            className="dash-btn-ghost"
            onClick={() => navigateTo("settings", { focus: "goals" })}
          >
            {t('dashboard.goal.goSetGoal')}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="dash-panel-head">
        <div className="dash-panel-title">{t('dashboard.goal.ratingGoal')}</div>
      </div>
      {goals.map((goal) => {
        const account = accounts.find((a) => a.platform === goal.platform);
        const current = account?.rating ?? 0;
        const pct = goal.targetRating > 0
          ? Math.min(100, Math.round((current / goal.targetRating) * 100))
          : 0;
        const cfg = PLATFORM_CONFIG[goal.platform] ?? {
          chip: goal.platform || t('dashboard.goal.target'),
          cls: "",
          color: "var(--ojdr-accent)",
        };

        const hasDeadline = Boolean(goal.deadline);
        const deadlineText = hasDeadline
          ? new Date(goal.deadline).toLocaleDateString(i18n.language || 'zh-CN')
          : '';

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
            <div className="dash-goal-meta">
              <span className="dash-goal-pct">{pct}%</span>
              {hasDeadline && (
                <span className="dash-goal-deadline" title={deadlineText}>
                  {t('settings.goals.deadlineValue', { date: deadlineText })}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
});
