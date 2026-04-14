import { memo, useCallback } from "react";
import { ProblemSearchSelector } from "./ProblemSearchSelector.jsx";
import { LoadingState, ErrorMessage, AnalysisResult, FailedState } from "./AnalysisResult.jsx";

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
  const handleSelectChange = useCallback((problemId) => {
    setSelectedProblemId(problemId);
  }, [setSelectedProblemId]);

  const handleGenerate = useCallback(() => {
    onGenerateProblem(selectedProblemId);
  }, [onGenerateProblem, selectedProblemId]);

  const handleRetry = useCallback(() => {
    // 重试逻辑由父组件处理
  }, []);

  const isLoading = problemLoading || (problemTask && problemTask.status !== "SUCCESS" && problemTask.status !== "FAILED");

  return (
    <div className="an-panel">
      <h3 className="an-panel-title">单题分析</h3>

      {/* Problem selector */}
      <div className="an-field">
        <label className="an-label" htmlFor="ap-problem-select">选择题目</label>
        <ProblemSearchSelector
          value={selectedProblemId}
          onChange={handleSelectChange}
          problems={problems}
        />
      </div>

      {/* Generate button */}
      <button
        type="button"
        className="primary-button an-generate-btn"
        disabled={problemLoading || !selectedProblemId}
        onClick={handleGenerate}
      >
        {problemLoading ? (
          <><span className="an-spinner" /> 生成中…</>
        ) : (
          "生成分析"
        )}
      </button>

      {/* Problem analysis result */}
      {problemError && <ErrorMessage message={problemError} />}

      {isLoading && <LoadingState task={problemTask} />}

      {problemTask?.status === "FAILED" && (
        <FailedState
          task={problemTask}
          onRetry={handleRetry}
        />
      )}

      {problemTask?.status === "SUCCESS" && (
        <AnalysisResult task={problemTask} />
      )}
    </div>
  );
});
