import { memo, useCallback } from "react";
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();

  if (!problem) {
    return null;
  }

  const tags = getProblemTags(problem);
  const verdict = getVerdict(problem);
  const tone = verdictTone(verdict);
  const attempts = problem.attemptCount ?? problem.attempts ?? 0;

  return (
    <section className="ai-problem-summary" aria-label={t('analysis.problem.summaryLabel')}>
      <div className="ai-summary-top">
        <div className="ai-summary-heading">
          <span className={`ai-platform-chip ai-platform-chip--${(problem.platform || "other").toLowerCase()}`}>
            {problem.platform || "UNKNOWN"}
          </span>
          <div>
            <h4 className="ai-summary-title">{problem.title || t('analysis.problem.untitled')}</h4>
            <p className="ai-summary-meta">{problem.externalProblemId || t('analysis.problem.unsyncedId')}</p>
          </div>
        </div>
        <span className={`ai-verdict-chip ai-verdict-chip--${tone}`}>{verdict}</span>
      </div>

      <div className="ai-summary-grid">
        <div className="ai-summary-cell">
          <span className="ai-summary-label">{t('analysis.problem.attempts')}</span>
          <strong className="ai-summary-value">{attempts || "—"}</strong>
        </div>
        <div className="ai-summary-cell">
          <span className="ai-summary-label">{t('common.difficulty')}</span>
          <strong className="ai-summary-value">{problem.difficulty || t('analysis.problem.unrecorded')}</strong>
        </div>
      </div>

      {tags.length > 0 && (
        <div className="ai-summary-tags" aria-label={t('common.tags')}>
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
  const { t } = useTranslation();

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
        <h3 className="an-panel-title">{t('analysis.problem.title')}</h3>
        <p className="an-panel-subtitle">{t('analysis.problem.subtitle')}</p>
      </div>

      <section className="an-field ai-picker-section">
        <label className="an-label" id="ap-problem-picker-label">{t('analysis.problem.selectLabel')}</label>
        <ProblemSearchSelector
          value={selectedProblemId}
          onChange={handleSelectChange}
          problems={problems}
          labelledBy="ap-problem-picker-label"
        />
      </section>

      <ProblemSummary problem={selectedProblem} />

      <section className="an-result-area ai-analysis-list" aria-label={t('analysis.problem.resultLabel')}>
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
              <h4>{selectedProblemId ? t('analysis.problem.waitingGenerate') : t('analysis.problem.selectFirst')}</h4>
              <p>{selectedProblemId ? t('analysis.problem.waitingHint') : t('analysis.problem.selectHint')}</p>
            </div>
          </div>
        )}
      </section>

      <footer className="ai-analysis-actions">
        <div className="ai-task-status" aria-live="polite">
          <span className={`ai-status-dot ai-status-dot--${taskStatus.toLowerCase()}`} />
          <span>{t('analysis.problem.statusPrefix')}{taskStatus === "READY" ? t('analysis.problem.statusReady') : taskStatus === "IDLE" ? t('analysis.problem.statusIdle') : taskStatus}</span>
        </div>
        <button
          type="button"
          className="primary-button an-generate-btn"
          disabled={isLoading || !selectedProblemId}
          onClick={handleGenerate}
        >
          {isLoading ? (
            <><span className="an-spinner" /> {t('analysis.problem.parsing')}</>
          ) : (
            t('analysis.problem.startAnalysis')
          )}
        </button>
      </footer>
    </div>
  );
});
