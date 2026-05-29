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

  const isLoading = globalLoading || (globalTask && globalTask.status !== "SUCCESS" && globalTask.status !== "FAILED");

  return (
    <div className="an-panel page-content">
      <div className="an-panel-header">
        <h3 className="an-panel-title">全局复盘报告</h3>
      </div>

      {/* Period toggle */}
      <div className="an-field">
        <span className="an-label">分析时间范围</span>
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
      </div>

      {/* Generate button */}
      <button
        type="button"
        className="primary-button an-generate-btn"
        disabled={globalLoading}
        onClick={onGenerateGlobal}
      >
        {globalLoading ? (
          <><span className="an-spinner" /> AI 正在深度复盘中…</>
        ) : (
          "生成全局报告"
        )}
      </button>

      {/* Global analysis result area */}
      <div className="an-result-area">
        {globalError && <ErrorMessage message={globalError} />}

        {isLoading && <LoadingState task={globalTask} />}

        {globalTask?.status === "FAILED" && (
          <FailedState
            task={globalTask}
            onRetry={onGenerateGlobal}
          />
        )}

        {globalTask?.status === "SUCCESS" && (
          <AnalysisResult task={globalTask} />
        )}
      </div>

      {/* Comparison section */}
      <div className="an-comp-section">
        <h4 className="an-comp-title">进步趋势分析</h4>
        <button
          type="button"
          className="ghost-button an-comp-btn"
          disabled={compLoading || !globalTask}
          onClick={onGenerateComparison}
          title={!globalTask ? "请先生成全局报告" : ""}
        >
          {compLoading ? (
            <><span className="an-spinner" /> 计算趋势中…</>
          ) : (
            "生成环比分析"
          )}
        </button>

        <div className="an-result-area">
          {compError && <ErrorMessage message={compError} isSmall />}

          {(compLoading || (compTask && compTask.status !== "SUCCESS" && compTask.status !== "FAILED")) && (
            <LoadingState task={compTask} isSmall />
          )}

          {compTask?.status === "FAILED" && (
            <FailedState task={compTask} isSmall onRetry={onGenerateComparison} />
          )}

          {compTask?.status === "SUCCESS" && (
            <AnalysisResult task={compTask} isCompact />
          )}
        </div>
      </div>
    </div>
  );
});
