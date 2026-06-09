import { memo, useMemo } from "react";
import { useTranslation } from 'react-i18next';
import { formatDate, parseTags, platformLabel, statusLabel } from "../lib/format.js";
import { desktopBridge } from "../lib/desktopBridge.js";

export const ProblemDetailPanel = memo(function ProblemDetailPanel({ selectedProblem, selectedProblemRecord }) {
  const { t } = useTranslation();

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
            {selectedProblem.contestId ? ` / ${t('problemDetail.contest')} ${selectedProblem.contestId}` : ""}
          </p>

          <div className="detail-metrics">
            <article>
              <span>{t('analysis.problem.attempts')}</span>
              <strong>{selectedProblem.attemptCount}</strong>
            </article>
            <article>
              <span>{t('problemDetail.reviewStatus')}</span>
              <strong>{statusLabel(selectedProblem.reviewStatus)}</strong>
            </article>
            <article>
              <span>{t('review.nextReview')}</span>
              <strong>{selectedProblem.nextReviewAt ? formatDate(selectedProblem.nextReviewAt) : t('problemDetail.notSet')}</strong>
            </article>
            <article>
              <span>{t('problemDetail.solveStatus')}</span>
              <strong>{selectedProblem.solvedLater ? t('problemDetail.recovered') : t('problemDetail.stillFailed')}</strong>
            </article>
          </div>

          <div className="tag-row">
            {selectedTags.length === 0 ? (
              <span className="muted">{t('problemDetail.noTags')}</span>
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
              {t('problemDetail.openPage')}
            </button>
          ) : null}
        </>
      ) : (
        <p className="muted">{t('problemDetail.selectHint')}</p>
      )}
    </div>
  );
});
