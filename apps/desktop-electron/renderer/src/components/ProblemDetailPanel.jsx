import { memo, useMemo } from "react";
import { formatDate, parseTags, platformLabel, statusLabel } from "../lib/format.js";
import { desktopBridge } from "../lib/desktopBridge.js";

export const ProblemDetailPanel = memo(function ProblemDetailPanel({ selectedProblem, selectedProblemRecord }) {
  const selectedTags = useMemo(() =>
    selectedProblem?.tags?.length > 0
      ? selectedProblem.tags
      : parseTags(selectedProblemRecord?.rawTagsJson),
    [selectedProblem?.tags, selectedProblemRecord?.rawTagsJson]
  );

  return (
    <div className="panel review-summary-panel">
      {selectedProblem ? (
        <>
          <span className="section-label">{platformLabel(selectedProblem.platform)}</span>
          <h3>{selectedProblem.title}</h3>
          <p className="detail-subtitle">
            {selectedProblem.externalProblemId}
            {selectedProblem.contestId ? ` / 比赛 ${selectedProblem.contestId}` : ""}
          </p>

          <div className="detail-metrics">
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
              <strong>{selectedProblem.nextReviewAt ? formatDate(selectedProblem.nextReviewAt) : "未设置"}</strong>
            </article>
            <article>
              <span>解题状态</span>
              <strong>{selectedProblem.solvedLater ? "已恢复" : "仍未通过"}</strong>
            </article>
          </div>

          <div className="tag-row">
            {selectedTags.length === 0 ? (
              <span className="muted">暂无标签。</span>
            ) : (
              selectedTags.map((tag) => (
                <span key={tag} className="tag-chip">
                  {tag}
                </span>
              ))
            )}
          </div>

          {selectedProblemRecord?.url ? (
            <button
              type="button"
              className="ghost-button"
              onClick={() => desktopBridge.openExternal(selectedProblemRecord.url)}
            >
              打开题目页面
            </button>
          ) : null}
        </>
      ) : (
        <p className="muted">从左侧列表选择一道题目以查看详情。</p>
      )}
    </div>
  );
});
