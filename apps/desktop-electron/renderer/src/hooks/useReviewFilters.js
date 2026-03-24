import { useMemo, useState } from "react";

export function useReviewFilters(summary) {
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState("");
  const [reviewStatusFilter, setReviewStatusFilter] = useState("");
  const [scheduleFilter, setScheduleFilter] = useState("");
  const [onlyUnsolved, setOnlyUnsolved] = useState(true);

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

  return {
    filters: {
      search,
      platform,
      reviewStatusFilter,
      scheduleFilter,
      onlyUnsolved,
    },
    actions: {
      setSearch,
      setPlatform,
      setReviewStatusFilter,
      setScheduleFilter,
      setOnlyUnsolved,
    },
    filteredProblems,
  };
}
