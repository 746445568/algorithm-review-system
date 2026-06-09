import React from "react";
import { tagLabel, verdictTone } from "../../lib/format.js";
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
          <div className="rd-title-line">
            <span className="rd-platform-badge">{selectedProblem.platform}</span>
            <h3 className="rd-problem-title">{selectedProblem.title}</h3>
            <span className="rd-problem-sub">
              {selectedProblem.platform} {selectedProblem.externalProblemId}
            </span>
            <span
              className={[
                "rd-verdict-badge",
                verdictTone(selectedProblem.latestVerdict) === "good"
                  ? "badge-good"
                  : verdictTone(selectedProblem.latestVerdict) === "bad"
                    ? "badge-bad"
                    : "",
              ].join(" ")}
            >
              {selectedProblem.latestVerdict || "—"}
            </span>
          </div>
        </div>
        <div className="rd-problem-actions">
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
