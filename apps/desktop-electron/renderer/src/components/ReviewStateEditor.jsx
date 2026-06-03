import { memo, useCallback } from "react";
import { useTranslation } from 'react-i18next';
import { AppDateTimePicker, AppSelect } from "./AppControls.jsx";
import { formatDate, statusLabel } from "../lib/format.js";

export const ReviewStateEditor = memo(function ReviewStateEditor({
  reviewState,
  reviewSaving,
  reviewNotice,
  reviewStateSupported,
  reviewStateSupportMessage,
  serviceUnavailable,
  selectedProblem,
  onChange,
  onSave,
}) {
  const { t } = useTranslation();

  const reviewStatusOptions = [
    { value: "TODO", label: t('statusLabels.TODO') },
    { value: "REVIEWING", label: t('statusLabels.REVIEWING') },
    { value: "SCHEDULED", label: t('statusLabels.SCHEDULED') },
    { value: "DONE", label: t('statusLabels.DONE') },
  ];

  const handleStatusChange = useCallback((value) => {
    onChange({ status: value });
  }, [onChange]);

  const handleNextReviewAtChange = useCallback((value) => {
    onChange({ nextReviewAt: value });
  }, [onChange]);

  const handleNotesChange = useCallback((event) => {
    onChange({ notes: event.target.value });
  }, [onChange]);

  const handleSaveClick = useCallback(() => {
    void onSave();
  }, [onSave]);

  return (
    <div className="panel review-editor-panel">
      <div className="panel-header">
        <h3>{t('review.detail.status')}</h3>
        <span className="caption">{t('reviewEditor.caption')}</span>
      </div>
      {selectedProblem ? (
        <div className="form-stack">
          {!reviewStateSupported ? <p className="error-text">{reviewStateSupportMessage}</p> : null}
          <label>
            <span>{t('reviewEditor.statusLabel')}</span>
            <AppSelect
              value={reviewState.status}
              options={reviewStatusOptions}
              disabled={!reviewStateSupported}
              onChange={handleStatusChange}
            />
          </label>

          <label>
            <span>{t('reviewEditor.nextReviewTime')}</span>
            <AppDateTimePicker
              value={reviewState.nextReviewAt}
              disabled={!reviewStateSupported}
              onChange={handleNextReviewAtChange}
            />
          </label>

          <label>
            <span>{t('reviewEditor.notes')}</span>
            <textarea
              rows="8"
              value={reviewState.notes}
              disabled={!reviewStateSupported}
              placeholder={t('reviewEditor.notesPlaceholder')}
              onChange={handleNotesChange}
            />
          </label>

          <div className="editor-toolbar">
            <span className="meta-pill review-state-pill">
              {statusLabel(reviewState.status)}
              <span>{reviewState.lastUpdatedAt ? formatDate(reviewState.lastUpdatedAt) : t('reviewEditor.notSaved')}</span>
            </span>
            <button
              type="button"
              className="primary-button"
              disabled={reviewSaving || serviceUnavailable || !reviewStateSupported}
              onClick={handleSaveClick}
            >
              {reviewSaving ? t('review.detail.saving') : t('reviewEditor.saveReviewState')}
            </button>
          </div>

          {reviewNotice ? <p className="success-text">{reviewNotice}</p> : null}
        </div>
      ) : (
        <p className="muted">{t('reviewEditor.selectFirst')}</p>
      )}
    </div>
  );
});
