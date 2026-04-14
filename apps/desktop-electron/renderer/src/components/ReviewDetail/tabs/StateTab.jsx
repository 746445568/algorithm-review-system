import React from "react";
import { SimpleMarkdown } from "../../SimpleMarkdown.jsx";
import { formatDate } from "../../../lib/format.js";

const STATUS_OPTIONS = [
  { value: "TODO", label: "待复习", chipClass: "rl-chip-neutral" },
  { value: "REVIEWING", label: "复习中", chipClass: "rl-chip-warn" },
  { value: "SCHEDULED", label: "已排期", chipClass: "rl-chip-blue" },
  { value: "DONE", label: "已完成", chipClass: "rl-chip-good" },
];

const RATE_OPTIONS = [
  { quality: 1, label: "忘了", key: "Q", className: "rd-rate-btn--forgot" },
  { quality: 2, label: "困难", key: "W", className: "rd-rate-btn--hard" },
  { quality: 3, label: "一般", key: "E", className: "rd-rate-btn--medium" },
  { quality: 5, label: "简单", key: "R", className: "rd-rate-btn--easy" },
];

export const StateTab = React.memo(function StateTab({
  reviewState,
  setReviewState,
  srsInfo,
  reviewStateSupported,
  reviewSaving,
  serviceUnavailable,
  rating,
  supportMessage,
  handleRate,
  saveReviewState,
}) {
  return (
    <div className="panel rd-state-panel">
      {!reviewStateSupported && (
        <p className="rd-support-msg">{supportMessage}</p>
      )}

      <div className="rd-field">
        <span className="rd-label">复习状态</span>
        <div className="rd-status-btns">
          {STATUS_OPTIONS.map((opt, i) => (
            <button
              key={opt.value}
              type="button"
              className={`rd-status-btn${reviewState.status === opt.value ? " rd-status-btn--active" : ""}`}
              disabled={!reviewStateSupported}
              onClick={() =>
                setReviewState((s) => ({ ...s, status: opt.value }))
              }
            >
              <span className="rd-status-key">{i + 1}</span>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rd-field">
        <span className="rd-label">间隔重复评分</span>
        <div className="rd-rate-btns">
          {RATE_OPTIONS.map((opt) => (
            <button
              key={opt.quality}
              type="button"
              className={`rd-rate-btn ${opt.className}`}
              disabled={!reviewStateSupported || rating || serviceUnavailable}
              onClick={() => handleRate(opt.quality)}
              title={`快捷键 ${opt.key}`}
            >
              <span className="rd-rate-key">{opt.key}</span>
              {opt.label}
            </button>
          ))}
        </div>
        {srsInfo.intervalDays > 0 && (
          <p className="rd-srs-hint">
            当前间隔 {srsInfo.intervalDays} 天 · 已复习{" "}
            {srsInfo.repetitionCount} 次 · 熟练度{" "}
            {srsInfo.easeFactor.toFixed(2)}
          </p>
        )}
      </div>

      <div className="rd-field">
        <label className="rd-label" htmlFor="rd-next-review">
          下次复习时间（手动调整）
        </label>
        <input
          id="rd-next-review"
          type="datetime-local"
          value={reviewState.nextReviewAt}
          disabled={!reviewStateSupported}
          onChange={(e) =>
            setReviewState((s) => ({ ...s, nextReviewAt: e.target.value }))
          }
        />
      </div>

      <div className="rd-field">
        <div className="rd-notes-header">
          <label className="rd-label" htmlFor="rd-notes">
            笔记
          </label>
          <span className="rd-char-count">{reviewState.notes.length} 字</span>
        </div>
        <textarea
          id="rd-notes"
          className="rd-notes-area"
          rows={6}
          value={reviewState.notes}
          disabled={!reviewStateSupported}
          placeholder={
            "记录错误原因、正确思路…\n\n支持 **粗体**、` 代码 `、## 标题、- 列表"
          }
          onChange={(e) =>
            setReviewState((s) => ({ ...s, notes: e.target.value }))
          }
        />
      </div>

      {reviewState.notes.trim() && (
        <div className="rd-preview">
          <span className="rd-label">预览</span>
          <div className="rd-preview-body">
            <SimpleMarkdown text={reviewState.notes} />
          </div>
        </div>
      )}

      <div className="rd-save-bar">
        <span className="rd-last-saved">
          {reviewState.lastUpdatedAt
            ? `上次保存 ${formatDate(reviewState.lastUpdatedAt)}`
            : "尚未保存"}
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
            <>
              <span className="rd-kbd-hint">⌘S</span> 保存
            </>
          )}
        </button>
      </div>
    </div>
  );
});
