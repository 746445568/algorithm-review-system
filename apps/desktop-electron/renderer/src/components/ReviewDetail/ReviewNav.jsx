import React from "react";

export const ReviewNav = React.memo(function ReviewNav({
  currentIndex,
  total,
  hasNext,
  hasPrev,
  goNext,
  goPrev,
}) {
  return (
    <div className="rd-nav-bar">
      <span className="rd-nav-pos">
        {currentIndex + 1} / {total}
      </span>
      <div className="rd-nav-btns">
        <button
          type="button"
          className="rd-nav-btn"
          disabled={!hasPrev}
          onClick={goPrev}
          title="上一题 (K)"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <button
          type="button"
          className="rd-nav-btn"
          disabled={!hasNext}
          onClick={goNext}
          title="下一题 (J)"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  );
});
