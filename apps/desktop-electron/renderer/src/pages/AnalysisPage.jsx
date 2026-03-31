import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { formatDate } from "../lib/format.js";

export function AnalysisPage({ serviceStatus, runtimeInfo }) {
  const serviceUnavailable = serviceStatus.state !== "healthy";
  const [period, setPeriod] = useState("week");
  const [globalTask, setGlobalTask] = useState(null);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [globalError, setGlobalError] = useState(null);
  const [compTask, setCompTask] = useState(null);
  const [compLoading, setCompLoading] = useState(false);
  const [compError, setCompError] = useState(null);
  const [selectedProblemId, setSelectedProblemId] = useState(null);
  const [problemTask, setProblemTask] = useState(null);
  const [problemLoading, setProblemLoading] = useState(false);
  const [problemError, setProblemError] = useState(null);
  const [problems, setProblems] = useState([]);
  const globalPollRef = useRef(null);
  const compPollRef = useRef(null);
  const problemPollRef = useRef(null);

  useEffect(() => {
    api.getProblems({ limit: 100 }).then(setProblems).catch(() => setProblems([]));
  }, []);

  useEffect(() => {
    return () => {
      clearTimeout(globalPollRef.current);
      clearTimeout(compPollRef.current);
      clearTimeout(problemPollRef.current);
    };
  }, []);

  function schedulePoll(pollRef, taskId, setTask, setLoading, setError) {
    clearTimeout(pollRef.current);
    pollRef.current = setTimeout(async () => {
      try {
        const task = await api.getAnalysisTask(taskId);
        setTask(task);
        if (task.status !== "SUCCESS" && task.status !== "FAILED") {
          schedulePoll(pollRef, taskId, setTask, setLoading, setError);
        } else {
          setLoading(false);
        }
      } catch (err) {
        setLoading(false);
        setError(err.message);
      }
    }, 2000);
  }

  async function handleGenerateGlobal() {
    if (globalLoading) return;
    setGlobalLoading(true);
    setGlobalTask(null);
    setGlobalError(null);
    try {
      const { task } = await api.generateAnalysis({ period });
      setGlobalTask(task);
      if (task.status !== "SUCCESS" && task.status !== "FAILED") {
        schedulePoll(globalPollRef, task.id, setGlobalTask, setGlobalLoading, setGlobalError);
      } else {
        setGlobalLoading(false);
      }
    } catch (err) {
      setGlobalLoading(false);
      setGlobalError(err.message);
    }
  }

  async function handleGenerateComparison() {
    if (compLoading) return;
    setCompLoading(true);
    setCompTask(null);
    setCompError(null);
    try {
      const { task } = await api.generateComparisonAnalysis({ period });
      setCompTask(task);
      if (task.status !== "SUCCESS" && task.status !== "FAILED") {
        schedulePoll(compPollRef, task.id, setCompTask, setCompLoading, setCompError);
      } else {
        setCompLoading(false);
      }
    } catch (err) {
      setCompLoading(false);
      setCompError(err.message);
    }
  }

  async function handleGenerateProblem() {
    if (!selectedProblemId || problemLoading) return;
    setProblemLoading(true);
    setProblemTask(null);
    setProblemError(null);
    try {
      const task = await api.generateProblemAnalysis(selectedProblemId);
      setProblemTask(task);
      if (task.status !== "SUCCESS" && task.status !== "FAILED") {
        schedulePoll(problemPollRef, task.id, setProblemTask, setProblemLoading, setProblemError);
      } else {
        setProblemLoading(false);
      }
    } catch (err) {
      setProblemLoading(false);
      setProblemError(err.message);
    }
  }

  return (
    <div className="an-page">
      <div className="an-container" style={{ display: "flex", gap: "24px" }}>
        <section className="an-left" style={{ flex: 1 }}>
          <h3>人力监完</h3>
          <div style={{ marginBottom: "12px" }}>
            <button onClick={() => setPeriod("week")}>{period === "week" ? "P‛”说“”" : "箬管"}</button>
            <button onClick={() => setPeriod("month")} style={{ marginLeft: "8px" }}>{period === "month" ? "P‛”人“”" : "人兌"}</button>
          </div>
          <button className="primary-button" disabled={globalLoading || serviceUnavailable} onClick={handleGenerateGlobal}>
            {globalLoading ? "疇件…" : "人力皐完"}
          </button>
          {globalError && <p style={{ color: "red" }}>{globalError}</p>}
          {globalTask?.status === "SUCCESS" && (
            <div style={{ marginTop: "16px" }}>
              <pre style={{ whiteSpace: "pre-wrap" }}>{globalTask.resultText}</pre>
            </div>
          )}
          <hr style={{ margin: "24px 0" }} />
          <h4>工理工理</h4>
          <button className="ghost-button" disabled={compLoading || serviceUnavailable} onClick={handleGenerateComparison}>
            {compLoading ? "疇件…" : "疇任夆擆"}
          </button>
          {compError && <p style={{ color: "red" }}>{compError}</p>}
          {compTask?.status === "SUCCESS" && (
            <div style={{ marginTop: "16px" }}>
              <pre style={{ whiteSpace: "pre-wrap" }}>{compTask.resultText}</pre>
            </div>
          )}
        </section>
        <section className="an-right" style={{ flex: 1 }}>
          <h3>箬管检侌</h3>
          <select value={selectedProblemId || ""} onChange={(e) => setSelectedProblemId(e.target.value ? Number(e.target.value) : null)} style={{ marginBottom: "12px", width: "100%" }}>
            <option value="">顈理主网</option>
            {problems.map((p) => (<option key={p.problemId} value={p.problemId}>{p.title || `箬管 ${p.problemId}}</option>))}
          </select>
          <button className="primary-button" disabled={!selectedProblemId || problemLoading || serviceUnavailable} onClick={handleGenerateProblem}>
            {problemLoading ? "疇件₆" : "人力理工琅"}
          </button>
          {problemError && <p style={{ color: "red" }}>{problemError}</p>}
          {problemTask?.status === "SUCCESS" && (
            <div style={{ marginTop: "16px" }}>
              <pre style={{ whiteSpace: "pre-wrap" }}>{problemTask.resultText}</pre>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
