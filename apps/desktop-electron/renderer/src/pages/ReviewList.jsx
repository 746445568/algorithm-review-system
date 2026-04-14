import { memo, useCallback } from "react";
import { formatDate, platformLabel, statusLabel, verdictTone } from "../lib/format.js";

function SkeletonCard() {
  return (
    <div className="rl-card rl-card--skeleton">
      <div className="skeleton-line skeleton-line--wide" />
      <div className="skeleton-line skeleton-line--narrow" />
    </div>
  );
}

const STATUS_CHIP_CLASS = {
  TODO: "rl-chip-neutral",
  REVIEWING: "rl-chip-warn",
  SCHEDULED: "rl-chip-blue",
  DONE: "rl-chip-good",
};

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

  const handleReviewStatusChange = useCallback((e) => {
    setFilter("reviewStatus", e.target.value);
  }, [setFilter]);

  const handlePlatformChange = useCallback((e) => {
    setFilter("platform", e.target.value);
  }, [setFilter]);

  const handleSortByChange = useCallback((e) => {
    setFilter("sortBy", e.target.value);
  }, [setFilter]);

  const handleOnlyUnsolvedChange = useCallback((e) => {
    setFilter("onlyUnsolved", e.target.checked);
  }, [setFilter]);

  return (
    <section className="panel rl-panel">
      <div className="rl-header">
        <div>
          <h3 className="rl-title">复习队列</h3>
          <p className="rl-subtitle">{problems.length} 道题目</p>
        </div>
        <button
          type="button"
          className="rl-refresh-btn"
          onClick={handleRefresh}
          disabled={serviceUnavailable}
          title="刷新"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
      </div>

      <div className="rl-progress-track">
        <div className="rl-progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <p className="rl-progress-label">
        {doneCount}/{totalCount} 已完成
        {dueCount > 0 && <span className="rl-due-badge"> · {dueCount} 到期</span>}
      </p>

      <div className="rl-filters">
        <div className="rl-search-wrap">
          <svg className="rl-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className="rl-search"
            value={filters.search}
            placeholder="搜索题目…"
            onChange={handleSearchChange}
          />
        </div>

        <div className="rl-selects">
          <select className="rl-select" value={filters.reviewStatus} onChange={handleReviewStatusChange}>
            <option value="">全部状态</option>
            <option value="TODO">待复习</option>
            <option value="REVIEWING">复习中</option>
            <option value="SCHEDULED">已排期</option>
            <option value="DONE">已完成</option>
          </select>
          <select className="rl-select" value={filters.platform} onChange={handlePlatformChange}>
            <option value="">全部平台</option>
            <option value="CODEFORCES">CF</option>
            <option value="ATCODER">AC</option>
          </select>
          <select className="rl-select" value={filters.sortBy} onChange={handleSortByChange}>
            <option value="lastSubmitted">最近提交</option>
            <option value="nextReview">复习时间</option>
          </select>
        </div>

        <label className="rl-checkbox">
          <input
            type="checkbox"
            checked={filters.onlyUnsolved}
            onChange={handleOnlyUnsolvedChange}
          />
          <span>仅显示未通过</span>
        </label>
      </div>

      {serviceUnavailable && <p className="rl-state-msg">等待服务就绪…</p>}
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
            <p>没有符合条件的题目</p>
          </div>
        ) : (
          problems.map((item, idx) => (
            <ProblemCard
              key={item.problemId}
              item={item}
              active={item.problemId === selectedProblemId}
              index={idx}
              onSelect={onSelect}
            />
          ))
        )}
      </div>

      <div className="rl-kb-hint">
        <kbd>J</kbd><kbd>K</kbd> 导航
        <span className="rl-kb-sep">·</span>
        <kbd>1–4</kbd> 状态
        <span className="rl-kb-sep">·</span>
        <kbd>⌘S</kbd> 保存
      </div>
    </section>
  );
});

const ProblemCard = memo(function ProblemCard({ item, active, index, onSelect }) {
  const statusKey = (item.reviewStatus || "TODO").toUpperCase();
  const chipClass = STATUS_CHIP_CLASS[statusKey] || "rl-chip-neutral";
  const verdictClass = verdictTone(item.latestVerdict) === "good"
    ? "rl-chip-good"
    : verdictTone(item.latestVerdict) === "bad"
      ? "rl-chip-bad"
      : "rl-chip-neutral";

  return (
    <button
      type="button"
      className={[
        "rl-card",
        active ? "rl-card--active" : "",
        item.reviewDue ? "rl-card--due" : "",
      ].filter(Boolean).join(" ")}
      onClick={() => onSelect(item.problemId)}
      style={{ animationDelay: `${Math.min(index * 18, 180)}ms` }}
    >
      <div className="rl-card-body">
        <span className="rl-card-platform">{platformLabel(item.platform)}</span>
        <strong className="rl-card-title">{item.title}</strong>
        <span className="rl-card-id">{item.externalProblemId}</span>
        <span className={`rl-card-schedule ${item.reviewDue ? "rl-card-schedule--due" : ""}`}>
          {item.reviewDue
            ? "● 已到期"
            : item.nextReviewAt
              ? `↻ ${formatDate(item.nextReviewAt)}`
              : "无排期"}
        </span>
      </div>
      <div className="rl-card-meta">
        <span className={`rl-chip ${verdictClass}`}>{item.latestVerdict || "—"}</span>
        <span className={`rl-chip ${chipClass}`}>{statusLabel(item.reviewStatus)}</span>
        <span className="rl-card-attempts">{item.attemptCount}次</span>
      </div>
    </button>
  );
});
