import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { toDatetimeLocalValue } from "../lib/format.js";
import { useNavigation } from "../lib/NavigationContext.jsx";
import { useReviewFlow } from "../hooks/useReviewFlow.js";
import { ReviewHeader } from "../components/ReviewDetail/ReviewHeader.jsx";
import { ReviewNav } from "../components/ReviewDetail/ReviewNav.jsx";
import { ReviewTabs } from "../components/ReviewDetail/ReviewTabs.jsx";
import { StateTab } from "../components/ReviewDetail/tabs/StateTab.jsx";
import { SubmissionsTab } from "../components/ReviewDetail/tabs/SubmissionsTab.jsx";
import { RawTab } from "../components/ReviewDetail/tabs/RawTab.jsx";
import { AnalysisTab } from "../components/ReviewDetail/tabs/AnalysisTab.jsx";
import { Toast } from "../components/ReviewDetail/Toast.jsx";

function isMissingReviewStateRoute(error) {
  return /\b404\b/.test(error?.message || "");
}

function buildSupportMessage(serviceUrl) {
  return `ojreviewd (${serviceUrl}) 版本过旧，不支持复习状态读写。请从 apps/server 重新构建。`;
}

export function ReviewDetail({
  selectedProblem,
  selectedProblemRecord,
  selectedSubmissions,
  selectedTags,
  serviceStatus,
  runtimeInfo,
  filteredProblems,
  onSelect,
  onReviewSaved,
}) {
  const [reviewState, setReviewState] = useState({
    status: "TODO",
    notes: "",
    nextReviewAt: "",
    lastUpdatedAt: "",
  });
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewStateSupported, setReviewStateSupported] = useState(true);
  const [supportMessage, setSupportMessage] = useState("");
  const [toast, setToast] = useState(null);
  const [activeTab, setActiveTab] = useState("state");
  const [srsInfo, setSrsInfo] = useState({
    easeFactor: 2.5,
    intervalDays: 0,
    repetitionCount: 0,
  });
  const [rating, setRating] = useState(false);
  const { navigateTo } = useNavigation();
  const [analysisTask, setAnalysisTask] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);

  const seqRef = useRef(0);
  const autoAdvRef = useRef(null);
  const analysisPollRef = useRef(null);

  const selectedProblemId = selectedProblem?.problemId ?? null;
  const serviceUnavailable = serviceStatus.state !== "healthy";
  const serviceUrl = runtimeInfo.serviceUrl || serviceStatus.url || "";

  // Load review state when problem changes
  useEffect(() => {
    const reqId = ++seqRef.current;

    if (!selectedProblemId || serviceUnavailable) {
      setReviewState({
        status: "TODO",
        notes: "",
        nextReviewAt: "",
        lastUpdatedAt: "",
      });
      setReviewStateSupported(true);
      setSupportMessage("");
      return;
    }

    api
      .getReviewState(selectedProblemId)
      .then((state) => {
        if (reqId !== seqRef.current) return;
        setReviewState({
          status: state.status || "TODO",
          notes: state.notes || "",
          nextReviewAt: toDatetimeLocalValue(state.nextReviewAt),
          lastUpdatedAt: state.lastUpdatedAt || "",
        });
        setSrsInfo({
          easeFactor: state.easeFactor ?? 2.5,
          intervalDays: state.intervalDays ?? 0,
          repetitionCount: state.repetitionCount ?? 0,
        });
        setReviewStateSupported(true);
        setSupportMessage("");
      })
      .catch((err) => {
        if (reqId !== seqRef.current) return;
        if (isMissingReviewStateRoute(err)) {
          setReviewStateSupported(false);
          setSupportMessage(buildSupportMessage(serviceUrl));
        }
      });
  }, [selectedProblemId, serviceUnavailable, serviceUrl]);

  const saveReviewState = useCallback(async () => {
    if (!selectedProblemId || !reviewStateSupported || reviewSaving) return;

    setReviewSaving(true);
    try {
      const saved = await api.saveReviewState(selectedProblemId, {
        status: reviewState.status,
        notes: reviewState.notes,
        nextReviewAt: reviewState.nextReviewAt
          ? new Date(reviewState.nextReviewAt).toISOString()
          : null,
      });
      setReviewState({
        status: saved.status || "TODO",
        notes: saved.notes || "",
        nextReviewAt: toDatetimeLocalValue(saved.nextReviewAt),
        lastUpdatedAt: saved.lastUpdatedAt || "",
      });
      setReviewStateSupported(true);
      setSupportMessage("");
      onReviewSaved(saved);
      setToast({ message: "已保存", isError: false });

      if (saved.status === "DONE" || saved.status === "SCHEDULED") {
        const idx = filteredProblems.findIndex(
          (p) => p.problemId === selectedProblemId,
        );
        if (idx < filteredProblems.length - 1) {
          clearTimeout(autoAdvRef.current);
          autoAdvRef.current = setTimeout(() => {
            onSelect(filteredProblems[idx + 1].problemId);
          }, 1200);
        }
      }
    } catch (err) {
      if (isMissingReviewStateRoute(err)) {
        setReviewStateSupported(false);
        setSupportMessage(buildSupportMessage(serviceUrl));
      } else {
        setToast({ message: `保存失败：${err.message}`, isError: true });
      }
    } finally {
      setReviewSaving(false);
    }
  }, [
    selectedProblemId,
    reviewStateSupported,
    reviewSaving,
    reviewState,
    onReviewSaved,
    filteredProblems,
    onSelect,
    serviceUrl,
  ]);

  useEffect(
    () => () => {
      clearTimeout(autoAdvRef.current);
      clearTimeout(analysisPollRef.current);
    },
    [],
  );

  const handleRate = useCallback(
    async (quality) => {
      if (!selectedProblemId || !reviewStateSupported || rating) return;
      setRating(true);
      try {
        const result = await api.rateReview(selectedProblemId, quality);
        setSrsInfo({
          easeFactor: result.easeFactor ?? 2.5,
          intervalDays: result.intervalDays ?? 0,
          repetitionCount: result.repetitionCount ?? 0,
        });
        setReviewState((s) => ({
          ...s,
          status: result.status || "SCHEDULED",
          nextReviewAt: toDatetimeLocalValue(result.nextReviewAt),
          lastUpdatedAt: result.lastUpdatedAt || s.lastUpdatedAt,
        }));
        onReviewSaved(result);
        const days = result.intervalDays ?? 0;
        setToast({ message: `已评分，下次复习：${days} 天后`, isError: false });
        const idx = filteredProblems.findIndex(
          (p) => p.problemId === selectedProblemId,
        );
        if (idx < filteredProblems.length - 1) {
          clearTimeout(autoAdvRef.current);
          autoAdvRef.current = setTimeout(() => {
            onSelect(filteredProblems[idx + 1].problemId);
          }, 1200);
        }
      } catch (err) {
        setToast({ message: `评分失败：${err.message}`, isError: true });
      } finally {
        setRating(false);
      }
    },
    [
      selectedProblemId,
      reviewStateSupported,
      rating,
      onReviewSaved,
      filteredProblems,
      onSelect,
    ],
  );

  useEffect(() => {
    if (!reviewStateSupported || serviceUnavailable) return;
    const keyMap = { q: 1, w: 2, e: 3, r: 5 };
    const onKey = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")
        return;
      if (activeTab !== "state") return;
      const quality = keyMap[e.key.toLowerCase()];
      if (quality) handleRate(quality);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reviewStateSupported, serviceUnavailable, activeTab, handleRate]);

  const { currentIndex, total, hasNext, hasPrev, goNext, goPrev } =
    useReviewFlow({
      problems: filteredProblems,
      selectedId: selectedProblemId,
      onSelect,
      onSave: saveReviewState,
      onStatusChange: (status) => setReviewState((s) => ({ ...s, status })),
    });

  // ── AI Analysis ──
  function stopAnalysisPoll() {
    if (analysisPollRef.current) {
      clearTimeout(analysisPollRef.current);
      analysisPollRef.current = null;
    }
  }

  function scheduleAnalysisPoll(taskId) {
    stopAnalysisPoll();
    analysisPollRef.current = setTimeout(async () => {
      try {
        const task = await api.getAnalysisTask(taskId);
        setAnalysisTask(task);
        if (task.status !== "SUCCESS" && task.status !== "FAILED") {
          scheduleAnalysisPoll(taskId);
        } else {
          setAnalysisLoading(false);
        }
      } catch (err) {
        setAnalysisLoading(false);
        setAnalysisError(err.message);
      }
    }, 2000);
  }

  async function handleGenerateAnalysis() {
    if (analysisLoading || !selectedProblemId) return;
    stopAnalysisPoll();
    setAnalysisLoading(true);
    setAnalysisTask(null);
    setAnalysisError(null);
    try {
      const { task } = await api.generateProblemAnalysis(selectedProblemId, {});
      setAnalysisTask(task);
      if (task.status === "SUCCESS" || task.status === "FAILED") {
        setAnalysisLoading(false);
      } else {
        scheduleAnalysisPoll(task.id);
      }
    } catch (err) {
      setAnalysisLoading(false);
      setAnalysisError(err.message);
    }
  }

  function handleAnalysisReset() {
    setAnalysisTask(null);
    setAnalysisError(null);
  }

  // ── Empty state ──
  if (!selectedProblem) {
    return (
      <div className="rd-empty-state">
        <svg
          width="36"
          height="36"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
        <p>从左侧选择一道题目</p>
        <span className="rd-empty-hint">J / K 快速导航</span>
      </div>
    );
  }

  const hasSubmissions = selectedSubmissions.length > 0;
  const representativeSubmission = selectedSubmissions[0];

  return (
    <div className="rd-container">
      {/* Nav bar */}
      <ReviewNav
        currentIndex={currentIndex}
        total={total}
        hasNext={hasNext}
        hasPrev={hasPrev}
        goNext={goNext}
        goPrev={goPrev}
      />

      {/* Animated content on problem change */}
      <div key={selectedProblemId} className="rd-content">
        {/* Problem header */}
        <ReviewHeader
          selectedProblem={selectedProblem}
          selectedProblemRecord={selectedProblemRecord}
          selectedTags={selectedTags}
        />

        {/* Tabs */}
        <ReviewTabs
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          hasSubmissions={hasSubmissions}
          submissionsCount={selectedSubmissions.length}
        />

        {/* Tab: Review State */}
        {activeTab === "state" && (
          <StateTab
            reviewState={reviewState}
            setReviewState={setReviewState}
            srsInfo={srsInfo}
            reviewStateSupported={reviewStateSupported}
            reviewSaving={reviewSaving}
            serviceUnavailable={serviceUnavailable}
            rating={rating}
            supportMessage={supportMessage}
            handleRate={handleRate}
            saveReviewState={saveReviewState}
          />
        )}

        {/* Tab: Submissions */}
        {activeTab === "submissions" && (
          <SubmissionsTab
            hasSubmissions={hasSubmissions}
            selectedSubmissions={selectedSubmissions}
          />
        )}

        {/* Tab: Raw Data */}
        {activeTab === "raw" && (
          <RawTab
            hasSubmissions={hasSubmissions}
            representativeSubmission={representativeSubmission}
          />
        )}

        {/* Tab: AI Analysis */}
        {activeTab === "analysis" && (
          <AnalysisTab
            analysisTask={analysisTask}
            analysisLoading={analysisLoading}
            analysisError={analysisError}
            serviceUnavailable={serviceUnavailable}
            selectedProblemId={selectedProblemId}
            handleGenerateAnalysis={handleGenerateAnalysis}
            handleAnalysisReset={handleAnalysisReset}
            navigateTo={navigateTo}
          />
        )}
      </div>

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
