import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { useNavigation } from "../lib/NavigationContext.jsx";
import { formatDate } from "../lib/format.js";

// ─── Minimal Markdown renderer (zero deps) ───────────────────────────────────

function renderInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i} className="md-code">{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

function SimpleMarkdown({ text }) {
  if (!text) return <p className="md-p-placeholder">暂无内容</p>;

  const lines = text.split("\n");
  const elements = [];
  let listItems = [];

  function flushList() {
    if (listItems.length > 0) {
      elements.push(<ul key={`ul-${elements.length}`} className="md-ul">{listItems}</ul>);
      listItems = [];
    }
  }

  lines.forEach((line, i) => {
    if (line.startsWith("## ")) {
      flushList();
      elements.push(<h4 key={i} className="md-h2">{line.slice(3)}</h4>);
    } else if (line.startsWith("# ")) {
      flushList();
      elements.push(<h3 key={i} className="md-h1">{line.slice(2)}</h3>);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      listItems.push(<li key={i}>{renderInline(line.slice(2))}</li>);
    } else if (line.trim() === "") {
      flushList();
      elements.push(<div key={i} className="md-gap" />);
    } else {
      flushList();
      elements.push(<p key={i} className="md-p">{renderInline(line)}</p>);
    }
  });
  flushList();

  return <div className="md-body">{elements}</div>;
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, isError, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2000);
    return () => clearTimeout(t);
  }, [onDone]);
  return <div className={`ap-toast ${isError ? "ap-toast--error" : ""}`}>{message}</div>;
}

// ─── Problem Search Selectors ────────────────────────────────────────────────

function ProblemSearchSelector({ value, onChange, problems }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredProblems = problems.filter((p) =>
    p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.externalProblemId?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedProblem = problems.find((p) => p.problemId === value);

  return (
    <div className="ap-problem-selector" ref={wrapperRef}>
      <div
        className="ap-selector-trigger"
        onClick={() => setIsOpen(!isOpen)}
      >
        {selectedProblem ? (
          <span className="ap-selected-label">
            <span className="ap-platform-badge">{selectedProblem.platform}</span>
            {selectedProblem.title}
          </span>
        ) : (
          <span className="ap-placeholder">选择题目...</span>
        )}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {isOpen && (
        <div className="ap-dropdown">
          <input
            type="text"
            className="ap-search-input"
            placeholder="搜索题目..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            autoFocus
          />
          <div className="ap-dropdown-list">
            {filteredProblems.length === 0 ? (
              <div className="ap-dropdown-empty">未找到题目</div>
            ) : (
              filteredProblems.map((problem) => (
                <div
                  key={problem.problemId}
                  className={`ap-dropdown-item${problem.problemId === value ? " ap-dropdown-item--selected" : ""}`}
                  onClick={() => {
                    onChange(problem.problemId);
                    setIsOpen(false);
                    setSearchTerm("");
                  }}
                >
                  <span className="ap-platform-badge">{problem.platform}</span>
                  <span className="ap-dropdown-title">{problem.title}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AnalysisPage ─────────────────────────────────────────────────────────────

export function AnalysisPage() {
  const { navigateTo, navigationState } = useNavigation();

  // Global report state
  const [period, setPeriod] = useState("week");
  const [globalTask, setGlobalTask] = useState(null);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [globalError, setGlobalError] = useState(null);

  // Comparison state
  const [compTask, setCompTask] = useState(null);
  const [compLoading, setCompLoading] = useState(false);
  const [compError, setCompError] = useState(null);

  // Single problem state
  const [selectedProblemId, setSelectedProblemId] = useState(null);
  const [problemTask, setProblemTask] = useState(null);
  const [problemLoading, setProblemLoading] = useState(false);
  const [problemError, setProblemError] = useState(null);
  const [problems, setProblems] = useState([]);

  // Poll refs
  const globalPollRef = useRef(null);
  const compPollRef = useRef(null);
  const problemPollRef = useRef(null);

  // Toast state
  const [toast, setToast] = useState(null);

  // Load problems for selector
  useEffect(() => {
    api.getProblems({}).then(setProblems).catch(console.error);
  }, []);

  // Auto-trigger single problem analysis from navigation state
  useEffect(() => {
    if (navigationState?.problemId) {
      setSelectedProblemId(navigationState.problemId);
      handleGenerateProblemAnalysis(navigationState.problemId);
    }
  }, [navigationState?.problemId]);

  // Cleanup polls on unmount
  useEffect(() => () => {
    stopGlobalPoll();
    stopCompPoll();
    stopProblemPoll();
  }, []);

  // ── Global Analysis Polling ──
  function stopGlobalPoll() {
    if (globalPollRef.current) {
      clearTimeout(globalPollRef.current);
      globalPollRef.current = null;
    }
  }

  function scheduleGlobalPoll(taskId) {
    stopGlobalPoll();
    globalPollRef.current = setTimeout(async () => {
      try {
        const task = await api.getAnalysisTask(taskId);
        setGlobalTask(task);
        if (task.status !== "SUCCESS" && task.status !== "FAILED") {
          scheduleGlobalPoll(taskId);
        } else {
          setGlobalLoading(false);
        }
      } catch (err) {
        setGlobalLoading(false);
        setGlobalError(err.message);
      }
    }, 2000);
  }

  async function handleGenerateGlobalAnalysis() {
    if (globalLoading) return;
    stopGlobalPoll();
    setGlobalLoading(true);
    setGlobalTask(null);
    setGlobalError(null);
    try {
      const { task } = await api.generateAnalysis({ period });
      setGlobalTask(task);
      if (task.status === "SUCCESS" || task.status === "FAILED") {
        setGlobalLoading(false);
      } else {
        scheduleGlobalPoll(task.id);
      }
    } catch (err) {
      setGlobalLoading(false);
      setGlobalError(err.message);
    }
  }

  // ── Comparison Analysis Polling ──
  function stopCompPoll() {
    if (compPollRef.current) {
      clearTimeout(compPollRef.current);
      compPollRef.current = null;
    }
  }

  function scheduleCompPoll(taskId) {
    stopCompPoll();
    compPollRef.current = setTimeout(async () => {
      try {
        const task = await api.getAnalysisTask(taskId);
        setCompTask(task);
        if (task.status !== "SUCCESS" && task.status !== "FAILED") {
          scheduleCompPoll(taskId);
        } else {
          setCompLoading(false);
        }
      } catch (err) {
        setCompLoading(false);
        setCompError(err.message);
      }
    }, 2000);
  }

  async function handleGenerateComparison() {
    if (compLoading) return;
    stopCompPoll();
    setCompLoading(true);
    setCompTask(null);
    setCompError(null);
    try {
      const { task } = await api.generateComparisonAnalysis({ period });
      setCompTask(task);
      if (task.status === "SUCCESS" || task.status === "FAILED") {
        setCompLoading(false);
      } else {
        scheduleCompPoll(task.id);
      }
    } catch (err) {
      setCompLoading(false);
      setCompError(err.message);
    }
  }

  // ── Problem Analysis Polling ──
  function stopProblemPoll() {
    if (problemPollRef.current) {
      clearTimeout(problemPollRef.current);
      problemPollRef.current = null;
    }
  }

  function scheduleProblemPoll(taskId) {
    stopProblemPoll();
    problemPollRef.current = setTimeout(async () => {
      try {
        const task = await api.getAnalysisTask(taskId);
        setProblemTask(task);
        if (task.status !== "SUCCESS" && task.status !== "FAILED") {
          scheduleProblemPoll(taskId);
        } else {
          setProblemLoading(false);
        }
      } catch (err) {
        setProblemLoading(false);
        setProblemError(err.message);
      }
    }, 2000);
  }

  function handleGenerateProblemAnalysis(problemId) {
    if (problemLoading || !problemId) return;
    stopProblemPoll();
    setProblemLoading(true);
    setProblemTask(null);
    setProblemError(null);
    try {
      api.generateProblemAnalysis(problemId, {}).then(({ task }) => {
        setProblemTask(task);
        if (task.status === "SUCCESS" || task.status === "FAILED") {
          setProblemLoading(false);
        } else {
          scheduleProblemPoll(task.id);
        }
      }).catch((err) => {
        setProblemLoading(false);
        setProblemError(err.message);
      });
    } catch (err) {
      setProblemLoading(false);
      setProblemError(err.message);
    }
  }

  return (
    <div className="ap-container">
      {/* Header */}
      <div className="ap-header">
        <button
          type="button"
          className="ap-back-btn"
          onClick={() => navigateTo("dashboard")}
          title="返回仪表盘"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          返回
        </button>
        <h2 className="ap-title">AI 分析</h2>
      </div>

      {/* Main content - two columns */}
      <div className="ap-main">
        {/* Left column - Global Report */}
        <div className="ap-column ap-column--left">
          <div className="ap-panel">
            <h3 className="ap-panel-title">全局报告</h3>

            {/* Period toggle */}
            <div className="ap-period-toggle">
              <button
                type="button"
                className={`ap-period-btn${period === "week" ? " ap-period-btn--active" : ""}`}
                onClick={() => setPeriod("week")}
              >
                本周
              </button>
              <button
                type="button"
                className={`ap-period-btn${period === "month" ? " ap-period-btn--active" : ""}`}
                onClick={() => setPeriod("month")}
              >
                本月
              </button>
            </div>

            {/* Generate button */}
            <button
              type="button"
              className="primary-button ap-generate-btn"
              disabled={globalLoading}
              onClick={handleGenerateGlobalAnalysis}
            >
              {globalLoading ? (
                <><span className="ap-spinner" /> 生成中…</>
              ) : (
                "生成报告"
              )}
            </button>

            {/* Global analysis result */}
            {globalError && (
              <div className="ap-error-msg">
                {globalError.includes("provider and model are required")
                  ? "请先在设置页面配置 AI 服务（提供商 + 模型 + API Key）"
                  : `生成失败：${globalError}`}
              </div>
            )}

            {(globalLoading || (globalTask && globalTask.status !== "SUCCESS" && globalTask.status !== "FAILED")) && (
              <div className="ap-progress">
                <span className="ap-spinner" />
                <span>
                  {!globalTask && "正在提交…"}
                  {globalTask?.status === "PENDING" && "排队等待中…"}
                  {globalTask?.status === "RUNNING" && "AI 分析中，请稍候…"}
                </span>
              </div>
            )}

            {globalTask?.status === "FAILED" && (
              <div className="ap-failed">
                <p className="ap-error-msg">{globalTask.errorMessage || "分析任务失败，请重试"}</p>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => { setGlobalTask(null); setGlobalError(null); }}
                >
                  重试
                </button>
              </div>
            )}

            {globalTask?.status === "SUCCESS" && (
              <div className="ap-result">
                <div className="ap-result-meta">
                  <span className="ap-provider-badge">{globalTask.provider}</span>
                  <span className="muted">·</span>
                  <span className="muted">{globalTask.model}</span>
                  <span className="muted">·</span>
                  <span className="muted">{formatDate(globalTask.updatedAt)}</span>
                </div>
                <div className="ap-result-body">
                  <SimpleMarkdown text={globalTask.resultText} />
                </div>
              </div>
            )}

            {/* Comparison section */}
            <div className="ap-comp-section">
              <h4 className="ap-comp-title">环比分析</h4>
              <button
                type="button"
                className="ghost-button ap-comp-btn"
                disabled={compLoading}
                onClick={handleGenerateComparison}
              >
                {compLoading ? (
                  <><span className="ap-spinner" /> 生成中…</>
                ) : (
                  "生成环比"
                )}
              </button>

              {compError && (
                <div className="ap-error-msg ap-error-msg--small">
                  {compError.includes("provider and model are required")
                    ? "请先配置 AI 服务"
                    : `生成失败：${compError}`}
                </div>
              )}

              {(compLoading || (compTask && compTask.status !== "SUCCESS" && compTask.status !== "FAILED")) && (
                <div className="ap-progress ap-progress--small">
                  <span className="ap-spinner" />
                  <span>
                    {!compTask && "正在提交…"}
                    {compTask?.status === "PENDING" && "排队等待中…"}
                    {compTask?.status === "RUNNING" && "AI 分析中…"}
                  </span>
                </div>
              )}

              {compTask?.status === "FAILED" && (
                <div className="ap-failed ap-failed--small">
                  <p className="ap-error-msg">{compTask.errorMessage || "分析失败"}</p>
                </div>
              )}

              {compTask?.status === "SUCCESS" && (
                <div className="ap-result ap-result--compact">
                  <div className="ap-result-meta">
                    <span className="ap-provider-badge">{compTask.provider}</span>
                    <span className="muted">·</span>
                    <span className="muted">{formatDate(compTask.updatedAt)}</span>
                  </div>
                  <div className="ap-result-body">
                    <SimpleMarkdown text={compTask.resultText} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right column - Single Problem Analysis */}
        <div className="ap-column ap-column--right">
          <div className="ap-panel">
            <h3 className="ap-panel-title">单题分析</h3>

            {/* Problem selector */}
            <div className="ap-field">
              <label className="ap-label" htmlFor="ap-problem-select">选择题目</label>
              <ProblemSearchSelector
                value={selectedProblemId}
                onChange={setSelectedProblemId}
                problems={problems}
              />
            </div>

            {/* Generate button */}
            <button
              type="button"
              className="primary-button ap-generate-btn"
              disabled={problemLoading || !selectedProblemId}
              onClick={() => handleGenerateProblemAnalysis(selectedProblemId)}
            >
              {problemLoading ? (
                <><span className="ap-spinner" /> 生成中…</>
              ) : (
                "生成分析"
              )}
            </button>

            {/* Problem analysis result */}
            {problemError && (
              <div className="ap-error-msg">
                {problemError.includes("provider and model are required")
                  ? "请先在设置页面配置 AI 服务（提供商 + 模型 + API Key）"
                  : `生成失败：${problemError}`}
              </div>
            )}

            {(problemLoading || (problemTask && problemTask.status !== "SUCCESS" && problemTask.status !== "FAILED")) && (
              <div className="ap-progress">
                <span className="ap-spinner" />
                <span>
                  {!problemTask && "正在提交…"}
                  {problemTask?.status === "PENDING" && "排队等待中…"}
                  {problemTask?.status === "RUNNING" && "AI 分析中，请稍候…"}
                </span>
              </div>
            )}

            {problemTask?.status === "FAILED" && (
              <div className="ap-failed">
                <p className="ap-error-msg">{problemTask.errorMessage || "分析任务失败，请重试"}</p>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => { setProblemTask(null); setProblemError(null); }}
                >
                  重试
                </button>
              </div>
            )}

            {problemTask?.status === "SUCCESS" && (
              <div className="ap-result">
                <div className="ap-result-meta">
                  <span className="ap-provider-badge">{problemTask.provider}</span>
                  <span className="muted">·</span>
                  <span className="muted">{problemTask.model}</span>
                  <span className="muted">·</span>
                  <span className="muted">{formatDate(problemTask.updatedAt)}</span>
                </div>
                <div className="ap-result-body">
                  <SimpleMarkdown text={problemTask.resultText} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          isError={toast.isError}
          onDone={() => setToast(null)}
        />
      )}
    </div>
  );
}
