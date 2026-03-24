import { useCallback, useEffect, useRef, useState } from "react";
import { ReviewFilterBar } from "../components/ReviewFilterBar.jsx";
import { ReviewStateEditor } from "../components/ReviewStateEditor.jsx";
import { ProblemDetailPanel } from "../components/ProblemDetailPanel.jsx";
import { useReviewFilters } from "../hooks/useReviewFilters.js";
import { api } from "../lib/api.js";
import { formatDate, platformLabel, statusLabel, toDatetimeLocalValue, verdictTone } from "../lib/format.js";

const DEFAULT_REVIEW_STATE = {
  status: "TODO",
  notes: "",
  nextReviewAt: "",
  lastUpdatedAt: "",
};

function formatRawJSON(rawJson) {
  try {
    return JSON.stringify(JSON.parse(rawJson), null, 2);
  } catch {
    return rawJson;
  }
}

function toTimestamp(value, fallback = 0) {
  if (!value) {
    return fallback;
  }

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? fallback : timestamp;
}

function isFailureVerdict(verdict) {
  return Boolean(verdict) && String(verdict).toUpperCase() !== "AC";
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

const ANALYSIS_POLL_INTERVAL_MS = 1800;

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
  const [analysisTaskId, setAnalysisTaskId] = useState(null);
  const [analysisStatus, setAnalysisStatus] = useState("");
  const [analysisError, setAnalysisError] = useState("");
  const [analysisText, setAnalysisText] = useState("");
  const [analysisJson, setAnalysisJson] = useState("");
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const refreshSequenceRef = useRef(0);
  const reviewStateSequenceRef = useRef(0);
  const analysisSequenceRef = useRef(0);
  const analysisTimerRef = useRef(null);

  const clearAnalysisPolling = useCallback(() => {
    if (analysisTimerRef.current) {
      window.clearTimeout(analysisTimerRef.current);
      analysisTimerRef.current = null;
    }
  }, []);

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
    clearAnalysisPolling();
    analysisSequenceRef.current += 1;
    setAnalysisTaskId(null);
    setAnalysisStatus("");
    setAnalysisError("");
    setAnalysisText("");
    setAnalysisJson("");
    setAnalysisLoading(false);
  }, [clearAnalysisPolling, selectedProblemId]);

  useEffect(
    () => () => {
      clearAnalysisPolling();
      analysisSequenceRef.current += 1;
    },
    [clearAnalysisPolling]
  );

  const filteredProblems = useMemo(() => {
    const items = summary?.problemSummaries ?? [];
    const searchNeedle = search.trim().toLowerCase();

    return items.filter((item) => {
      const title = (item.title || "").toLowerCase();
      const externalProblemId = (item.externalProblemId || "").toLowerCase();
      const matchSearch =
        !searchNeedle || title.includes(searchNeedle) || externalProblemId.includes(searchNeedle);
      const matchPlatform = !platform || item.platform === platform;
      const matchSolved = !onlyUnsolved || !item.solvedLater;
      const matchReviewStatus = !reviewStatusFilter || item.reviewStatus === reviewStatusFilter;

      let matchSchedule = true;
      if (scheduleFilter === "DUE") {
        matchSchedule = Boolean(item.reviewDue);
      } else if (scheduleFilter === "SCHEDULED") {
        matchSchedule = Boolean(item.nextReviewAt);
      } else if (scheduleFilter === "UNSCHEDULED") {
        matchSchedule = !item.nextReviewAt;
      }

      nextMap.set(submission.problemId, current);
    }

    return nextMap;
  }, [submissions]);

  useEffect(() => {
    setSelectedProblemId((current) => {
      if (filteredProblems.some((item) => item.problemId === current)) return current;
      return filteredProblems[0]?.problemId ?? null;
    });
  }, [filteredProblems]);

  const selectedIndex = filteredProblems.findIndex((item) => item.problemId === selectedProblemId);
  const selectedProblem = selectedIndex >= 0 ? filteredProblems[selectedIndex] : null;
  const previousProblem = selectedIndex > 0 ? filteredProblems[selectedIndex - 1] : null;
  const nextProblem = selectedIndex >= 0 ? filteredProblems[selectedIndex + 1] : null;
  const selectedProblemRecord = problems.find((item) => item.id === selectedProblemId);
  const selectedSubmissions = submissions.filter((item) => item.problemId === selectedProblemId);
  const representativeSubmission = selectedSubmissions[0];
  const selectedSubmissionMeta = submissionMetaByProblemId.get(selectedProblemId) || {
    latestSubmission: null,
    failureCount: 0,
    lastFailureAt: 0,
    lastSubmissionAt: 0,
  };
  const selectedInsights = useMemo(() => {
    const merged = {
      reasons: [],
      suggestions: [],
      keyPoints: [],
    };

    for (const submission of selectedSubmissions) {
      const next = collectInsightCandidates(submission);
      merged.reasons.push(...next.reasons);
      merged.suggestions.push(...next.suggestions);
      merged.keyPoints.push(...next.keyPoints);
    }

    return {
      reasons: [...new Set(merged.reasons)].slice(0, 6),
      suggestions: [...new Set(merged.suggestions)].slice(0, 6),
      keyPoints: [...new Set(merged.keyPoints)].slice(0, 6),
    };
  }, [selectedSubmissions]);
  const reviewCounts = summary?.reviewStatusCounts ?? {};
  const serviceUnavailable = serviceStatus.state !== "healthy";
  const reviewEditorUnavailable = serviceUnavailable || !reviewStateSupported;

  async function saveReviewState() {
    if (!selectedProblemId || !reviewStateSupported) return;

    const shouldAutoAdvance = autoAdvance && reviewState.status === "DONE" && Boolean(nextProblem);

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
      setSummary((current) => applyReviewState(current, selectedProblemId, saved));
      setReviewNotice("复习状态已保存。");
    } catch (nextError) {
      if (isMissingReviewStateRoute(nextError)) {
        setReviewStateSupported(false);
        setReviewStateSupportMessage(buildReviewStateRouteMessage(runtimeInfo.serviceUrl || serviceStatus.url));
        setReviewNotice("");
        return;
      }
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setReviewSaving(false);
    }
  }

  const pollAnalysisTask = useCallback(
    async (taskId, sequenceId) => {
      try {
        const task = await api.getAnalysisTask(taskId);
        if (sequenceId !== analysisSequenceRef.current) {
          return;
        }

        const nextStatus = String(task?.status || "").toUpperCase();
        setAnalysisStatus(nextStatus);

        if (nextStatus === "SUCCEEDED") {
          clearAnalysisPolling();
          setAnalysisLoading(false);
          setAnalysisError("");
          setAnalysisText(task?.resultText || task?.result_text || "");
          setAnalysisJson(task?.resultJson || task?.result_json || "");
          return;
        }

        if (nextStatus === "FAILED") {
          clearAnalysisPolling();
          setAnalysisLoading(false);
          setAnalysisError(task?.errorMessage || task?.error_message || "AI 分析失败。");
          setAnalysisText("");
          setAnalysisJson(task?.resultJson || task?.result_json || "");
          return;
        }

        analysisTimerRef.current = window.setTimeout(() => {
          void pollAnalysisTask(taskId, sequenceId);
        }, ANALYSIS_POLL_INTERVAL_MS);
      } catch (nextError) {
        if (sequenceId !== analysisSequenceRef.current) {
          return;
        }
        clearAnalysisPolling();
        setAnalysisLoading(false);
        setAnalysisError(nextError.message || "获取 AI 分析任务状态失败。");
      }
    },
    [clearAnalysisPolling]
  );

  async function startAnalysis() {
    if (!selectedProblemId || serviceUnavailable) {
      return;
    }

    clearAnalysisPolling();
    const sequenceId = analysisSequenceRef.current + 1;
    analysisSequenceRef.current = sequenceId;

    setAnalysisTaskId(null);
    setAnalysisStatus("QUEUED");
    setAnalysisError("");
    setAnalysisText("");
    setAnalysisJson("");
    setAnalysisLoading(true);

    try {
      const created = await api.generateAnalysis(selectedProblemId);
      if (sequenceId !== analysisSequenceRef.current) {
        return;
      }

      const taskId = created?.taskId;
      if (!taskId) {
        throw new Error("未返回有效 taskId。");
      }

      const initialTask = created?.task ?? null;
      const initialStatus = String(initialTask?.status || "QUEUED").toUpperCase();
      setAnalysisTaskId(taskId);
      setAnalysisStatus(initialStatus);

      if (initialStatus === "SUCCEEDED") {
        setAnalysisLoading(false);
        setAnalysisText(initialTask?.resultText || initialTask?.result_text || "");
        setAnalysisJson(initialTask?.resultJson || initialTask?.result_json || "");
        return;
      }

      if (initialStatus === "FAILED") {
        setAnalysisLoading(false);
        setAnalysisError(initialTask?.errorMessage || initialTask?.error_message || "AI 分析失败。");
        return;
      }

      analysisTimerRef.current = window.setTimeout(() => {
        void pollAnalysisTask(taskId, sequenceId);
      }, ANALYSIS_POLL_INTERVAL_MS);
    } catch (nextError) {
      if (sequenceId !== analysisSequenceRef.current) {
        return;
      }
      clearAnalysisPolling();
      setAnalysisLoading(false);
      setAnalysisError(nextError.message || "触发 AI 分析失败。");
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

        <div className="panel review-insight-panel">
          <div className="panel-header">
            <h3>复盘工作区</h3>
            <span className="caption">把错因、建议、关键提醒集中在同一处，减少来回切换。</span>
          </div>
          {!reviewStateSupported && reviewStateSupportMessage ? (
            <div className="inline-banner warning-banner">
              <strong>复习状态能力不可用</strong>
              <p>{reviewStateSupportMessage}</p>
            </div>
          ) : null}
          {selectedProblem ? (
            <div className="insight-grid">
              <article className="insight-card">
                <h4>为什么错</h4>
                {selectedInsights.reasons.length === 0 ? (
                  <p className="muted">暂无后端分析结果，可先在下方笔记记录本题的错误原因。</p>
                ) : (
                  <ul>
                    {selectedInsights.reasons.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </article>
              <article className="insight-card">
                <h4>下次注意什么</h4>
                {selectedInsights.suggestions.length === 0 ? (
                  <p className="muted">暂无建议字段，保存复习笔记后可把自己的行动项留在这里对应记录。</p>
                ) : (
                  <ul>
                    {selectedInsights.suggestions.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </article>
              <article className="insight-card">
                <h4>关键提醒</h4>
                {selectedInsights.keyPoints.length === 0 ? (
                  <p className="muted">当前没有额外诊断要点。</p>
                ) : (
                  <ul>
                    {selectedInsights.keyPoints.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </article>
            </div>
          ) : (
            <p className="muted">选择题目后，可在这里统一查看诊断与行动建议。</p>
          )}
        </div>

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

        <div className="panel review-editor-panel">
          <div className="panel-header">
            <h3>复习状态</h3>
            <span className="caption">状态、笔记和下次复习时间</span>
          </div>
          {selectedProblem ? (
            <div className="form-stack">
              {!reviewStateSupported ? (
                <p className="error-text">{reviewStateSupportMessage}</p>
              ) : null}
              <label>
                <span>状态</span>
                <select
                  value={reviewState.status}
                  disabled={!reviewStateSupported}
                  onChange={(event) =>
                    setReviewState((current) => ({
                      ...current,
                      status: event.target.value,
                    }))
                  }
                >
                  <option value="TODO">待复习</option>
                  <option value="REVIEWING">复习中</option>
                  <option value="SCHEDULED">已排期</option>
                  <option value="DONE">已完成</option>
                </select>
              </label>

              <label>
                <span>下次复习时间</span>
                <input
                  type="datetime-local"
                  value={reviewState.nextReviewAt}
                  disabled={!reviewStateSupported}
                  onChange={(event) =>
                    setReviewState((current) => ({
                      ...current,
                      nextReviewAt: event.target.value,
                    }))
                  }
                />
              </label>

              <label>
                <span>笔记</span>
                <textarea
                  rows="8"
                  value={reviewState.notes}
                  disabled={!reviewStateSupported}
                  placeholder="记录错误原因、正确思路和下次注意事项。"
                  onChange={(event) =>
                    setReviewState((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                />
              </label>

              <div className="editor-toolbar">
                <span className="meta-pill review-state-pill">
                  {statusLabel(reviewState.status)}
                  <span>{reviewState.lastUpdatedAt ? formatDate(reviewState.lastUpdatedAt) : "尚未保存"}</span>
                </span>
                <button
                  type="button"
                  className="primary-button"
                  disabled={reviewSaving || serviceUnavailable || !reviewStateSupported}
                  onClick={() => void saveReviewState()}
                >
                  {reviewSaving ? "保存中..." : "保存复习状态"}
                </button>
              </div>

              {reviewNotice ? <p className="success-text">{reviewNotice}</p> : null}
            </div>
          ) : (
            <p className="muted">请先选择一道题目再编辑复习状态。</p>
          )}
        </div>

        <div className="panel">
          <div className="panel-header">
            <h3>AI 分析</h3>
            <span className="caption">基于当前题目触发并轮询分析任务</span>
          </div>
          {selectedProblem ? (
            <div className="form-stack">
              <div className="editor-toolbar">
                <button
                  type="button"
                  className="primary-button"
                  disabled={analysisLoading || serviceUnavailable}
                  onClick={() => void startAnalysis()}
                >
                  {analysisLoading ? "分析中..." : "开始 AI 分析"}
                </button>
                {analysisStatus ? <span className="meta-pill">状态：{analysisStatus}</span> : null}
                {analysisTaskId ? <span className="meta-pill">任务 #{analysisTaskId}</span> : null}
              </div>
              {serviceUnavailable ? (
                <p className="muted">本地服务未就绪，AI 分析当前不可用。</p>
              ) : null}
              {analysisError ? <p className="error-text">{analysisError}</p> : null}
              {analysisText ? <pre>{analysisText}</pre> : null}
              {analysisJson ? (
                <details>
                  <summary>查看 result_json（调试）</summary>
                  <pre>{formatRawJSON(analysisJson)}</pre>
                </details>
              ) : null}
              {!analysisText && !analysisError && !analysisLoading ? (
                <p className="muted">点击“开始 AI 分析”后将在这里显示结果。</p>
              ) : null}
            </div>
          ) : (
            <p className="muted">请先选择一道题目再发起 AI 分析。</p>
          )}
        </div>
      </section>
    </div>
  );
}
