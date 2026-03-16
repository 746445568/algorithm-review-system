import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api.js";
import {
  formatDate,
  parseTags,
  platformLabel,
  statusLabel,
  toDatetimeLocalValue,
  verdictTone,
} from "../lib/format.js";

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
  const counts = {
    TODO: 0,
    REVIEWING: 0,
    SCHEDULED: 0,
    DONE: 0,
  };
  let dueReviewCount = 0;
  let scheduledReviewCount = 0;
  const now = Date.now();

  for (const item of problemSummaries) {
    const status = (item.reviewStatus || "TODO").toUpperCase();
    if (counts[status] !== undefined) {
      counts[status] += 1;
    }

    if (item.nextReviewAt) {
      scheduledReviewCount += 1;
      const nextReviewTime = new Date(item.nextReviewAt).getTime();
      if (!Number.isNaN(nextReviewTime) && nextReviewTime <= now) {
        dueReviewCount += 1;
      }
    }
  }

  return { counts, dueReviewCount, scheduledReviewCount };
}

function applyReviewState(summary, problemId, savedState) {
  if (!summary?.problemSummaries?.length) {
    return summary;
  }

  const nextProblemSummaries = summary.problemSummaries.map((item) => {
    if (item.problemId !== problemId) {
      return item;
    }

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

export function ReviewPage({ serviceStatus, runtimeInfo }) {
  const [summary, setSummary] = useState(null);
  const [problems, setProblems] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState("");
  const [reviewStatusFilter, setReviewStatusFilter] = useState("");
  const [scheduleFilter, setScheduleFilter] = useState("");
  const [onlyUnsolved, setOnlyUnsolved] = useState(true);
  const [selectedProblemId, setSelectedProblemId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reviewState, setReviewState] = useState({
    status: "TODO",
    notes: "",
    nextReviewAt: "",
    lastUpdatedAt: "",
  });
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewNotice, setReviewNotice] = useState("");
  const [reviewStateSupported, setReviewStateSupported] = useState(true);
  const [reviewStateSupportMessage, setReviewStateSupportMessage] = useState("");
  const refreshSequenceRef = useRef(0);
  const reviewStateSequenceRef = useRef(0);

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

      if (requestId !== refreshSequenceRef.current) {
        return;
      }

      setSummary(reviewSummary);
      setProblems(problemItems);
      setSubmissions(submissionItems);
      setSelectedProblemId((current) => current ?? reviewSummary?.problemSummaries?.[0]?.problemId ?? null);
    } catch (nextError) {
      if (requestId !== refreshSequenceRef.current) {
        return;
      }
      setError(nextError.message);
    } finally {
      if (requestId === refreshSequenceRef.current) {
        setLoading(false);
      }
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
        setReviewState({
          status: "TODO",
          notes: "",
          nextReviewAt: "",
          lastUpdatedAt: "",
        });
        setReviewStateSupported(true);
        setReviewStateSupportMessage("");
        return;
      }

      try {
        const state = await api.getReviewState(selectedProblemId);
        if (requestId !== reviewStateSequenceRef.current) {
          return;
        }
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
        if (requestId !== reviewStateSequenceRef.current) {
          return;
        }
        if (isMissingReviewStateRoute(nextError)) {
          setReviewStateSupported(false);
          setReviewStateSupportMessage(
            buildReviewStateRouteMessage(runtimeInfo.serviceUrl || serviceStatus.url)
          );
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

      return matchSearch && matchPlatform && matchSolved && matchReviewStatus && matchSchedule;
    });
  }, [onlyUnsolved, platform, reviewStatusFilter, scheduleFilter, search, summary]);

  useEffect(() => {
    setSelectedProblemId((current) => {
      if (filteredProblems.some((item) => item.problemId === current)) {
        return current;
      }
      return filteredProblems[0]?.problemId ?? null;
    });
  }, [filteredProblems]);

  const selectedProblem = filteredProblems.find((item) => item.problemId === selectedProblemId);
  const selectedProblemRecord = problems.find((item) => item.id === selectedProblemId);
  const selectedSubmissions = submissions.filter((item) => item.problemId === selectedProblemId);
  const selectedTags =
    selectedProblem?.tags?.length > 0
      ? selectedProblem.tags
      : parseTags(selectedProblemRecord?.rawTagsJson);
  const representativeSubmission = selectedSubmissions[0];
  const reviewCounts = summary?.reviewStatusCounts ?? {};
  const serviceUnavailable = serviceStatus.state !== "healthy";

  const saveReviewState = useCallback(async () => {
    if (!selectedProblemId || !reviewStateSupported) {
      return;
    }

    setReviewSaving(true);
    setReviewNotice("");
    setError("");

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
      setReviewStateSupportMessage("");
      setSummary((current) => applyReviewState(current, selectedProblemId, saved));
      setReviewNotice("复习状态已保存。");
    } catch (nextError) {
      if (isMissingReviewStateRoute(nextError)) {
        setReviewStateSupported(false);
        setReviewStateSupportMessage(
          buildReviewStateRouteMessage(runtimeInfo.serviceUrl || serviceStatus.url)
        );
        setReviewNotice("");
        return;
      }
      setError(nextError.message);
    } finally {
      setReviewSaving(false);
    }
  }, [selectedProblemId, reviewStateSupported, reviewState, runtimeInfo.serviceUrl, serviceStatus.url]);

  // Ctrl+S / Cmd+S 快捷键保存复习状态
  useEffect(() => {
    function handleKeyDown(event) {
      if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault();
        if (selectedProblemId && reviewStateSupported && !reviewSaving) {
          void saveReviewState();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedProblemId, reviewStateSupported, reviewSaving, saveReviewState]);

  return (
    <div className="review-layout">
      <section className="panel review-list-panel">
        <div className="panel-header">
          <h3>复习队列</h3>
          <button
            type="button"
            className="ghost-button"
            disabled={serviceUnavailable}
            onClick={() => void refresh()}
          >
            刷新
          </button>
        </div>
        {serviceUnavailable ? (
          <p className="muted">
            本地服务 {runtimeInfo.serviceUrl || serviceStatus.url} 未就绪，复习数据暂不可用。
          </p>
        ) : null}

        <div className="mini-stats">
          <button
            type="button"
            className={scheduleFilter === "DUE" ? "stat-chip active" : "stat-chip"}
            onClick={() => setScheduleFilter((current) => (current === "DUE" ? "" : "DUE"))}
            title="点击只看今日到期"
          >
            <span>待复习</span>
            <strong>{summary?.dueReviewCount ?? 0}</strong>
          </button>
          <article>
            <span>已排期</span>
            <strong>{summary?.scheduledReviewCount ?? 0}</strong>
          </article>
          <article>
            <span>复习中</span>
            <strong>{reviewCounts.REVIEWING ?? 0}</strong>
          </article>
        </div>

        <div className="filter-row">
          <input
            value={search}
            placeholder="搜索题目名或题号"
            onChange={(event) => setSearch(event.target.value)}
          />
          <select value={platform} onChange={(event) => setPlatform(event.target.value)}>
            <option value="">全部平台</option>
            <option value="CODEFORCES">Codeforces</option>
            <option value="ATCODER">AtCoder</option>
          </select>
        </div>

        <div className="filter-row">
          <select
            value={reviewStatusFilter}
            onChange={(event) => setReviewStatusFilter(event.target.value)}
          >
            <option value="">全部状态</option>
            <option value="TODO">待复习</option>
            <option value="REVIEWING">复习中</option>
            <option value="SCHEDULED">已排期</option>
            <option value="DONE">已完成</option>
          </select>
          <select value={scheduleFilter} onChange={(event) => setScheduleFilter(event.target.value)}>
            <option value="">全部排期</option>
            <option value="DUE">已到期</option>
            <option value="SCHEDULED">有排期</option>
            <option value="UNSCHEDULED">无排期</option>
          </select>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={onlyUnsolved}
              onChange={(event) => setOnlyUnsolved(event.target.checked)}
            />
            仅显示未通过
          </label>
        </div>

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
                className={
                  item.problemId === selectedProblemId ? "review-card active" : "review-card"
                }
                onClick={() => setSelectedProblemId(item.problemId)}
              >
                <div className="review-card-copy">
                  <span className="section-label">{platformLabel(item.platform)}</span>
                  <strong>{item.title}</strong>
                  <p>{item.externalProblemId}</p>
                  <span className="review-card-note">
                    {item.reviewDue
                      ? "已到期"
                      : item.nextReviewAt
                        ? `下次 ${formatDate(item.nextReviewAt)}`
                        : "无排期"}
                  </span>
                </div>
                <div className="review-meta">
                  <span className={`status-chip ${verdictTone(item.latestVerdict)}`}>
                    {item.latestVerdict}
                  </span>
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
        <div className="panel review-summary-panel">
          {selectedProblem ? (
            <>
              <span className="section-label">{platformLabel(selectedProblem.platform)}</span>
              <h3>{selectedProblem.title}</h3>
              <p className="detail-subtitle">
                {selectedProblem.externalProblemId}
                {selectedProblem.contestId ? ` / 比赛 ${selectedProblem.contestId}` : ""}
              </p>

              <div className="detail-metrics">
                <article>
                  <span>尝试次数</span>
                  <strong>{selectedProblem.attemptCount}</strong>
                </article>
                <article>
                  <span>复习状态</span>
                  <strong>{statusLabel(selectedProblem.reviewStatus)}</strong>
                </article>
                <article>
                  <span>下次复习</span>
                  <strong>{selectedProblem.nextReviewAt ? formatDate(selectedProblem.nextReviewAt) : "未设置"}</strong>
                </article>
                <article>
                  <span>解题状态</span>
                  <strong>{selectedProblem.solvedLater ? "已恢复" : "仍未通过"}</strong>
                </article>
              </div>

              <div className="tag-row">
                {selectedTags.length === 0 ? (
                  <span className="muted">暂无标签。</span>
                ) : (
                  selectedTags.map((tag) => (
                    <span key={tag} className="tag-chip">
                      {tag}
                    </span>
                  ))
                )}
              </div>

              {selectedProblemRecord?.url ? (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => window.desktopBridge?.openExternal(selectedProblemRecord.url)}
                >
                  打开题目页面
                </button>
              ) : null}
            </>
          ) : (
            <p className="muted">从左侧列表选择一道题目以查看详情。</p>
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
                    <span className={`status-chip ${verdictTone(submission.verdict)}`}>
                      {submission.verdict}
                    </span>
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
          {representativeSubmission ? (
            <pre>{formatRawJSON(representativeSubmission.rawJson)}</pre>
          ) : (
            <p className="muted">该题无可用的原始数据。</p>
          )}
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
              <div className="date-preset-row">
                {[
                  { label: "明天", days: 1 },
                  { label: "3天后", days: 3 },
                  { label: "1周后", days: 7 },
                  { label: "2周后", days: 14 },
                ].map(({ label, days }) => (
                  <button
                    key={days}
                    type="button"
                    className="ghost-button"
                    disabled={!reviewStateSupported}
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() + days);
                      d.setHours(9, 0, 0, 0);
                      setReviewState((current) => ({
                        ...current,
                        nextReviewAt: toDatetimeLocalValue(d.toISOString()),
                      }));
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

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
      </section>
    </div>
  );
}
