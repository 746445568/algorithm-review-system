import React from "react";
import { useTranslation } from 'react-i18next';
import { formatDate } from "../../../lib/format.js";
import { SimpleMarkdown } from "../../../components/SimpleMarkdown.jsx";

export const AnalysisTab = React.memo(function AnalysisTab({
  analysisTask,
  analysisLoading,
  analysisError,
  serviceUnavailable,
  selectedProblemId,
  handleGenerateAnalysis,
  handleAnalysisReset,
  navigateTo,
}) {
  const { t } = useTranslation();

  // Empty / error state
  if (!analysisTask && !analysisLoading) {
    return (
      <div className="panel rd-ai-panel">
        <div className="rd-ai-empty">
          <p className="rd-ai-hint">
            {t('review.detail.analysisHint')}
          </p>
          {analysisError && (
            <p className="rd-ai-error-msg">
              {analysisError.includes("provider and model are required")
                ? t('review.detail.configureAiFirst')
                : t('review.detail.analysisFailed', { error: analysisError })}
            </p>
          )}
          <button
            type="button"
            className="primary-button"
            disabled={serviceUnavailable}
            onClick={() => void handleGenerateAnalysis()}
          >
            {t('review.detail.generateAnalysis')}
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() =>
              navigateTo("analysis", { problemId: selectedProblemId })
            }
          >
            {t('review.detail.viewInAnalysis')}
          </button>
          {serviceUnavailable && (
            <p className="muted" style={{ fontSize: 12 }}>
              {t('review.detail.waitingService')}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Submitting / polling progress
  if (
    analysisLoading ||
    (analysisTask &&
      analysisTask.status !== "SUCCESS" &&
      analysisTask.status !== "FAILED")
  ) {
    return (
      <div className="panel rd-ai-panel">
        <div className="rd-ai-progress">
          <span className="rd-spinner" />
          <span>
            {!analysisTask && t('analysis.status.submitting')}
            {analysisTask?.status === "PENDING" && t('analysis.status.queuing')}
            {analysisTask?.status === "RUNNING" && t('analysis.status.analyzing')}
          </span>
          {analysisTask && (
            <span className="rd-ai-provider-hint muted">
              {analysisTask.provider} · {analysisTask.model}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Failed state
  if (analysisTask?.status === "FAILED") {
    return (
      <div className="panel rd-ai-panel">
        <div className="rd-ai-failed">
          <p className="rd-ai-error-msg">
            {analysisTask.errorMessage || t('analysis.status.failedRetry')}
          </p>
          <button
            type="button"
            className="ghost-button"
            onClick={() => handleAnalysisReset()}
          >
            {t('actions.retry')}
          </button>
        </div>
      </div>
    );
  }

  // Success state
  if (analysisTask?.status === "SUCCESS") {
    return (
      <div className="panel rd-ai-panel">
        <div className="rd-ai-result-area">
          <div className="rd-ai-meta">
            <span className="rd-ai-provider-badge">
              {analysisTask.provider}
            </span>
            <span className="muted">·</span>
            <span className="muted">{analysisTask.model}</span>
            <span className="muted">·</span>
            <span className="muted">{formatDate(analysisTask.updatedAt)}</span>
            <button
              type="button"
              className="ghost-button rd-ai-regen-btn"
              disabled={analysisLoading}
              onClick={() => void handleGenerateAnalysis()}
            >
              {t('review.detail.regenerate')}
            </button>
          </div>
          <div className="rd-ai-result">
            <SimpleMarkdown text={analysisTask.resultText} />
          </div>
        </div>
      </div>
    );
  }

  return null;
});
