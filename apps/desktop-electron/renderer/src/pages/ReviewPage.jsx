import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { parseTags } from "../lib/format.js";
import { ReviewList } from "./ReviewList.jsx";
import { ReviewDetail } from "./ReviewDetail.jsx";

function buildReviewStats(problemSummaries = []) {
  const counts = { TODO: 0, REVIEWING: 0, SCHEDULED: 0, DONE: 0 };
  let dueReviewCount = 0;
  let scheduledReviewCount = 0;
  const now = Date.now();

  for (const item of problemSummaries) {
    const status = (item.reviewStatus || "TODO").toUpperCase();
    if (counts[status] !== undefined) counts[status]++;
    if (item.nextReviewAt) {
      scheduledReviewCount++;
      const t = new Date(item.nextReviewAt).getTime();
      if (!Number.isNaN(t) && t <= now) dueReviewCount++;
    }
  }
  return { counts, dueReviewCount, scheduledReviewCount };
}

function applyReviewState(summary, problemId, savedState) {
  if (!summary?.problemSummaries?.length) return summary;
  const now = Date.now();

  const nextProblemSummaries = summary.problemSummaries.map((item) => {
    if (item.problemId !== problemId) return item;
    const nextReviewAt = savedState.nextReviewAt || null;
    const nextReviewTime = nextReviewAt ? new Date(nextReviewAt).getTime() : Number.NaN;
    return {
      ...item,
      reviewStatus: savedState.status || "TODO",
      nextReviewAt,
      lastReviewUpdatedAt: savedState.lastUpdatedAt || null,
      reviewDue: !Number.isNaN(nextReviewTime) && nextReviewTime <= now,
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
  const [filters, setFilters] = useState({
    search: "",
    platform: "",
    reviewStatus: "",
    schedule: "",
    sortBy: "lastSubmitted",
    onlyUnsolved: true,
  });
  const [selectedProblemId, setSelectedProblemId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const seqRef = useRef(0);

  const refresh = useCallback(async () => {
    const reqId = ++seqRef.current;
    if (serviceStatus.state !== "healthy") { setLoading(false); return; }
    setLoading(true);
    setError("");
    try {
      const [reviewSummary, problemItems, submissionItems] = await Promise.all([
        api.getReviewSummary(),
        api.getProblems({ limit: 200 }),
        api.getSubmissions({ limit: 300 }),
      ]);
      if (reqId !== seqRef.current) return;
      setSummary(reviewSummary);
      setProblems(problemItems);
      setSubmissions(submissionItems);
      setSelectedProblemId((cur) =>
        cur ?? reviewSummary?.problemSummaries?.[0]?.problemId ?? null
      );
    } catch (err) {
      if (reqId !== seqRef.current) return;
      setError(err.message);
    } finally {
      if (reqId === seqRef.current) setLoading(false);
    }
  }, [serviceStatus.state]);

  useEffect(() => { void refresh(); }, [refresh]);

  const filteredProblems = useMemo(() => {
    const items = summary?.problemSummaries ?? [];
    const needle = filters.search.trim().toLowerCase();

    return items
      .filter((item) => {
        if (needle &&
          !item.title?.toLowerCase().includes(needle) &&
          !item.externalProblemId?.toLowerCase().includes(needle)
        ) return false;
        if (filters.platform && item.platform !== filters.platform) return false;
        if (filters.onlyUnsolved && item.solvedLater) return false;
        if (filters.reviewStatus && item.reviewStatus !== filters.reviewStatus) return false;
        if (filters.schedule === "DUE" && !item.reviewDue) return false;
        if (filters.schedule === "SCHEDULED" && !item.nextReviewAt) return false;
        if (filters.schedule === "UNSCHEDULED" && item.nextReviewAt) return false;
        return true;
      })
      .sort((a, b) => {
        if (filters.sortBy === "nextReview") {
          const at = a.nextReviewAt ? new Date(a.nextReviewAt).getTime() : Infinity;
          const bt = b.nextReviewAt ? new Date(b.nextReviewAt).getTime() : Infinity;
          return at - bt;
        }
        const at = a.lastSubmittedAt ? new Date(a.lastSubmittedAt).getTime() : 0;
        const bt = b.lastSubmittedAt ? new Date(b.lastSubmittedAt).getTime() : 0;
        return bt - at;
      });
  }, [summary, filters]);

  useEffect(() => {
    setSelectedProblemId((cur) => {
      if (filteredProblems.some((item) => item.problemId === cur)) return cur;
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

  const reviewCounts = summary?.reviewStatusCounts ?? {};
  const doneCount = (reviewCounts.DONE ?? 0) + (reviewCounts.SCHEDULED ?? 0);
  const totalCount = summary?.problemSummaries?.length ?? 0;

  function handleReviewSaved(savedState) {
    setSummary((cur) => applyReviewState(cur, selectedProblemId, savedState));
  }

  return (
    <div className="review-layout">
      <ReviewList
        problems={filteredProblems}
        selectedProblemId={selectedProblemId}
        onSelect={setSelectedProblemId}
        filters={filters}
        onFiltersChange={setFilters}
        loading={loading}
        error={error}
        onRefresh={refresh}
        serviceUnavailable={serviceStatus.state !== "healthy"}
        dueCount={summary?.dueReviewCount ?? 0}
        doneCount={doneCount}
        totalCount={totalCount}
      />
      <ReviewDetail
        selectedProblem={selectedProblem}
        selectedProblemRecord={selectedProblemRecord}
        selectedSubmissions={selectedSubmissions}
        selectedTags={selectedTags}
        serviceStatus={serviceStatus}
        runtimeInfo={runtimeInfo}
        filteredProblems={filteredProblems}
        onSelect={setSelectedProblemId}
        onReviewSaved={handleReviewSaved}
      />
    </div>
  );
}
