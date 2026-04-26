import { useRef, useState, useCallback, useEffect, useMemo } from "react";

function getProblemExternalId(problem) {
  if (!problem) return "";
  return problem.externalProblemId || "未同步题号";
}

function getProblemSearchText(problem) {
  return [
    problem?.title,
    problem?.externalProblemId,
    problem?.platform,
    ...(Array.isArray(problem?.tags) ? problem.tags : []),
  ].filter(Boolean).join(" ").toLowerCase();
}

function platformClass(platform) {
  return (platform || "other").toLowerCase();
}

function verdictTone(verdict) {
  switch ((verdict || "").toUpperCase()) {
    case "AC":
      return "good";
    case "WA":
    case "RE":
    case "TLE":
    case "MLE":
    case "CE":
      return "bad";
    default:
      return "neutral";
  }
}

/**
 * 题目搜索选择器组件
 * @param {{ value: string|null, onChange: Function, problems: Array, labelledBy?: string }} props
 */
export const ProblemSearchSelector = Object.freeze(function ProblemSearchSelector({
  value,
  onChange,
  problems = [],
  labelledBy
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapperRef = useRef(null);
  const triggerRef = useRef(null);
  const listboxId = "ap-problem-picker-list";

  const handleClickOutside = useCallback((event) => {
    if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [handleClickOutside]);

  const filteredProblems = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return problems;
    return problems.filter((problem) => getProblemSearchText(problem).includes(needle));
  }, [problems, searchTerm]);

  const selectedProblem = problems.find((problem) => String(problem.id) === String(value));

  useEffect(() => {
    if (!isOpen) return;
    const selectedIndex = filteredProblems.findIndex((problem) => String(problem.id) === String(value));
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [filteredProblems, isOpen, value]);

  const handleSelect = useCallback((problemId) => {
    onChange(problemId);
    setIsOpen(false);
    setSearchTerm("");
    triggerRef.current?.focus();
  }, [onChange]);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const handleSearchChange = useCallback((e) => {
    setSearchTerm(e.target.value);
  }, []);

  const handleKeyDown = useCallback((event) => {
    if (event.key === "Escape") {
      setIsOpen(false);
      triggerRef.current?.focus();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        return;
      }
      setActiveIndex((index) => Math.min(index + 1, Math.max(filteredProblems.length - 1, 0)));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        return;
      }
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }

    if (event.key === "Enter" && isOpen) {
      event.preventDefault();
      const activeProblem = filteredProblems[activeIndex];
      if (activeProblem) {
        handleSelect(activeProblem.id);
      }
    }
  }, [activeIndex, filteredProblems, handleSelect, isOpen]);

  return (
    <div className={`an-problem-selector problem-picker${isOpen ? " open" : ""}`} ref={wrapperRef} onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        className="an-selector-trigger problem-picker-btn"
        onClick={handleToggle}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-labelledby={labelledBy}
      >
        {selectedProblem ? (
          <span className="an-selected-label problem-picker-main">
            <span className={`an-platform-badge ai-platform-chip ai-platform-chip--${platformClass(selectedProblem.platform)}`}>
              {selectedProblem.platform}
            </span>
            <span className="problem-picker-copy">
              <span className="problem-picker-title">{selectedProblem.title || "未命名题目"}</span>
              <span className="problem-picker-eid">{selectedProblem.externalProblemId || "未同步题号"}</span>
            </span>
          </span>
        ) : (
          <span className="an-placeholder">选择题目...</span>
        )}
        <svg className="problem-picker-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <div className="an-dropdown problem-picker-menu">
          <input
            type="text"
            className="an-search-input"
            placeholder="搜索题名 / 题号 / 平台"
            value={searchTerm}
            onChange={handleSearchChange}
            aria-label="搜索题目"
            autoFocus
          />
          <div className="an-dropdown-list" id={listboxId} role="listbox" aria-labelledby={labelledBy}>
            {filteredProblems.length === 0 ? (
              <div className="an-dropdown-empty">未找到题目</div>
            ) : (
              filteredProblems.map((problem, index) => {
                const selected = String(problem.id) === String(value);
                const verdict = problem.latestVerdict || problem.verdict;

                return (
                  <button
                    type="button"
                    key={problem.id}
                    className={`an-dropdown-item problem-option${selected ? " an-dropdown-item--selected active" : ""}${index === activeIndex ? " is-active" : ""}`}
                    onClick={() => handleSelect(problem.id)}
                    role="option"
                    aria-selected={selected}
                  >
                    <span className={`an-platform-badge ai-platform-chip ai-platform-chip--${platformClass(problem.platform)}`}>
                      {problem.platform || "UNKNOWN"}
                    </span>
                    <span className="an-dropdown-title problem-option-name">
                      <span>{problem.title || "未命名题目"}</span>
                      <span>{getProblemExternalId(problem)}</span>
                    </span>
                    {verdict && (
                      <span className={`ai-verdict-chip ai-verdict-chip--${verdictTone(verdict)}`}>{verdict}</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
});
