import React, { useEffect, useRef, useState } from "react";
import { useNavigation } from "../lib/NavigationContext.jsx";
import { getAnalysisErrorMessage } from "../lib/runtimeStatus.js";
import { useAnalysisTaskWithPoll } from "../hooks/useAnalysisTask.js";
import { Toast } from "../components/Analysis/Toast.jsx";
import { AiHero } from "../components/Analysis/AiHero.jsx";
import { DiagnosisReport } from "../components/Analysis/DiagnosisReport.jsx";
import { ProblemAnalysis } from "../components/Analysis/ProblemAnalysis.jsx";
import { RecommendedProblems } from "../components/Analysis/RecommendedProblems.jsx";
import { AnalysisColumn } from "../components/Analysis/AnalysisColumn.jsx";
import { api } from "../lib/api.js";
import "../styles/ui-analysis.css";

/**
 * AnalysisPage 主容器组件 (Design v2)
 * 使用 SWR 管理分析任务状态，采用分栏卡片布局
 */
export function AnalysisPage({ serviceStatus, runtimeInfo }) {
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

  // Ref for problem submit flag
  const problemSubmitRef = useRef(false);

  // 使用 SWR 轮询 hooks
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
  useEffect(() => {
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
    } catch (err) {
      problemSubmitRef.current = false;
      setProblemError(getAnalysisErrorMessage(err.message));
    }
  }

  // Cleanup task IDs after completion
  useEffect(() => {
    if (globalTask?.status === "SUCCESS" || globalTask?.status === "FAILED") {
      const timer = setTimeout(() => setGlobalTaskId(null), 15000);
      return () => clearTimeout(timer);
    }
  }, [globalTask?.status]);

  useEffect(() => {
    if (compTask?.status === "SUCCESS" || compTask?.status === "FAILED") {
      const timer = setTimeout(() => setCompTaskId(null), 15000);
      return () => clearTimeout(timer);
    }
  }, [compTask?.status]);

  useEffect(() => {
    if (problemTask?.status === "SUCCESS" || problemTask?.status === "FAILED") {
      problemSubmitRef.current = false;
      const timer = setTimeout(() => setProblemTaskId(null), 15000);
      return () => clearTimeout(timer);
    }
  }, [problemTask?.status]);

  return (
    <div className="an-container page-content ai-page">
      {/* Header */}
      <header className="an-header">
        <button
          type="button"
          className="an-back-btn"
          onClick={() => navigateTo("dashboard")}
          title="返回仪表盘"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>仪表盘</span>
        </button>
        <h2 className="an-title">AI 分析洞察</h2>
      </header>

      {/* Main content grid */}
      <div className="an-main ai-layout">
        <AnalysisColumn side="left">
          <AiHero
            period={period}
            setPeriod={setPeriod}
            globalTask={globalTask}
            globalLoading={globalLoading}
            onGenerateGlobal={handleGenerateGlobalAnalysis}
          />

          <DiagnosisReport
            title="本周诊断结论"
            priority="high"
            priorityLabel="优先处理"
            type="diagnosis"
            globalTask={globalTask}
          />

          <DiagnosisReport
            title="下周训练建议"
            priority="mid"
            priorityLabel="建议执行"
            type="suggestions"
            globalTask={globalTask}
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

          <RecommendedProblems globalTask={globalTask} />
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
