import { formatDate, statusLabel } from "../lib/format.js";

export function ReviewStateEditor({
  reviewState,
  reviewSaving,
  reviewNotice,
  reviewStateSupported,
  reviewStateSupportMessage,
  serviceUnavailable,
  selectedProblem,
  onChange,
  onSave,
}) {
  return (
    <div className="panel review-editor-panel">
      <div className="panel-header">
        <h3>复习状态</h3>
        <span className="caption">状态、笔记和下次复习时间</span>
      </div>
      {selectedProblem ? (
        <div className="form-stack">
          {!reviewStateSupported ? <p className="error-text">{reviewStateSupportMessage}</p> : null}
          <label>
            <span>状态</span>
            <select
              value={reviewState.status}
              disabled={!reviewStateSupported}
              onChange={(event) => onChange({ status: event.target.value })}
            >
              <option value="TODO">待复习</option>
              <option value="REVIEWING">复习中</option>
              <option value="SCHEDULED">已排期</option>
              <option value="DONE">已完成</option>
            </select>
          </label>

          <label>
            <span>下次复习时间</span>
            <input
              type="datetime-local"
              value={reviewState.nextReviewAt}
              disabled={!reviewStateSupported}
              onChange={(event) => onChange({ nextReviewAt: event.target.value })}
            />
          </label>

          <label>
            <span>笔记</span>
            <textarea
              rows="8"
              value={reviewState.notes}
              disabled={!reviewStateSupported}
              placeholder="记录错误原因、正确思路和下次注意事项。"
              onChange={(event) => onChange({ notes: event.target.value })}
            />
          </label>

          <div className="editor-toolbar">
            <span className="meta-pill review-state-pill">
              {statusLabel(reviewState.status)}
              <span>{reviewState.lastUpdatedAt ? formatDate(reviewState.lastUpdatedAt) : "尚未保存"}</span>
            </span>
            <button
              type="button"
              className="primary-button"
              disabled={reviewSaving || serviceUnavailable || !reviewStateSupported}
              onClick={() => void onSave()}
            >
              {reviewSaving ? "保存中..." : "保存复习状态"}
            </button>
          </div>

          {reviewNotice ? <p className="success-text">{reviewNotice}</p> : null}
        </div>
      ) : (
        <p className="muted">请先选择一道题目再编辑复习状态。</p>
      )}
    </div>
  );
}
