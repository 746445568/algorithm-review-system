import { useCallback, useMemo, useState } from "react";
import { ErrorBoundary } from "../components/ErrorBoundary.jsx";
import { ErrorPageFallback } from "../components/ErrorPageFallback.jsx";
import { ReviewList } from "./ReviewList.jsx";
import { ReviewDetail } from "./ReviewDetail.jsx";
import { useReviewData } from "../hooks/useReviewData.js";
import { parseTags } from "../lib/format.js";

export function ReviewPage({ serviceStatus, runtimeInfo, onNavigate }) {
  const [filters, setFilters] = useState({
    search: "",
    platform: "",
    reviewStatus: "",
    schedule: "",
    sortBy: "lastSubmitted",
    onlyUnsolved: true,
  });
  const [selectedProblemId, setSelectedProblemId] = useState(null);

  // 使用 SWR 获取 Review 数据
  const {
    reviewSummary,
    problems,
    submissions,
    error,
    isLoading,
    mutate,
    updateReviewState,
  } = useReviewData(serviceStatus);

  const filteredProblems = useMemo(() => {
    const items = reviewSummary?.problemSummaries ?? [];
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
  }, [reviewSummary, filters]);

  React.useEffect(() => {
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

  const reviewCounts = reviewSummary?.reviewStatusCounts ?? {};
  const doneCount = (reviewCounts.DONE ?? 0) + (reviewCounts.SCHEDULED ?? 0);
  const totalCount = reviewSummary?.problemSummaries?.length ?? 0;

  // 使用 SWR 的乐观更新
  async function handleReviewSaved(savedState) {
    try {
      await updateReviewState(selectedProblemId, savedState);
    } catch (err) {
      console.error("updateReviewState failed:", err);
    }
  }

  // 手动刷新（用于 Refresh 按钮）
  const refresh = useCallback(async () => {
    await mutate();
  }, [mutate]);

  return (
    <div className="review-layout">
      <ReviewList
        problems={filteredProblems}
        selectedProblemId={selectedProblemId}
        onSelect={setSelectedProblemId}
        filters={filters}
        onFiltersChange={setFilters}
        loading={isLoading && !reviewSummary}
        error={error?.message || ""}
        onRefresh={refresh}
        serviceUnavailable={serviceStatus.state !== "healthy"}
        dueCount={reviewSummary?.dueReviewCount ?? 0}
        doneCount={doneCount}
        totalCount={totalCount}
      />
      <ErrorBoundary moduleName="ReviewDetail" fallback={<ErrorPageFallback />}>
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
          onNavigate={onNavigate}
        />
      </ErrorBoundary>
    </div>
  );
}
