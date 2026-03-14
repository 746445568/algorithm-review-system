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
  return `The running ojreviewd.exe at ${serviceUrl} is older than this renderer build. Review-state read/write needs a binary rebuilt from the current apps/server source.`;
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

  async function saveReviewState() {
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
      setReviewNotice("Review state saved.");
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
          <h3>Review backlog</h3>
          <button
            type="button"
            className="ghost-button"
            disabled={serviceUnavailable}
            onClick={() => void refresh()}
          >
            Refresh
          </button>
        </div>
        {serviceUnavailable ? (
          <p className="muted">
            Review data is unavailable until the local service at {runtimeInfo.serviceUrl || serviceStatus.url} is healthy.
          </p>
        ) : null}

        <div className="mini-stats">
          <article>
            <span>Due now</span>
            <strong>{summary?.dueReviewCount ?? 0}</strong>
          </article>
          <article>
            <span>Scheduled</span>
            <strong>{summary?.scheduledReviewCount ?? 0}</strong>
          </article>
          <article>
            <span>Reviewing</span>
            <strong>{reviewCounts.REVIEWING ?? 0}</strong>
          </article>
        </div>

        <div className="filter-row">
          <input
            value={search}
            placeholder="Search title or problem id"
            onChange={(event) => setSearch(event.target.value)}
          />
          <select value={platform} onChange={(event) => setPlatform(event.target.value)}>
            <option value="">All platforms</option>
            <option value="CODEFORCES">Codeforces</option>
            <option value="ATCODER">AtCoder</option>
          </select>
        </div>

        <div className="filter-row">
          <select
            value={reviewStatusFilter}
            onChange={(event) => setReviewStatusFilter(event.target.value)}
          >
            <option value="">All review states</option>
            <option value="TODO">Todo</option>
            <option value="REVIEWING">Reviewing</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="DONE">Done</option>
          </select>
          <select value={scheduleFilter} onChange={(event) => setScheduleFilter(event.target.value)}>
            <option value="">Any schedule</option>
            <option value="DUE">Due now</option>
            <option value="SCHEDULED">Has schedule</option>
            <option value="UNSCHEDULED">No schedule</option>
          </select>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={onlyUnsolved}
              onChange={(event) => setOnlyUnsolved(event.target.checked)}
            />
            only unsolved
          </label>
        </div>

        {loading ? <p className="muted">Loading review data...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}

        <div className="review-list">
          {filteredProblems.length === 0 ? (
            <p className="muted">No problem matches the current filters.</p>
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
                      ? "Due now"
                      : item.nextReviewAt
                        ? `Next ${formatDate(item.nextReviewAt)}`
                        : "No schedule"}
                  </span>
                </div>
                <div className="review-meta">
                  <span className={`status-chip ${verdictTone(item.latestVerdict)}`}>
                    {item.latestVerdict}
                  </span>
                  <span className="meta-pill">
                    {statusLabel(item.reviewStatus)}
                    <span>{item.attemptCount} tries</span>
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
                {selectedProblem.contestId ? ` / contest ${selectedProblem.contestId}` : ""}
              </p>

              <div className="detail-metrics">
                <article>
                  <span>Attempts</span>
                  <strong>{selectedProblem.attemptCount}</strong>
                </article>
                <article>
                  <span>Review state</span>
                  <strong>{statusLabel(selectedProblem.reviewStatus)}</strong>
                </article>
                <article>
                  <span>Next review</span>
                  <strong>{selectedProblem.nextReviewAt ? formatDate(selectedProblem.nextReviewAt) : "Not set"}</strong>
                </article>
                <article>
                  <span>Status</span>
                  <strong>{selectedProblem.solvedLater ? "Recovered" : "Still blocked"}</strong>
                </article>
              </div>

              <div className="tag-row">
                {selectedTags.length === 0 ? (
                  <span className="muted">No tags were normalized yet.</span>
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
                  Open problem statement
                </button>
              ) : null}
            </>
          ) : (
            <p className="muted">Choose a problem from the left to inspect its attempts.</p>
          )}
        </div>

        <div className="panel submission-panel">
          <div className="panel-header">
            <h3>Submission timeline</h3>
            <span className="caption">Real rows from /api/submissions</span>
          </div>
          <div className="stack-list">
            {selectedSubmissions.length === 0 ? (
              <p className="muted">No submissions found for this problem in the current fetch window.</p>
            ) : (
              selectedSubmissions.map((submission) => (
                <article key={submission.id} className="submission-row">
                  <div>
                    <span className={`status-chip ${verdictTone(submission.verdict)}`}>
                      {submission.verdict}
                    </span>
                    <strong>{submission.language || "Unknown language"}</strong>
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
            <h3>Representative raw payload</h3>
            <span className="caption">Current service still exposes raw_json rather than source code.</span>
          </div>
          {representativeSubmission ? (
            <pre>{formatRawJSON(representativeSubmission.rawJson)}</pre>
          ) : (
            <p className="muted">No raw payload available for the selected problem.</p>
          )}
        </div>

        <div className="panel review-editor-panel">
          <div className="panel-header">
            <h3>Review state</h3>
            <span className="caption">Status, notes, and next review schedule</span>
          </div>
          {selectedProblem ? (
            <div className="form-stack">
              {!reviewStateSupported ? (
                <p className="error-text">{reviewStateSupportMessage}</p>
              ) : null}
              <label>
                <span>Status</span>
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
                  <option value="TODO">Todo</option>
                  <option value="REVIEWING">Reviewing</option>
                  <option value="SCHEDULED">Scheduled</option>
                  <option value="DONE">Done</option>
                </select>
              </label>

              <label>
                <span>Next review at</span>
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
                <span>Notes</span>
                <textarea
                  rows="8"
                  value={reviewState.notes}
                  disabled={!reviewStateSupported}
                  placeholder="Record root cause, corrected idea, and what to watch next time."
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
                  <span>{reviewState.lastUpdatedAt ? formatDate(reviewState.lastUpdatedAt) : "Not saved yet"}</span>
                </span>
                <button
                  type="button"
                  className="primary-button"
                  disabled={reviewSaving || serviceUnavailable || !reviewStateSupported}
                  onClick={() => void saveReviewState()}
                >
                  {reviewSaving ? "Saving..." : "Save review state"}
                </button>
              </div>

              {reviewNotice ? <p className="success-text">{reviewNotice}</p> : null}
            </div>
          ) : (
            <p className="muted">Select a problem before editing review state.</p>
          )}
        </div>
      </section>
    </div>
  );
}
