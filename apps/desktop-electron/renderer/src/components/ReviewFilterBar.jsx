import { memo } from "react";

export const ReviewFilterBar = memo(function ReviewFilterBar({ filters, actions }) {
  const handleSearchChange = (event) => {
    actions.setSearch(event.target.value);
  };

  const handlePlatformChange = (event) => {
    actions.setPlatform(event.target.value);
  };

  const handleReviewStatusChange = (event) => {
    actions.setReviewStatusFilter(event.target.value);
  };

  const handleScheduleChange = (event) => {
    actions.setScheduleFilter(event.target.value);
  };

  const handleOnlyUnsolvedChange = (event) => {
    actions.setOnlyUnsolved(event.target.checked);
  };
  return (
    <>
      <div className="filter-row">
        <input
          value={filters.search}
          placeholder="搜索题目名或题号"
          onChange={handleSearchChange}
        />
        <select value={filters.platform} onChange={handlePlatformChange}>
          <option value="">全部平台</option>
          <option value="CODEFORCES">Codeforces</option>
          <option value="ATCODER">AtCoder</option>
        </select>
      </div>

      <div className="filter-row">
        <select
          value={filters.reviewStatusFilter}
          onChange={handleReviewStatusChange}
        >
          <option value="">全部状态</option>
          <option value="TODO">待复习</option>
          <option value="REVIEWING">复习中</option>
          <option value="SCHEDULED">已排期</option>
          <option value="DONE">已完成</option>
        </select>
        <select
          value={filters.scheduleFilter}
          onChange={handleScheduleChange}
        >
          <option value="">全部排期</option>
          <option value="DUE">已到期</option>
          <option value="SCHEDULED">有排期</option>
          <option value="UNSCHEDULED">无排期</option>
        </select>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={filters.onlyUnsolved}
            onChange={handleOnlyUnsolvedChange}
          />
          仅显示未通过
        </label>
      </div>
    </>
  );
});
