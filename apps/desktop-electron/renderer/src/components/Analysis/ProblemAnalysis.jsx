import { memo, useCallback } from "react";
import { ProblemSearchSelector } from "./ProblemSearchSelector.jsx";
import { LoadingState, ErrorMessage, AnalysisResult, FailedState } from "./AnalysisResult.jsx";
import { tagLabel, verdictTone } from "../../lib/format.js";

function getProblemTags(problem) {
  if (Array.isArray(problem?.tags)) return problem.tags;
  if (!problem?.rawTagsJson) return [];

  try {
    const parsed = JSON.parse(problem.rawTagsJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getVerdict(problem) {
  return problem?.latestVerdict || problem?.verdict || "UNKNOWN";
}

function ProblemSummary({ problem }) {
  if (!problem) {
    return (
      <section className="ai-problem-summary ai-problem-summary--empty">
        <p>从上方列表选择一道曾经报错的题目，让 AI 为你总结错误模式并提供改进建议。</p>
      </section>
    );
  }

  const tags = getProblemTags(problem);
  const verdict = getVerdict(problem);
  const tone = verdictTone(verdict);
  const attempts = problem.attemptCount ?? problem.attempts ?? 0;

  return (
    <section className="ai-problem-summary" aria-label="题目摘要">
      <div className="ai-summary-top">
        <div className="ai-summary-heading">
          <span className={`ai-platform-chip ai-platform-chip--${(problem.platform || "other").toLowerCase()}`}>
            {problem.platform || "UNKNOWN"}
          </span>
          <div>
            <h4 className="ai-summary-title">{problem.title || "未命名题目"}</h4>
            <p className="ai-summary-meta">{problem.externalProblemId || "未同步题号"}</p>
          </div>
        </div>
        <span className={`ai-verdict-chip ai-verdict-chip--${tone}`}>{verdict}</span>
      </div>

      <div className="ai-summary-grid">
        <div className="ai-summary-cell">
          <span className="ai-summary-label">尝试次数</span>
          <strong className="ai-summary-value">{attempts || "—"}</strong>
        </div>
        <div className="ai-summary-cell">
          <span className="ai-summary-label">难度</span>
          <strong className="ai-summary-value">{problem.difficulty || "未记录"}</strong>
        </div>
      </div>

      {tags.length > 0 && (
        <div className="ai-summary-tags" aria-label="题目标签">
          {tags.slice(0, 6).map((tag) => (
            <span className="ai-tag" key={tag}>{tagLabel(tag)}</span>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * 单题分析面板组件
 * @param {{
 *   selectedProblemId: string|null,
 *   setSelectedProblemId: Function,
 *   problems: Array,
 *   problemTask: object|null,
 *   problemLoading: boolean,
 *   problemError: string|null,
 *   onGenerateProblem: Function
 * }} props
 */
export const ProblemAnalysis = memo(function ProblemAnalysis({
  selectedProblemId,
  setSelectedProblemId,
  problems,
  problemTask,
  problemLoading,
  problemError,
  onGenerateProblem
}) {
  const selectedProblem = problems.find((problem) => String(problem.id) === String(selectedProblemId));

  const handleSelectChange = useCallback((problemId) => {
    setSelectedProblemId(problemId);
  }, [setSelectedProblemId]);

  const handleGenerate = useCallback(() => {
    onGenerateProblem(selectedProblemId);
  }, [onGenerateProblem, selectedProblemId]);

  const isLoading = problemLoading || (problemTask && problemTask.status !== "SUCCESS" && problemTask.status !== "FAILED");
  const taskStatus = problemTask?.status || (selectedProblemId ? "READY" : "IDLE");

  return (
    <div className="an-panel page-content ai-report-card ai-single-card">
      <div className="an-panel-header">
        <h3 className="an-panel-title">单题深度分析</h3>
        <p className="an-panel-subtitle">选择错题后生成报告式诊断，聚焦错误定位、修复建议和迁移套路。</p>
      </div>

      <section className="an-field ai-picker-section">
        <label className="an-label" id="ap-problem-picker-label">选择要分析的题目</label>
        <ProblemSearchSelector
          value={selectedProblemId}
          onChange={handleSelectChange}
          problems={problems}
          labelledBy="ap-problem-picker-label"
        />
      </section>

      <ProblemSummary problem={selectedProblem} />

      <section className="an-result-area ai-analysis-list" aria-label="分析结果">
        {problemError && <ErrorMessage message={problemError} />}

        {isLoading && <LoadingState task={problemTask} />}

        {problemTask?.status === "FAILED" && (
          <FailedState
            task={problemTask}
            onRetry={handleGenerate}
          />
        )}

        {problemTask?.status === "SUCCESS" && (
          <AnalysisResult task={problemTask} />
        )}

        {!problemError && !isLoading && !problemTask && (
          <div className="an-empty-hint ai-analysis-placeholder">
            <span className="ai-analysis-icon">AI</span>
            <div>
              <h4>{selectedProblemId ? "等待生成分析" : "先选择一道题目"}</h4>
              <p>{selectedProblemId ? "点击下方按钮后，这里会显示 AI 生成的单题复盘报告。" : "题目摘要和分析报告会按纵向卡片组织在这里。"}</p>
            </div>
          </div>
        )}
      </section>

      <footer className="ai-analysis-actions">
        <div className="ai-task-status" aria-live="polite">
          <span className={`ai-status-dot ai-status-dot--${taskStatus.toLowerCase()}`} />
          <span>状态：{taskStatus === "READY" ? "已选择题目" : taskStatus === "IDLE" ? "等待选择" : taskStatus}</span>
        </div>
        <button
          type="button"
          className="primary-button an-generate-btn"
          disabled={isLoading || !selectedProblemId}
          onClick={handleGenerate}
        >
          {isLoading ? (
            <><span className="an-spinner" /> AI 正在解析题目数据…</>
          ) : (
            "开始 AI 分析"
          )}
        </button>
      </footer>
    </div>
  );
});
