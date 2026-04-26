import { memo, useCallback, useState } from "react";
import { api } from "../../lib/api.js";

const CF_TIERS = [
  { min: 0,    max: 1199, color: "#888888", label: "灰" },
  { min: 1200, max: 1399, color: "#00aa00", label: "绿" },
  { min: 1400, max: 1599, color: "#03a89e", label: "青" },
  { min: 1600, max: 1899, color: "#0000ff", label: "蓝" },
  { min: 1900, max: 2099, color: "#aa00aa", label: "紫" },
  { min: 2100, max: 2399, color: "#ff8c00", label: "橙" },
  { min: 2400, max: 9999, color: "#ee0000", label: "红" },
];

const AT_TIERS = [
  { min: 0,    max: 399,  color: "#808080", label: "灰" },
  { min: 400,  max: 799,  color: "#804000", label: "茶" },
  { min: 800,  max: 1199, color: "#008000", label: "绿" },
  { min: 1200, max: 1599, color: "#00c0c0", label: "青" },
  { min: 1600, max: 1999, color: "#0000ff", label: "蓝" },
  { min: 2000, max: 2399, color: "#c0c000", label: "黄" },
  { min: 2400, max: 2799, color: "#ff8000", label: "橙" },
  { min: 2800, max: 9999, color: "#ff0000", label: "红" },
];

const PLATFORMS = [
  { key: "CODEFORCES", label: "Codeforces", tiers: CF_TIERS, maxScale: 3000 },
  { key: "ATCODER",    label: "AtCoder",    tiers: AT_TIERS,  maxScale: 3200 },
];

function getTier(rating, tiers) {
  return tiers.slice().reverse().find(t => rating >= t.min) || tiers[0];
}

function GoalBar({ current, target, tiers, maxScale }) {
  const scale = maxScale || Math.max(target * 1.1, current * 1.1, 800);
  const currentPct = Math.min(current / scale * 100, 100);
  const targetPct  = Math.min(target  / scale * 100, 100);
  const currentTier = getTier(current, tiers);
  const targetTier  = getTier(target,  tiers);
  const ticks = tiers.filter(t => t.min > 0 && t.min <= scale);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 8 }}>
        <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-1px", color: currentTier.color, lineHeight: 1 }}>
          {current}
        </span>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 2 }}>目标</div>
          <span style={{ fontSize: 20, fontWeight: 700, color: targetTier.color }}>{target}</span>
        </div>
      </div>

      <div style={{ position: "relative", height: 10, background: "var(--line)", borderRadius: 5, marginBottom: 6 }}>
        {tiers.map((t, i) => {
          const start = Math.max(t.min, 0) / scale * 100;
          const end   = Math.min(t.max + 1, scale) / scale * 100;
          if (start >= 100) return null;
          return (
            <div key={i} style={{
              position: "absolute", left: `${start}%`,
              width: `${Math.min(end, 100) - start}%`,
              height: "100%", background: t.color, opacity: 0.18,
              borderRadius: i === 0 ? "5px 0 0 5px" : i === tiers.length - 1 ? "0 5px 5px 0" : 0,
            }} />
          );
        })}
        <div style={{
          position: "absolute", left: 0, width: `${currentPct}%`,
          height: "100%", background: currentTier.color,
          borderRadius: 5, opacity: 0.85, transition: "width 0.6s ease",
        }} />
        <div style={{
          position: "absolute", left: `${targetPct}%`, top: -3,
          transform: "translateX(-50%)", width: 3, height: 16,
          background: targetTier.color, borderRadius: 2, zIndex: 2,
        }} />
        <div style={{
          position: "absolute", left: `${currentPct}%`, top: "50%",
          transform: "translate(-50%,-50%)", width: 14, height: 14,
          borderRadius: "50%", background: currentTier.color,
          border: "2px solid var(--panel-strong)", zIndex: 3,
        }} />
      </div>

      <div style={{ position: "relative", height: 16 }}>
        {ticks.map((t, i) => {
          const pct = t.min / scale * 100;
          if (pct > 98) return null;
          return (
            <div key={i} style={{
              position: "absolute", left: `${pct}%`,
              transform: "translateX(-50%)", fontSize: 9,
              color: t.color, fontWeight: 600, whiteSpace: "nowrap",
            }}>{t.min}</div>
          );
        })}
      </div>

      <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
        {current >= target ? (
          <span style={{ fontSize: 12, color: "var(--good)", fontWeight: 600 }}>✓ 已达成目标！</span>
        ) : (
          <>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>还差</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: targetTier.color }}>{target - current} 分</span>
            <div style={{ flex: 1, height: 3, borderRadius: 2, background: "var(--line)", overflow: "hidden" }}>
              <div style={{
                height: "100%", background: currentTier.color,
                width: `${Math.min(current / target * 100, 100)}%`,
                transition: "width 0.6s",
              }} />
            </div>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>{Math.round(current / target * 100)}%</span>
          </>
        )}
      </div>
    </div>
  );
}

function buildDraft(goals) {
  const draft = {};
  for (const p of PLATFORMS) {
    const goal = goals.find(g => g.platform === p.key);
    draft[p.key] = {
      target: goal ? String(goal.targetRating) : "",
      deadline: goal?.deadline ?? "",
    };
  }
  return draft;
}

export const GoalPanel = memo(function GoalPanel({ goals, accounts, onMutate }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => buildDraft(goals));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function startEditing() {
    setDraft(buildDraft(goals));
    setError("");
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setError("");
  }

  function updateDraft(platformKey, field, value) {
    setDraft(d => ({ ...d, [platformKey]: { ...d[platformKey], [field]: value } }));
  }

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError("");
    try {
      for (const p of PLATFORMS) {
        const d = draft[p.key];
        const existing = goals.filter(g => g.platform === p.key);
        const targetNum = parseInt(d.target, 10);
        const hasValidTarget = d.target !== "" && !isNaN(targetNum) && targetNum > 0;

        for (const g of existing) {
          await api.deleteGoal(g.id);
        }

        if (hasValidTarget) {
          await api.createGoal({
            platform: p.key,
            title: `${p.label} 目标 ${targetNum}`,
            targetRating: targetNum,
            deadline: d.deadline || undefined,
          });
        }
      }
      await onMutate?.();
      setEditing(false);
    } catch (err) {
      setError(err.message || "保存失败，请重试");
    } finally {
      setSaving(false);
    }
  }, [draft, goals, onMutate]);

  return (
    <section className="panel">
      <div className="panel-header">
        <h3>目标系统</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {editing ? (
            <>
              {error && <span style={{ fontSize: 12, color: "var(--bad)" }}>{error}</span>}
              <button type="button" className="ghost-button" onClick={cancelEditing} disabled={saving}>
                取消
              </button>
              <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? "保存中…" : "保存"}
              </button>
            </>
          ) : (
            <button type="button" className="ghost-button" onClick={startEditing}>
              编辑目标
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {PLATFORMS.map(p => {
          const goal    = goals.find(g => g.platform === p.key);
          const account = accounts.find(a => a.platform === p.key);
          const current = account?.rating ?? 0;

          return (
            <div key={p.key}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                <span className={`goal-platform-pill goal-platform-pill--${p.key.toLowerCase()}`}>
                  {p.label}
                </span>
                {editing ? (
                  <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--muted)" }}>
                      目标分
                      <input
                        type="number"
                        min="1"
                        max="9999"
                        className="goal-number-input"
                        value={draft[p.key].target}
                        onChange={e => updateDraft(p.key, "target", e.target.value)}
                        placeholder="如 1500"
                      />
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--muted)" }}>
                      截止日期
                      <input
                        type="date"
                        className="goal-date-input"
                        value={draft[p.key].deadline}
                        onChange={e => updateDraft(p.key, "deadline", e.target.value)}
                      />
                    </label>
                  </div>
                ) : (
                  goal?.deadline && (
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>
                      截止 {new Date(goal.deadline).toLocaleDateString("zh-CN")}
                    </span>
                  )
                )}
              </div>

              {goal ? (
                <GoalBar current={current} target={goal.targetRating} tiers={p.tiers} maxScale={p.maxScale} />
              ) : (
                <p style={{ fontSize: 13, color: "var(--muted)", padding: "12px 0", fontStyle: "italic", margin: 0 }}>
                  {editing ? "输入目标分数以设置目标" : "暂未设置目标"}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
});
