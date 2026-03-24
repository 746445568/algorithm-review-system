export function ReviewFilterBar({ filters, actions }) {
  return (
    <>
      <div className="filter-row">
        <input
          value={filters.search}
          placeholder="搜索题目名或题号"
          onChange={(event) => actions.setSearch(event.target.value)}
        />
        <select value={filters.platform} onChange={(event) => actions.setPlatform(event.target.value)}>
          <option value="">全部平台</option>
          <option value="CODEFORCES">Codeforces</option>
          <option value="ATCODER">AtCoder</option>
        </select>
      </div>

      <div className="filter-row">
        <select
          value={filters.reviewStatusFilter}
          onChange={(event) => actions.setReviewStatusFilter(event.target.value)}
        >
          <option value="">全部状态</option>
          <option value="TODO">待复习</option>
          <option value="REVIEWING">复习中</option>
          <option value="SCHEDULED">已排期</option>
          <option value="DONE">已完成</option>
        </select>
        <select
          value={filters.scheduleFilter}
          onChange={(event) => actions.setScheduleFilter(event.target.value)}
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
            onChange={(event) => actions.setOnlyUnsolved(event.target.checked)}
          />
          仅显示未通过
        </label>
      </div>
    </>
  );
}
