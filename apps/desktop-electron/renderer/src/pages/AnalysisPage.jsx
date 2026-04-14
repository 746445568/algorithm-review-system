import { useRef, useState } from "react";
import { useNavigation } from "../lib/NavigationContext.jsx";
import { getAnalysisErrorMessage } from "../lib/runtimeStatus.js";
import { useAnalysisTaskWithPoll } from "../hooks/useAnalysisTask.js";
import { Toast } from "../components/Analysis/Toast.jsx";
import { GlobalAnalysis } from "../components/Analysis/GlobalAnalysis.jsx";
import { ProblemAnalysis } from "../components/Analysis/ProblemAnalysis.jsx";
import { AnalysisColumn } from "../components/Analysis/AnalysisColumn.jsx";
import { api } from "../lib/api.js";

/**
 * AnalysisPage 主容器组件
 * 使用 SWR 管理分析任务状态
 */
export function AnalysisPage() {
  const { navigateTo, navigationState } = useNavigation();

  // Global report state
  const [period, setPeriod] = useState("week");
  const [globalTaskId, setGlobalTaskId] = useState(null);
  const [globalError, setGlobalError] = useState(null);

  // Comparison state
  const [compTaskId, setCompTaskId] = useState(null);
  const [compError, setCompError] = useState(null);

  // Single problem state
  const [selectedProblemId, setSelectedProblemId] = useState(null);
  const [problemTaskId, setProblemTaskId] = useState(null);
  const [problemError, setProblemError] = useState(null);
  const [problems, setProblems] = useState([]);

  // Toast state
  const [toast, setToast] = useState(null);

  // Ref for problem submit flag (must be defined before hook calls)
  const problemSubmitRef = useRef(false);

  // 使用 SWR 轮询 hooks - 只在 taskId 存在时开始轮询
  const {
    task: globalTask,
    isLoading: globalLoading,
  } = useAnalysisTaskWithPoll(globalTaskId);

  const {
    task: compTask,
    isLoading: compLoading,
  } = useAnalysisTaskWithPoll(compTaskId);

  const {
    task: problemTask,
    isLoading: problemLoading,
  } = useAnalysisTaskWithPoll(problemTaskId);

  // Load problems for selector
  useEffect(() => {
    api.getProblems({}).then(setProblems).catch(console.error);
  }, []);

  // Auto-trigger single problem analysis from navigation state
  React.useEffect(() => {
    if (navigationState?.problemId) {
      setSelectedProblemId(navigationState.problemId);
      handleGenerateProblemAnalysis(navigationState.problemId);
    }
  }, [navigationState?.problemId]);

  // ── Global Analysis ──
  async function handleGenerateGlobalAnalysis() {
    if (globalLoading || globalTaskId) return;
    setGlobalError(null);
    try {
      const { task } = await api.generateAnalysis({ period });
      setGlobalTaskId(task.id);
      if (task.status === "SUCCESS" || task.status === "FAILED") {
        // 任务已完成，清理 taskId
        setTimeout(() => setGlobalTaskId(null), 5000);
      }
    } catch (err) {
      setGlobalError(getAnalysisErrorMessage(err.message));
    }
  }

  // ── Comparison Analysis ──
  async function handleGenerateComparison() {
    if (compLoading || compTaskId) return;
    setCompError(null);
    try {
      const { task } = await api.generateComparisonAnalysis({ period });
      setCompTaskId(task.id);
      if (task.status === "SUCCESS" || task.status === "FAILED") {
        setTimeout(() => setCompTaskId(null), 5000);
      }
    } catch (err) {
      setCompError(getAnalysisErrorMessage(err.message));
    }
  }

  // ── Problem Analysis ──
  async function handleGenerateProblemAnalysis(problemId) {
    if (problemLoading || problemSubmitRef.current || !problemId || problemTaskId) return;
    problemSubmitRef.current = true;
    setProblemError(null);
    try {
      const { task } = await api.generateProblemAnalysis(problemId, {});
      setProblemTaskId(task.id);
      if (task.status === "SUCCESS" || task.status === "FAILED") {
        problemSubmitRef.current = false;
        setTimeout(() => setProblemTaskId(null), 5000);
      }
    } catch (err) {
      problemSubmitRef.current = false;
      setProblemError(getAnalysisErrorMessage(err.message));
    }
  }

  // Cleanup task IDs after completion
  React.useEffect(() => {
    if (globalTask?.status === "SUCCESS" || globalTask?.status === "FAILED") {
      const timer = setTimeout(() => setGlobalTaskId(null), 10000);
      return () => clearTimeout(timer);
    }
  }, [globalTask?.status]);

  React.useEffect(() => {
    if (compTask?.status === "SUCCESS" || compTask?.status === "FAILED") {
      const timer = setTimeout(() => setCompTaskId(null), 10000);
      return () => clearTimeout(timer);
    }
  }, [compTask?.status]);

  React.useEffect(() => {
    if (problemTask?.status === "SUCCESS" || problemTask?.status === "FAILED") {
      problemSubmitRef.current = false;
      const timer = setTimeout(() => setProblemTaskId(null), 10000);
      return () => clearTimeout(timer);
    }
  }, [problemTask?.status]);

  return (
    <div className="an-container">
      {/* Header */}
      <div className="an-header">
        <button
          type="button"
          className="an-back-btn"
          onClick={() => navigateTo("dashboard")}
          title="返回仪表盘"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          返回
        </button>
        <h2 className="an-title">AI 分析</h2>
      </div>

      {/* Main content - two columns */}
      <div className="an-main">
        <AnalysisColumn side="left">
          <GlobalAnalysis
            period={period}
            setPeriod={setPeriod}
            globalTask={globalTask}
            globalLoading={globalLoading}
            globalError={globalError}
            onGenerateGlobal={handleGenerateGlobalAnalysis}
            compTask={compTask}
            compLoading={compLoading}
            compError={compError}
            onGenerateComparison={handleGenerateComparison}
          />
        </AnalysisColumn>

        <AnalysisColumn side="right">
          <ProblemAnalysis
            selectedProblemId={selectedProblemId}
            setSelectedProblemId={setSelectedProblemId}
            problems={problems}
            problemTask={problemTask}
            problemLoading={problemLoading}
            problemError={problemError}
            onGenerateProblem={handleGenerateProblemAnalysis}
          />
        </AnalysisColumn>
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
