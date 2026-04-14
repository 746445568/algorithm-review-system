import { memo } from "react";
import { AnalysisResult, ErrorMessage, FailedState, LoadingState } from "./AnalysisResult.jsx";

/**
 * 全局分析面板组件
 * @param {{
 *   period: string,
 *   setPeriod: Function,
 *   globalTask: object|null,
 *   globalLoading: boolean,
 *   globalError: string|null,
 *   onGenerateGlobal: Function,
 *   compTask: object|null,
 *   compLoading: boolean,
 *   compError: string|null,
 *   onGenerateComparison: Function
 * }} props
 */
export const GlobalAnalysis = memo(function GlobalAnalysis({
  period,
  setPeriod,
  globalTask,
  globalLoading,
  globalError,
  onGenerateGlobal,
  compTask,
  compLoading,
  compError,
  onGenerateComparison
}) {
  const handlePeriodChange = (newPeriod) => {
    setPeriod(newPeriod);
  };

  const handleGlobalRetry = () => {
    // 重试逻辑由父组件处理
  };

  const isLoading = globalLoading || (globalTask && globalTask.status !== "SUCCESS" && globalTask.status !== "FAILED");

  return (
    <div className="an-panel">
      <h3 className="an-panel-title">全局报告</h3>

      {/* Period toggle */}
      <div className="an-period-toggle">
        <button
          type="button"
          className={`an-period-btn${period === "week" ? " an-period-btn--active" : ""}`}
          onClick={() => handlePeriodChange("week")}
        >
          本周
        </button>
        <button
          type="button"
          className={`an-period-btn${period === "month" ? " an-period-btn--active" : ""}`}
          onClick={() => handlePeriodChange("month")}
        >
          本月
        </button>
      </div>

      {/* Generate button */}
      <button
        type="button"
        className="primary-button an-generate-btn"
        disabled={globalLoading}
        onClick={onGenerateGlobal}
      >
        {globalLoading ? (
          <><span className="an-spinner" /> 生成中…</>
        ) : (
          "生成报告"
        )}
      </button>

      {/* Global analysis result */}
      {globalError && <ErrorMessage message={globalError} />}

      {isLoading && <LoadingState task={globalTask} />}

      {globalTask?.status === "FAILED" && (
        <FailedState
          task={globalTask}
          onRetry={handleGlobalRetry}
        />
      )}

      {globalTask?.status === "SUCCESS" && (
        <AnalysisResult task={globalTask} />
      )}

      {/* Comparison section */}
      <div className="an-comp-section">
        <h4 className="an-comp-title">环比分析</h4>
        <button
          type="button"
          className="ghost-button an-comp-btn"
          disabled={compLoading}
          onClick={onGenerateComparison}
        >
          {compLoading ? (
            <><span className="an-spinner" /> 生成中…</>
          ) : (
            "生成环比"
          )}
        </button>

        {compError && <ErrorMessage message={compError} isSmall />}

        {(compLoading || (compTask && compTask.status !== "SUCCESS" && compTask.status !== "FAILED")) && (
          <LoadingState task={compTask} isSmall />
        )}

        {compTask?.status === "FAILED" && (
          <FailedState task={compTask} isSmall />
        )}

        {compTask?.status === "SUCCESS" && (
          <AnalysisResult task={compTask} isCompact />
        )}
      </div>
    </div>
  );
});
