import React from "react";
import { useTranslation } from "react-i18next";
import { AppDateTimePicker } from "../../AppControls.jsx";
import { formatDate } from "../../../lib/format.js";

const NOTE_HEADINGS = {
  cause: "错误原因",
  idea: "正确思路",
  trick: "关键性质 / 套路",
  remind: "下次提醒",
};

function parseStructuredNotes(notes) {
  const text = notes || "";
  const sections = { cause: "", idea: "", trick: "", remind: "" };
  const headingPattern = /(?:^|\n)##\s*(错误原因|正确思路|关键性质\s*\/\s*套路|下次提醒)\s*\n/g;
  const matches = [...text.matchAll(headingPattern)];

  if (matches.length === 0) {
    sections.cause = text.trim();
    return sections;
  }

  matches.forEach((match, index) => {
    const rawHeading = match[1].replace(/\s+/g, "");
    const key = Object.entries(NOTE_HEADINGS).find(([, label]) =>
      label.replace(/\s+/g, "") === rawHeading,
    )?.[0];
    if (!key) return;
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    sections[key] = text.slice(start, end).trim();
  });

  return sections;
}

function composeStructuredNotes(sections) {
  return Object.keys(NOTE_HEADINGS)
    .map((key) => {
      const value = sections[key]?.trim();
      return value ? `## ${NOTE_HEADINGS[key]}\n${value}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function buildAiCards(selectedProblem, selectedTags, t) {
  const verdict = selectedProblem?.latestVerdict || "WA";
  const tags = selectedTags?.length ? selectedTags : [t("review.detail.aiCards.defaultTag"), t("review.detail.aiCards.boundaryTag")];

  return [
    [t("review.detail.aiCards.errorType"), [t("review.detail.aiCards.implementation"), verdict === "TLE" ? t("review.detail.aiCards.complexity") : t("review.detail.aiCards.boundaryRisk")]],
    [t("review.detail.aiCards.keyGap"), [t("review.detail.aiCards.tagGap", { tag: tags[0] }), t("review.detail.aiCards.noCounterexample")]],
    [t("review.detail.aiCards.entryPoint"), [t("review.detail.aiCards.tagRecall", { tag: tags[0] }), t("review.detail.aiCards.propertyFirst")]],
    [t("review.detail.aiCards.similar"), ["CF 126B", "CF 271D"]],
  ];
}

export const StateTab = React.memo(function StateTab({
  reviewState,
  setReviewState,
  srsInfo,
  reviewStateSupported,
  reviewSaving,
  serviceUnavailable,
  rating,
  supportMessage,
  selectedProblem,
  selectedTags,
  handleRate,
  saveReviewState,
}) {
  const { t } = useTranslation();
  const statusOptions = [
    { value: "TODO", label: t("review.todo") },
    { value: "REVIEWING", label: t("review.reviewing") },
    { value: "SCHEDULED", label: t("review.scheduled") },
    { value: "DONE", label: t("review.done") },
  ];
  const rateOptions = [1, 2, 3, 4, 5].map((quality) => ({
    quality,
    label: t(`review.detail.rate.${quality}`),
  }));
  const noteFields = ["cause", "idea", "trick", "remind"].map((key) => ({
    key,
    label: t(`review.detail.notes.${key}.label`),
    placeholder: t(`review.detail.notes.${key}.placeholder`),
  }));
  const structuredNotes = parseStructuredNotes(reviewState.notes);
  const aiCards = buildAiCards(selectedProblem, selectedTags, t);

  function updateNoteField(key, value) {
    const next = { ...structuredNotes, [key]: value };
    setReviewState((s) => ({ ...s, notes: composeStructuredNotes(next) }));
  }

  return (
    <div className="rd-state-workspace">
      {!reviewStateSupported && (
        <p className="rd-support-msg">{supportMessage}</p>
      )}

      <div className="rd-status-strip">
        <span className="rd-label">{t("review.detail.status")}</span>
        <div className="rd-status-btns">
          {statusOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`rd-status-btn${reviewState.status === opt.value ? " rd-status-btn--active" : ""}`}
              disabled={!reviewStateSupported}
              onClick={() =>
                setReviewState((s) => ({ ...s, status: opt.value }))
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="panel rd-structured-panel">
        <div className="rd-panel-head">
          <h3>{t("review.detail.structuredReview")}</h3>
          <span>{t("review.detail.structuredCaption")}</span>
        </div>
        <div className="rd-notes-grid">
          {noteFields.map((field) => (
            <label key={field.key} className="rd-note-box">
              <span>{field.label}</span>
              <textarea
                value={structuredNotes[field.key]}
                disabled={!reviewStateSupported}
                placeholder={field.placeholder}
                onChange={(e) => updateNoteField(field.key, e.target.value)}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="panel rd-ai-assist-panel">
        <div className="rd-panel-head">
          <h3>{t("review.detail.aiAssist")}</h3>
          <button type="button" className="rd-soft-btn" disabled={serviceUnavailable}>
            {t("review.detail.generateAnalysis")}
          </button>
        </div>
        <div className="rd-ai-card-grid">
          {aiCards.map(([title, items]) => (
            <article key={title} className="rd-ai-small-card">
              <h4>{title}</h4>
              <ul>
                {items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>

      <div className="rd-next-review-row">
        <label className="rd-next-review-field">
          <span>{t("review.detail.nextReviewManual")}</span>
          <AppDateTimePicker
            value={reviewState.nextReviewAt}
            disabled={!reviewStateSupported}
            onChange={(value) =>
              setReviewState((s) => ({ ...s, nextReviewAt: value }))
            }
          />
        </label>
        {srsInfo.intervalDays > 0 && (
          <p className="rd-srs-hint">
            {t("review.detail.srsHint", {
              interval: srsInfo.intervalDays,
              repetitions: srsInfo.repetitionCount,
              ease: srsInfo.easeFactor.toFixed(2),
            })}
          </p>
        )}
      </div>

      <div className="rd-bottom-bar">
        <span className="rd-label">{t("review.detail.sm2Rating")}</span>
        <div className="rd-rate-btns">
          {rateOptions.map((opt) => (
            <button
              key={opt.quality}
              type="button"
              className="rd-rate-btn"
              disabled={!reviewStateSupported || rating || serviceUnavailable}
              onClick={() => handleRate(opt.quality)}
              title={t("review.detail.shortcut", { key: opt.quality })}
            >
              <span className="rd-rate-num">{opt.quality}</span>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
        <div className="rd-save-actions">
          <span className="rd-last-saved">
            {reviewState.lastUpdatedAt
              ? t("review.detail.lastSaved", { date: formatDate(reviewState.lastUpdatedAt) })
              : t("review.detail.noteLength", { count: reviewState.notes.length })}
          </span>
          <button
            type="button"
            className="primary-button rd-save-btn"
            disabled={reviewSaving || serviceUnavailable || !reviewStateSupported}
            onClick={() => void saveReviewState()}
          >
            {reviewSaving ? (
              <>
                <span className="rd-spinner" /> {t("review.detail.saving")}
              </>
            ) : (
              t("review.detail.saveAndSchedule")
            )}
          </button>
        </div>
      </div>
    </div>
  );
});
