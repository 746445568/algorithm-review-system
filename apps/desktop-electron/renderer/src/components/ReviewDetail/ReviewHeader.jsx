import React from "react";
import { formatDate, statusLabel, tagLabel, verdictTone } from "../../lib/format.js";
import { useNavigation } from "../../lib/NavigationContext.jsx";

export const ReviewHeader = React.memo(function ReviewHeader({
  selectedProblem,
  selectedProblemRecord,
  selectedTags,
}) {
  const { navigateTo } = useNavigation();

  if (!selectedProblem) return null;

  return (
    <div className="panel rd-header-panel">
      <div className="rd-problem-top">
        <div className="rd-problem-info">
          <span className="rd-platform-badge">{selectedProblem.platform}</span>
          <h3 className="rd-problem-title">{selectedProblem.title}</h3>
          <p className="rd-problem-sub">
            {selectedProblem.externalProblemId}
            {selectedProblem.contestId
              ? ` · 比赛 ${selectedProblem.contestId}`
              : ""}
          </p>
        </div>
        <div className="rd-problem-actions">
          <span
            className={`rd-solved-badge ${selectedProblem.solvedLater ? "badge-good" : "badge-bad"}`}
          >
            {selectedProblem.solvedLater ? "已通过" : "仍未通过"}
          </span>
          <button
            type="button"
            className="ghost-button"
            onClick={() =>
              navigateTo("analysis", { problemId: selectedProblem.problemId })
            }
          >
            分析这道题
          </button>
          {selectedProblemRecord?.url ? (
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                if (window.desktopBridge?.openExternal) {
                  window.desktopBridge.openExternal(selectedProblemRecord.url);
                } else {
                  window.open(selectedProblemRecord.url, "_blank");
                }
              }}
            >
              打开题目 ↗
            </button>
          ) : null}
        </div>
      </div>

      <div className="rd-metrics">
        <article>
          <span>尝试次数</span>
          <strong>{selectedProblem.attemptCount}</strong>
        </article>
        <article>
          <span>复习状态</span>
          <strong>{statusLabel(selectedProblem.reviewStatus)}</strong>
        </article>
        <article>
          <span>下次复习</span>
          <strong>
            {selectedProblem.nextReviewAt
              ? formatDate(selectedProblem.nextReviewAt)
              : "未设置"}
          </strong>
        </article>
        <article>
          <span>最近判定</span>
          <strong
            className={
              verdictTone(selectedProblem.latestVerdict) === "good"
                ? "text-good"
                : verdictTone(selectedProblem.latestVerdict) === "bad"
                  ? "text-bad"
                  : ""
            }
          >
            {selectedProblem.latestVerdict || "—"}
          </strong>
        </article>
      </div>

      {selectedTags && selectedTags.length > 0 && (
        <div className="rd-tags">
          {selectedTags.map((tag) => (
            <span key={tag} className="rd-tag">
              {tagLabel(tag)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
});
