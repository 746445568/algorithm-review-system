import React from "react";
import { formatDate } from "../../../lib/format.js";

const STATUS_OPTIONS = [
  { value: "TODO", label: "待复习" },
  { value: "REVIEWING", label: "复习中" },
  { value: "SCHEDULED", label: "已排期" },
  { value: "DONE", label: "已完成" },
];

const RATE_OPTIONS = [
  { quality: 1, label: "完全忘记" },
  { quality: 2, label: "模糊记得" },
  { quality: 3, label: "费力回想" },
  { quality: 4, label: "有些犹豫" },
  { quality: 5, label: "完全流畅" },
];

const NOTE_FIELDS = [
  { key: "cause", label: "错误原因", placeholder: "这题错在哪里？记录最小反例、漏掉的性质或实现问题。" },
  { key: "idea", label: "正确思路", placeholder: "写下下次应该从哪个性质、模板或状态定义切入。" },
  { key: "trick", label: "关键性质 / 套路", placeholder: "沉淀可迁移的技巧，例如 border 链、倒推 DP、全局 offset。" },
  { key: "remind", label: "下次提醒", placeholder: "给未来自己的短提醒，越具体越好。" },
];

const NOTE_HEADINGS = {
  cause: "错误原因",
  idea: "正确思路",
  trick: "关键性质 / 套路",
  remind: "下次提醒",
};

function parseStructuredNotes(notes) {
  const text = notes || "";
  const sections = { cause: "", idea: "", trick: "", remind: "" };
  const headingPattern = /(?:^|\n)##\s*(错误原因|正确思路|关键性质\s*\/\s*套路|下次提醒)\s*\n/g;
  const matches = [...text.matchAll(headingPattern)];

  if (matches.length === 0) {
    sections.cause = text.trim();
    return sections;
  }

  matches.forEach((match, index) => {
    const rawHeading = match[1].replace(/\s+/g, "");
    const key = Object.entries(NOTE_HEADINGS).find(([, label]) =>
      label.replace(/\s+/g, "") === rawHeading,
    )?.[0];
    if (!key) return;
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    sections[key] = text.slice(start, end).trim();
  });

  return sections;
}

function composeStructuredNotes(sections) {
  return NOTE_FIELDS
    .map((field) => {
      const value = sections[field.key]?.trim();
      return value ? `## ${NOTE_HEADINGS[field.key]}\n${value}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function buildAiCards(selectedProblem, selectedTags) {
  const verdict = selectedProblem?.latestVerdict || "WA";
  const tags = selectedTags?.length ? selectedTags : ["模板", "边界"];

  return [
    ["错误类型", ["实现错误", verdict === "TLE" ? "复杂度过高" : "边界处理风险"]],
    ["关键漏洞", [`${tags[0]} 检查不足`, "复盘中缺少反例"]],
    ["正确切入点", [`${tags[0]} 模板回忆`, "先写性质再写代码"]],
    ["相似题提醒", ["CF 126B", "CF 271D"]],
  ];
}

export const StateTab = React.memo(function StateTab({
  reviewState,
  setReviewState,
  srsInfo,
  reviewStateSupported,
  reviewSaving,
  serviceUnavailable,
  rating,
  supportMessage,
  selectedProblem,
  selectedTags,
  handleRate,
  saveReviewState,
}) {
  const structuredNotes = parseStructuredNotes(reviewState.notes);
  const aiCards = buildAiCards(selectedProblem, selectedTags);

  function updateNoteField(key, value) {
    const next = { ...structuredNotes, [key]: value };
    setReviewState((s) => ({ ...s, notes: composeStructuredNotes(next) }));
  }

  return (
    <div className="rd-state-workspace">
      {!reviewStateSupported && (
        <p className="rd-support-msg">{supportMessage}</p>
      )}

      <div className="rd-status-strip">
        <span className="rd-label">复习状态</span>
        <div className="rd-status-btns">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`rd-status-btn${reviewState.status === opt.value ? " rd-status-btn--active" : ""}`}
              disabled={!reviewStateSupported}
              onClick={() =>
                setReviewState((s) => ({ ...s, status: opt.value }))
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="panel rd-structured-panel">
        <div className="rd-panel-head">
          <h3>结构化复盘</h3>
          <span>只保留和当前题有关的信息</span>
        </div>
        <div className="rd-notes-grid">
          {NOTE_FIELDS.map((field) => (
            <label key={field.key} className="rd-note-box">
              <span>{field.label}</span>
              <textarea
                value={structuredNotes[field.key]}
                disabled={!reviewStateSupported}
                placeholder={field.placeholder}
                onChange={(e) => updateNoteField(field.key, e.target.value)}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="panel rd-ai-assist-panel">
        <div className="rd-panel-head">
          <h3>AI 辅助分析</h3>
          <button type="button" className="rd-soft-btn" disabled={serviceUnavailable}>
            生成 / 更新分析
          </button>
        </div>
        <div className="rd-ai-card-grid">
          {aiCards.map(([title, items]) => (
            <article key={title} className="rd-ai-small-card">
              <h4>{title}</h4>
              <ul>
                {items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>

      <div className="rd-next-review-row">
        <label className="rd-next-review-field" htmlFor="rd-next-review">
          <span>下次复习时间（手动调整）</span>
          <input
            id="rd-next-review"
            type="datetime-local"
            value={reviewState.nextReviewAt}
            disabled={!reviewStateSupported}
            onChange={(e) =>
              setReviewState((s) => ({ ...s, nextReviewAt: e.target.value }))
            }
          />
        </label>
        {srsInfo.intervalDays > 0 && (
          <p className="rd-srs-hint">
            当前间隔 {srsInfo.intervalDays} 天 · 已复习{" "}
            {srsInfo.repetitionCount} 次 · 熟练度{" "}
            {srsInfo.easeFactor.toFixed(2)}
          </p>
        )}
      </div>

      <div className="rd-bottom-bar">
        <span className="rd-label">SM-2 评分</span>
        <div className="rd-rate-btns">
          {RATE_OPTIONS.map((opt) => (
            <button
              key={opt.quality}
              type="button"
              className="rd-rate-btn"
              disabled={!reviewStateSupported || rating || serviceUnavailable}
              onClick={() => handleRate(opt.quality)}
              title={`快捷键 ${opt.quality}`}
            >
              <span className="rd-rate-num">{opt.quality}</span>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
        <div className="rd-save-actions">
          <span className="rd-last-saved">
            {reviewState.lastUpdatedAt
              ? `上次保存 ${formatDate(reviewState.lastUpdatedAt)}`
              : `${reviewState.notes.length} 字`}
          </span>
          <button
            type="button"
            className="primary-button rd-save-btn"
            disabled={reviewSaving || serviceUnavailable || !reviewStateSupported}
            onClick={() => void saveReviewState()}
          >
            {reviewSaving ? (
              <>
                <span className="rd-spinner" /> 保存中…
              </>
            ) : (
              "保存并安排下次复习"
            )}
          </button>
        </div>
      </div>
    </div>
  );
});
