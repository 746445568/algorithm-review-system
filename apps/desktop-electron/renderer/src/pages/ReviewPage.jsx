import { useCallback, useEffect, useRef, useState } from "react";
import { ReviewFilterBar } from "../components/ReviewFilterBar.jsx";
import { ReviewStateEditor } from "../components/ReviewStateEditor.jsx";
import { ProblemDetailPanel } from "../components/ProblemDetailPanel.jsx";
import { useReviewFilters } from "../hooks/useReviewFilters.js";
import { api } from "../lib/api.js";
import { formatDate, platformLabel, statusLabel, toDatetimeLocalValue, verdictTone } from "../lib/format.js";

function formatRawJSON(rawJson) {
  try {
    return JSON.stringify(JSON.parse(rawJson), null, 2);
  } catch {
    return rawJson;
  }
}

function isMissingReviewStateRoute(error) {
  return /\b404\b/.test(error?.message || "");
}

function buildReviewStateRouteMessage(serviceUrl) {
  return `当前运行的 ojreviewd (${serviceUrl}) 版本过旧，不支持复习状态读写。请从 apps/server 源码重新构建。`;
}

function buildReviewStats(problemSummaries = []) {
  const counts = { TODO: 0, REVIEWING: 0, SCHEDULED: 0, DONE: 0 };
  let dueReviewCount = 0;
  let scheduledReviewCount = 0;
  const now = Date.now();

  for (const item of problemSummaries) {
    const status = (item.reviewStatus || "TODO").toUpperCase();
    if (counts[status] !== undefined) counts[status] += 1;
    if (item.nextReviewAt) {
      scheduledReviewCount += 1;
      const nextReviewTime = new Date(item.nextReviewAt).getTime();
      if (!Number.isNaN(nextReviewTime) && nextReviewTime <= now) dueReviewCount += 1;
    }
  }

  return { counts, dueReviewCount, scheduledReviewCount };
}

function applyReviewState(summary, problemId, savedState) {
  if (!summary?.problemSummaries?.length) return summary;

  const nextProblemSummaries = summary.problemSummaries.map((item) => {
    if (item.problemId !== problemId) return item;
    const nextReviewAt = savedState.nextReviewAt || null;
    const nextReviewTime = nextReviewAt ? new Date(nextReviewAt).getTime() : Number.NaN;

    return {
      ...item,
      reviewStatus: savedState.status || "TODO",
      nextReviewAt,
      lastReviewUpdatedAt: savedState.lastUpdatedAt || null,
      reviewDue: !Number.isNaN(nextReviewTime) && nextReviewTime <= Date.now(),
    };
  });

  const stats = buildReviewStats(nextProblemSummaries);
  return {
    ...summary,
    problemSummaries: nextProblemSummaries,
    reviewStatusCounts: stats.counts,
    dueReviewCount: stats.dueReviewCount,
    scheduledReviewCount: stats.scheduledReviewCount,
  };
}

const emptyReviewState = {
  status: "TODO",
  notes: "",
  nextReviewAt: "",
  lastUpdatedAt: "",
};

export function ReviewPage({ serviceStatus, runtimeInfo }) {
  const [summary, setSummary] = useState(null);
  const [problems, setProblems] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [selectedProblemId, setSelectedProblemId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reviewState, setReviewState] = useState(emptyReviewState);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewNotice, setReviewNotice] = useState("");
  const [reviewStateSupported, setReviewStateSupported] = useState(true);
  const [reviewStateSupportMessage, setReviewStateSupportMessage] = useState("");
  const refreshSequenceRef = useRef(0);
  const reviewStateSequenceRef = useRef(0);
  const { filters, actions, filteredProblems } = useReviewFilters(summary);

  const refresh = useCallback(async () => {
    const requestId = refreshSequenceRef.current + 1;
    refreshSequenceRef.current = requestId;

    if (serviceStatus.state !== "healthy") {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const [reviewSummary, problemItems, submissionItems] = await Promise.all([
        api.getReviewSummary(),
        api.getProblems({ limit: 200 }),
        api.getSubmissions({ limit: 300 }),
      ]);

      if (requestId !== refreshSequenceRef.current) return;

      setSummary(reviewSummary);
      setProblems(problemItems);
      setSubmissions(submissionItems);
      setSelectedProblemId((current) => current ?? reviewSummary?.problemSummaries?.[0]?.problemId ?? null);
    } catch (nextError) {
      if (requestId !== refreshSequenceRef.current) return;
      setError(nextError.message);
    } finally {
      if (requestId === refreshSequenceRef.current) setLoading(false);
    }
  }, [serviceStatus.state]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    async function loadReviewState() {
      const requestId = reviewStateSequenceRef.current + 1;
      reviewStateSequenceRef.current = requestId;

      if (serviceStatus.state !== "healthy" || !selectedProblemId) {
        setReviewState(emptyReviewState);
        setReviewStateSupported(true);
        setReviewStateSupportMessage("");
        return;
      }

      try {
        const state = await api.getReviewState(selectedProblemId);
        if (requestId !== reviewStateSequenceRef.current) return;
        setReviewState({
          status: state.status || "TODO",
          notes: state.notes || "",
          nextReviewAt: toDatetimeLocalValue(state.nextReviewAt),
          lastUpdatedAt: state.lastUpdatedAt || "",
        });
        setReviewStateSupported(true);
        setReviewStateSupportMessage("");
        setReviewNotice("");
      } catch (nextError) {
        if (requestId !== reviewStateSequenceRef.current) return;
        if (isMissingReviewStateRoute(nextError)) {
          setReviewStateSupported(false);
          setReviewStateSupportMessage(buildReviewStateRouteMessage(runtimeInfo.serviceUrl || serviceStatus.url));
          setReviewNotice("");
          return;
        }
        setReviewStateSupported(true);
        setReviewStateSupportMessage("");
        setError(nextError.message);
      }
    }

    void loadReviewState();
  }, [runtimeInfo.serviceUrl, selectedProblemId, serviceStatus.state, serviceStatus.url]);

  useEffect(() => {
    setSelectedProblemId((current) => {
      if (filteredProblems.some((item) => item.problemId === current)) return current;
      return filteredProblems[0]?.problemId ?? null;
    });
  }, [filteredProblems]);

  const selectedProblem = filteredProblems.find((item) => item.problemId === selectedProblemId);
  const selectedProblemRecord = problems.find((item) => item.id === selectedProblemId);
  const selectedSubmissions = submissions.filter((item) => item.problemId === selectedProblemId);
  const representativeSubmission = selectedSubmissions[0];
  const reviewCounts = summary?.reviewStatusCounts ?? {};
  const serviceUnavailable = serviceStatus.state !== "healthy";

  async function saveReviewState() {
    if (!selectedProblemId || !reviewStateSupported) return;

    setReviewSaving(true);
    setReviewNotice("");
    setError("");

    try {
      const saved = await api.saveReviewState(selectedProblemId, {
        status: reviewState.status,
        notes: reviewState.notes,
        nextReviewAt: reviewState.nextReviewAt ? new Date(reviewState.nextReviewAt).toISOString() : null,
      });
      setReviewState({
        status: saved.status || "TODO",
        notes: saved.notes || "",
        nextReviewAt: toDatetimeLocalValue(saved.nextReviewAt),
        lastUpdatedAt: saved.lastUpdatedAt || "",
      });
      setReviewStateSupported(true);
      setReviewStateSupportMessage("");
      setSummary((current) => applyReviewState(current, selectedProblemId, saved));
      setReviewNotice("复习状态已保存。");
    } catch (nextError) {
      if (isMissingReviewStateRoute(nextError)) {
        setReviewStateSupported(false);
        setReviewStateSupportMessage(buildReviewStateRouteMessage(runtimeInfo.serviceUrl || serviceStatus.url));
        setReviewNotice("");
        return;
      }
      setError(nextError.message);
    } finally {
      setReviewSaving(false);
    }
  }

  return (
    <div className="review-layout">
      <section className="panel review-list-panel">
        <div className="panel-header">
          <h3>复习队列</h3>
          <button type="button" className="ghost-button" disabled={serviceUnavailable} onClick={() => void refresh()}>
            刷新
          </button>
        </div>
        {serviceUnavailable ? (
          <p className="muted">本地服务 {runtimeInfo.serviceUrl || serviceStatus.url} 未就绪，复习数据暂不可用。</p>
        ) : null}

        <div className="mini-stats">
          <article><span>待复习</span><strong>{summary?.dueReviewCount ?? 0}</strong></article>
          <article><span>已排期</span><strong>{summary?.scheduledReviewCount ?? 0}</strong></article>
          <article><span>复习中</span><strong>{reviewCounts.REVIEWING ?? 0}</strong></article>
        </div>

        <ReviewFilterBar filters={filters} actions={actions} />

        {loading ? <p className="muted">正在加载复习数据...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}

        <div className="review-list">
          {filteredProblems.length === 0 ? (
            <p className="muted">没有符合当前筛选条件的题目。</p>
          ) : (
            filteredProblems.map((item) => (
              <button
                key={item.problemId}
                type="button"
                className={item.problemId === selectedProblemId ? "review-card active" : "review-card"}
                onClick={() => setSelectedProblemId(item.problemId)}
              >
                <div className="review-card-copy">
                  <span className="section-label">{platformLabel(item.platform)}</span>
                  <strong>{item.title}</strong>
                  <p>{item.externalProblemId}</p>
                  <span className="review-card-note">
                    {item.reviewDue ? "已到期" : item.nextReviewAt ? `下次 ${formatDate(item.nextReviewAt)}` : "无排期"}
                  </span>
                </div>
                <div className="review-meta">
                  <span className={`status-chip ${verdictTone(item.latestVerdict)}`}>{item.latestVerdict}</span>
                  <span className="meta-pill">
                    {statusLabel(item.reviewStatus)}
                    <span>{item.attemptCount} 次尝试</span>
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="review-detail">
        <ProblemDetailPanel selectedProblem={selectedProblem} selectedProblemRecord={selectedProblemRecord} />

        <div className="panel submission-panel">
          <div className="panel-header">
            <h3>提交记录</h3>
            <span className="caption">来自 /api/submissions 的真实数据</span>
          </div>
          <div className="stack-list">
            {selectedSubmissions.length === 0 ? (
              <p className="muted">当前拉取范围内未找到该题的提交记录。</p>
            ) : (
              selectedSubmissions.map((submission) => (
                <article key={submission.id} className="submission-row">
                  <div>
                    <span className={`status-chip ${verdictTone(submission.verdict)}`}>{submission.verdict}</span>
                    <strong>{submission.language || "未知语言"}</strong>
                    <p>{formatDate(submission.submittedAt)}</p>
                  </div>
                  <div className="submission-metrics">
                    <span>{submission.executionTimeMs ?? "--"} ms</span>
                    <span>{submission.memoryKb ?? "--"} kb</span>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>

        <div className="panel raw-panel">
          <div className="panel-header">
            <h3>原始数据</h3>
            <span className="caption">当前服务返回的是 raw_json 而非源码。</span>
          </div>
          {representativeSubmission ? <pre>{formatRawJSON(representativeSubmission.rawJson)}</pre> : <p className="muted">该题无可用的原始数据。</p>}
        </div>

        <ReviewStateEditor
          reviewState={reviewState}
          reviewSaving={reviewSaving}
          reviewNotice={reviewNotice}
          reviewStateSupported={reviewStateSupported}
          reviewStateSupportMessage={reviewStateSupportMessage}
          serviceUnavailable={serviceUnavailable}
          selectedProblem={selectedProblem}
          onChange={(patch) => setReviewState((current) => ({ ...current, ...patch }))}
          onSave={saveReviewState}
        />
      </section>
    </div>
  );
}
