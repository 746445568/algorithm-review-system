import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { formatDate, platformLabel, verdictTone } from "../lib/format.js";

function SkeletonCard() {
  return (
    <div className="rl-card rl-card--skeleton">
      <div className="skeleton-line skeleton-line--wide" />
      <div className="skeleton-line skeleton-line--narrow" />
    </div>
  );
}

export const ReviewList = memo(function ReviewList({
  problems,
  selectedProblemId,
  onSelect,
  filters,
  onFiltersChange,
  loading,
  error,
  onRefresh,
  serviceUnavailable,
  dueCount,
  doneCount,
  totalCount,
}) {
  const { t } = useTranslation();
  const progress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  const setFilter = useCallback((key, value) => {
    onFiltersChange((prev) => ({ ...prev, [key]: value }));
  }, [onFiltersChange]);

  const handleRefresh = useCallback(() => {
    void onRefresh();
  }, [onRefresh]);

  const handleSearchChange = useCallback((e) => {
    setFilter("search", e.target.value);
  }, [setFilter]);

  return (
    <section className="panel rl-panel">
      <div className="rl-header">
        <div>
          <h3 className="rl-title">{t("review.list.title")}</h3>
          <p className="rl-subtitle">
            {t("review.list.pendingSummary", { count: problems.length })} ·{" "}
            <span className="rl-due-badge">
              {t("review.list.dueSummary", { count: dueCount })}
            </span>
          </p>
        </div>
        <button
          type="button"
          className="rl-refresh-btn"
          onClick={handleRefresh}
          disabled={serviceUnavailable}
          title={t("actions.refresh")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
      </div>

      <div className="rl-filters">
        <div className="rl-search-wrap">
          <svg className="rl-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className="rl-search"
            value={filters.search}
            placeholder={t("review.list.searchPlaceholder")}
            onChange={handleSearchChange}
          />
        </div>
      </div>

      {serviceUnavailable && <p className="rl-state-msg">{t("review.list.waitingService")}</p>}
      {error && <p className="rl-state-msg rl-state-error">{error}</p>}

      <div className="rl-list">
        {loading ? (
          Array.from({ length: 5 }, (_, i) => <SkeletonCard key={i} />)
        ) : problems.length === 0 ? (
          <div className="rl-empty">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            <p>{t("review.list.empty")}</p>
          </div>
        ) : (
          problems.map((item, idx) => (
            <ProblemCard
              key={item.problemId}
              item={item}
              active={item.problemId === selectedProblemId}
              index={idx}
              onSelect={onSelect}
              t={t}
            />
          ))
        )}
      </div>

      <div className="rl-kb-hint">
        <kbd>J</kbd><kbd>K</kbd> {t("review.list.keyboard.navigation")}
        <span className="rl-kb-sep">·</span>
        <kbd>1–4</kbd> {t("review.list.keyboard.status")}
        <span className="rl-kb-sep">·</span>
        <kbd>⌘S</kbd> {t("actions.save")}
      </div>
    </section>
  );
});

const ProblemCard = memo(function ProblemCard({ item, active, index, onSelect, t }) {
  const verdictClass = verdictTone(item.latestVerdict) === "good"
    ? "rl-chip-good"
    : verdictTone(item.latestVerdict) === "bad"
      ? "rl-chip-bad"
      : "rl-chip-neutral";

  const handleKeyDown = (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelect(item.problemId);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={[
        "rl-card",
        active ? "rl-card--active" : "",
        item.reviewDue ? "rl-card--due" : "",
      ].filter(Boolean).join(" ")}
      onClick={() => onSelect(item.problemId)}
      onKeyDown={handleKeyDown}
      style={{ animationDelay: `${Math.min(index * 18, 180)}ms` }}
    >
      <div className="rl-card-body">
        <div className="rl-card-main">
          <span className="rl-card-platform">{platformLabel(item.platform)}</span>
          <strong className="rl-card-title">{item.title}</strong>
        </div>
        <span className={`rl-chip ${verdictClass}`}>{item.latestVerdict || "—"}</span>
      </div>
      <div className="rl-card-meta">
        <span className="rl-card-id">
          {platformLabel(item.platform)} {item.externalProblemId}
        </span>
        <span className="rl-card-attempts">
          {t("review.list.attempts", { count: item.attemptCount })}
        </span>
        <span className={`rl-card-schedule ${item.reviewDue ? "rl-card-schedule--due" : ""}`}>
          {item.reviewDue
            ? t("review.list.due")
            : item.nextReviewAt
              ? formatDate(item.nextReviewAt)
              : t("review.list.unscheduled")}
        </span>
      </div>
    </div>
  );
});
