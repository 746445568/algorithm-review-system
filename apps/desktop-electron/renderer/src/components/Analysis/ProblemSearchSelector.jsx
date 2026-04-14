import { useRef, useState, useCallback, useEffect } from "react";

/**
 * 题目搜索选择器组件
 * @param {{ value: string|null, onChange: Function, problems: Array }} props
 */
export const ProblemSearchSelector = Object.freeze(function ProblemSearchSelector({
  value,
  onChange,
  problems
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);

  const handleClickOutside = useCallback((event) => {
    if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [handleClickOutside]);

  const filteredProblems = problems.filter((p) =>
    p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.externalProblemId?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedProblem = problems.find((p) => p.id === value);

  const handleSelect = useCallback((problemId) => {
    onChange(problemId);
    setIsOpen(false);
    setSearchTerm("");
  }, [onChange]);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const handleSearchChange = useCallback((e) => {
    setSearchTerm(e.target.value);
  }, []);

  return (
    <div className="an-problem-selector" ref={wrapperRef}>
      <div
        className="an-selector-trigger"
        onClick={handleToggle}
      >
        {selectedProblem ? (
          <span className="an-selected-label">
            <span className="an-platform-badge">{selectedProblem.platform}</span>
            {selectedProblem.title}
          </span>
        ) : (
          <span className="an-placeholder">选择题目...</span>
        )}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {isOpen && (
        <div className="an-dropdown">
          <input
            type="text"
            className="an-search-input"
            placeholder="搜索题目..."
            value={searchTerm}
            onChange={handleSearchChange}
            autoFocus
          />
          <div className="an-dropdown-list">
            {filteredProblems.length === 0 ? (
              <div className="an-dropdown-empty">未找到题目</div>
            ) : (
              filteredProblems.map((problem) => (
                <div
                  key={problem.id}
                  className={`an-dropdown-item${problem.id === value ? " an-dropdown-item--selected" : ""}`}
                  onClick={() => handleSelect(problem.id)}
                >
                  <span className="an-platform-badge">{problem.platform}</span>
                  <span className="an-dropdown-title">{problem.title}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
});
