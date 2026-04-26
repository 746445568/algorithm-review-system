import { memo } from "react";
import { tagLabel } from "../../lib/format.js";

/**
 * Recommended Problems Component
 * Displays AI-recommended problems for practice
 * @param {{
 *   globalTask: object|null,
 * }} props
 */
export const RecommendedProblems = memo(function RecommendedProblems({
  globalTask
}) {
  const recommendations = globalTask?.status === "SUCCESS" ? (globalTask.result?.recommendations || []) : [];

  return (
    <div className="ai-report-card">
      <div className="ai-report-head">
        <div className="ai-report-title">推荐补题</div>
        {recommendations.length > 0 && (
          <span className="priority mid">{recommendations.length} 题</span>
        )}
      </div>

      {recommendations.length > 0 ? (
        recommendations.map((problem, index) => (
          <div className="recommend-row" key={problem.id || index}>
            <div>
              <div className="rec-name">
                {problem.platform || "CF"} {problem.externalProblemId || ""} - {problem.title || "未命名题目"}
              </div>
              <div className="rec-meta">
                {(problem.tags || []).slice(0, 3).map((tag, i) => (
                  <span key={i}>
                    {i > 0 && " · "}
                    {tagLabel(tag)}
                  </span>
                ))}
              </div>
            </div>
            <span className={`ai-platform-chip ai-platform-chip--${(problem.platform || "cf").toLowerCase()}`}>
              {problem.platform || "CF"}
            </span>
          </div>
        ))
      ) : (
        <div style={{ padding: "12px", textAlign: "center", color: "var(--text3)", fontSize: "12px" }}>
          {globalTask?.status === "SUCCESS" ? "暂无推荐题目" : "请先生成全局分析报告"}
        </div>
      )}
    </div>
  );
});
