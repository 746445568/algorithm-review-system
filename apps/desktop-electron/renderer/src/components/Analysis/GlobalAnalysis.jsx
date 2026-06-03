import { memo } from "react";
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();

  const handlePeriodChange = (newPeriod) => {
    setPeriod(newPeriod);
  };

  const isLoading = globalLoading || (globalTask && globalTask.status !== "SUCCESS" && globalTask.status !== "FAILED");

  return (
    <div className="an-panel page-content">
      <div className="an-panel-header">
        <h3 className="an-panel-title">{t('analysis.global.title')}</h3>
      </div>

      {/* Period toggle */}
      <div className="an-field">
        <span className="an-label">{t('analysis.global.periodLabel')}</span>
        <div className="an-period-toggle">
          <button
            type="button"
            className={`an-period-btn${period === "week" ? " an-period-btn--active" : ""}`}
            onClick={() => handlePeriodChange("week")}
          >
            {t('analysis.global.week')}
          </button>
          <button
            type="button"
            className={`an-period-btn${period === "month" ? " an-period-btn--active" : ""}`}
            onClick={() => handlePeriodChange("month")}
          >
            {t('analysis.global.month')}
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
          <><span className="an-spinner" /> {t('analysis.global.generating')}</>
        ) : (
          t('analysis.global.generate')
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
        <h4 className="an-comp-title">{t('analysis.global.trendTitle')}</h4>
        <button
          type="button"
          className="ghost-button an-comp-btn"
          disabled={compLoading || !globalTask}
          onClick={onGenerateComparison}
          title={!globalTask ? t('analysis.global.generateGlobalFirst') : ""}
        >
          {compLoading ? (
            <><span className="an-spinner" /> {t('analysis.global.calculatingTrend')}</>
          ) : (
            t('analysis.global.generateComparison')
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
