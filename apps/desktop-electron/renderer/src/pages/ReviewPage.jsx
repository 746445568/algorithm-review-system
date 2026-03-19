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

function extractStringList(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/\n|[;；]/)
      .map((item) => item.replace(/^[-•0-9.\s]+/, "").trim())
      .filter(Boolean);
  }

  return [];
}

function collectInsightCandidates(submission) {
  let parsedRaw = null;
  if (submission?.rawJson) {
    try {
      parsedRaw = JSON.parse(submission.rawJson);
    } catch {
      parsedRaw = null;
    }
  }

  const containers = [
    submission,
    submission?.review,
    parsedRaw,
    parsedRaw?.review,
    parsedRaw?.analysis,
    parsedRaw?.diagnostics,
    parsedRaw?.result,
  ].filter(Boolean);

  const reasons = [];
  const suggestions = [];
  const keyPoints = [];

  for (const container of containers) {
    reasons.push(
      ...extractStringList(container.aiAnalysis),
      ...extractStringList(container.analysis),
      ...extractStringList(container.reason),
      ...extractStringList(container.whyWrong),
      ...extractStringList(container.errorAnalysis)
    );
    suggestions.push(
      ...extractStringList(container.improvementSuggestions),
      ...extractStringList(container.suggestions),
      ...extractStringList(container.nextAdvice),
      ...extractStringList(container.nextFocus),
      ...extractStringList(container.recommendations)
    );
    keyPoints.push(...extractStringList(container.keyPoints), ...extractStringList(container.notes));
  }

  return {
    reasons: [...new Set(reasons)],
    suggestions: [...new Set(suggestions)],
    keyPoints: [...new Set(keyPoints)],
  };
}

function compareRank(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return right[index] - left[index];
    }
  }
  return 0;
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
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [selectedProblemId, setSelectedProblemId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reviewState, setReviewState] = useState(DEFAULT_REVIEW_STATE);
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
        setReviewState(DEFAULT_REVIEW_STATE);
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

  const submissionMetaByProblemId = useMemo(() => {
    const nextMap = new Map();

    for (const submission of submissions) {
      const current = nextMap.get(submission.problemId) || {
        latestSubmission: null,
        lastSubmissionAt: 0,
        lastFailureAt: 0,
        failureCount: 0,
      };
      const submittedAt = toTimestamp(submission.submittedAt);
      const failed = isFailureVerdict(submission.verdict);

      if (submittedAt >= current.lastSubmissionAt) {
        current.latestSubmission = submission;
        current.lastSubmissionAt = submittedAt;
      }
      if (failed) {
        current.failureCount += 1;
        current.lastFailureAt = Math.max(current.lastFailureAt, submittedAt);
      }

      nextMap.set(submission.problemId, current);
    }

    return nextMap;
  }, [submissions]);

  const filteredProblems = useMemo(() => {
    const items = summary?.problemSummaries ?? [];
    const searchNeedle = search.trim().toLowerCase();

    return items
      .filter((item) => {
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
      })
      .sort((left, right) => {
        const leftMeta = submissionMetaByProblemId.get(left.problemId) || {};
        const rightMeta = submissionMetaByProblemId.get(right.problemId) || {};
        const leftRank = [
          left.reviewDue ? 1 : 0,
          left.solvedLater ? 0 : 1,
          leftMeta.lastFailureAt || 0,
          toTimestamp(left.lastReviewUpdatedAt),
          leftMeta.lastSubmissionAt || toTimestamp(left.lastSubmittedAt),
          left.problemId,
        ];
        const rightRank = [
          right.reviewDue ? 1 : 0,
          right.solvedLater ? 0 : 1,
          rightMeta.lastFailureAt || 0,
          toTimestamp(right.lastReviewUpdatedAt),
          rightMeta.lastSubmissionAt || toTimestamp(right.lastSubmittedAt),
          right.problemId,
        ];
        return compareRank(leftRank, rightRank);
      });
  }, [onlyUnsolved, platform, reviewStatusFilter, scheduleFilter, search, submissionMetaByProblemId, summary]);

  useEffect(() => {
    setSelectedProblemId((current) => {
      if (filteredProblems.some((item) => item.problemId === current)) {
        return current;
      }
      return filteredProblems[0]?.problemId ?? null;
    });
  }, [filteredProblems]);

  const selectedIndex = filteredProblems.findIndex((item) => item.problemId === selectedProblemId);
  const selectedProblem = selectedIndex >= 0 ? filteredProblems[selectedIndex] : null;
  const previousProblem = selectedIndex > 0 ? filteredProblems[selectedIndex - 1] : null;
  const nextProblem = selectedIndex >= 0 ? filteredProblems[selectedIndex + 1] : null;
  const selectedProblemRecord = problems.find((item) => item.id === selectedProblemId);
  const selectedSubmissions = submissions.filter((item) => item.problemId === selectedProblemId);
  const selectedTags =
    selectedProblem?.tags?.length > 0
      ? selectedProblem.tags
      : parseTags(selectedProblemRecord?.rawTagsJson);
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

  async function saveReviewState() {
    if (!selectedProblemId || !reviewStateSupported) {
      return;
    }

    const shouldAutoAdvance = autoAdvance && reviewState.status === "DONE" && Boolean(nextProblem);

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
      setReviewNotice(shouldAutoAdvance ? "已保存，自动切换到下一题。" : "复习状态已保存。");
      if (shouldAutoAdvance) {
        setSelectedProblemId(nextProblem.problemId);
      }
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
  }

  return (
    <div className="review-layout">
      <section className="panel review-list-panel">
        <div className="panel-header">
          <div>
            <h3>复习队列</h3>
            <p className="caption">默认按“现在最该处理”排序：到期复习 → 未解决 → 最近失败。</p>
          </div>
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
          <article>
            <span>待复习</span>
            <strong>{summary?.dueReviewCount ?? 0}</strong>
          </article>
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
            filteredProblems.map((item, index) => {
              const meta = submissionMetaByProblemId.get(item.problemId) || {
                latestSubmission: null,
                failureCount: 0,
              };

              return (
                <button
                  key={item.problemId}
                  type="button"
                  className={
                    item.problemId === selectedProblemId ? "review-card active" : "review-card"
                  }
                  onClick={() => setSelectedProblemId(item.problemId)}
                >
                  <div className="review-card-copy">
                    <div className="review-card-header-row">
                      <span className="section-label">#{index + 1}</span>
                      <span className="section-label">{platformLabel(item.platform)}</span>
                    </div>
                    <strong>{item.title}</strong>
                    <p>{item.externalProblemId}</p>
                    <div className="review-card-summary-grid">
                      <span className={`review-card-note ${item.reviewDue ? "emphasis" : ""}`}>
                        {item.reviewDue
                          ? "已到期复习"
                          : item.nextReviewAt
                            ? `下次 ${formatDate(item.nextReviewAt)}`
                            : "无排期"}
                      </span>
                      <span className="review-card-note">
                        最近提交：
                        {meta.latestSubmission?.submittedAt
                          ? formatDate(meta.latestSubmission.submittedAt)
                          : formatDate(item.lastSubmittedAt)}
                      </span>
                      <span className="review-card-note">最近 Verdict：{item.latestVerdict || "未知"}</span>
                      <span className="review-card-note">失败 {meta.failureCount || 0} 次</span>
                    </div>
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
              );
            })
          )}
        </div>
      </section>

      <section className="review-detail">
        <div className="panel review-summary-panel">
          {selectedProblem ? (
            <>
              <div className="panel-header review-flow-header">
                <div>
                  <span className="section-label">{platformLabel(selectedProblem.platform)}</span>
                  <h3>{selectedProblem.title}</h3>
                  <p className="detail-subtitle">
                    {selectedProblem.externalProblemId}
                    {selectedProblem.contestId ? ` / 比赛 ${selectedProblem.contestId}` : ""}
                  </p>
                </div>
                <div className="review-nav-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={!previousProblem}
                    onClick={() => previousProblem && setSelectedProblemId(previousProblem.problemId)}
                  >
                    上一题
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={!nextProblem}
                    onClick={() => nextProblem && setSelectedProblemId(nextProblem.problemId)}
                  >
                    下一题
                  </button>
                </div>
              </div>

              <div className="detail-metrics">
                <article>
                  <span>尝试次数</span>
                  <strong>{selectedProblem.attemptCount}</strong>
                </article>
                <article>
                  <span>失败次数</span>
                  <strong>{selectedSubmissionMeta.failureCount}</strong>
                </article>
                <article>
                  <span>最近提交</span>
                  <strong>{formatDate(selectedSubmissionMeta.latestSubmission?.submittedAt || selectedProblem.lastSubmittedAt)}</strong>
                </article>
                <article>
                  <span>最近 Verdict</span>
                  <strong>{selectedProblem.latestVerdict || "未知"}</strong>
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
                  <span>当前优先级</span>
                  <strong>{selectedProblem.reviewDue ? "到期优先" : selectedProblem.solvedLater ? "已恢复" : "仍未通过"}</strong>
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
            <div>
              <h3>连续复习操作</h3>
              <span className="caption">状态、笔记和下次复习时间</span>
            </div>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={autoAdvance}
                onChange={(event) => setAutoAdvance(event.target.checked)}
              />
              标记完成后自动跳转下一题
            </label>
          </div>
          {!reviewStateSupported && reviewStateSupportMessage ? (
            <div className="inline-banner warning-banner compact-banner">
              <strong>旧服务提示</strong>
              <p>{reviewStateSupportMessage}</p>
            </div>
          ) : null}
          {selectedProblem ? (
            <div className="form-stack">
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
                <div className="review-nav-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={!previousProblem}
                    onClick={() => previousProblem && setSelectedProblemId(previousProblem.problemId)}
                  >
                    上一题
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={!nextProblem}
                    onClick={() => nextProblem && setSelectedProblemId(nextProblem.problemId)}
                  >
                    下一题
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={reviewSaving || serviceUnavailable || !reviewStateSupported}
                    onClick={() => void saveReviewState()}
                  >
                    {reviewSaving ? "保存中..." : "保存复习状态"}
                  </button>
                </div>
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
