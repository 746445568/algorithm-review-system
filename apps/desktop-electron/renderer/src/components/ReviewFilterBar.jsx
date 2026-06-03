import { memo } from "react";
import { useTranslation } from 'react-i18next';
import { AppSelect } from "./AppControls.jsx";

export const ReviewFilterBar = memo(function ReviewFilterBar({ filters, actions }) {
  const { t } = useTranslation();

  const platformOptions = [
    { value: "", label: t('reviewFilter.allPlatforms') },
    { value: "CODEFORCES", label: "Codeforces" },
    { value: "ATCODER", label: "AtCoder" },
  ];

  const reviewStatusOptions = [
    { value: "", label: t('reviewFilter.allStatuses') },
    { value: "TODO", label: t('statusLabels.TODO') },
    { value: "REVIEWING", label: t('statusLabels.REVIEWING') },
    { value: "SCHEDULED", label: t('statusLabels.SCHEDULED') },
    { value: "DONE", label: t('statusLabels.DONE') },
  ];

  const scheduleOptions = [
    { value: "", label: t('reviewFilter.allSchedules') },
    { value: "DUE", label: t('reviewFilter.due') },
    { value: "SCHEDULED", label: t('reviewFilter.scheduled') },
    { value: "UNSCHEDULED", label: t('reviewFilter.unscheduled') },
  ];

  const handleSearchChange = (event) => {
    actions.setSearch(event.target.value);
  };

  const handleOnlyUnsolvedChange = (event) => {
    actions.setOnlyUnsolved(event.target.checked);
  };
  return (
    <>
      <div className="filter-row">
        <input
          value={filters.search}
          placeholder={t('reviewFilter.searchPlaceholder')}
          onChange={handleSearchChange}
        />
        <AppSelect
          value={filters.platform}
          options={platformOptions}
          onChange={actions.setPlatform}
        />
      </div>

      <div className="filter-row">
        <AppSelect
          value={filters.reviewStatusFilter}
          options={reviewStatusOptions}
          onChange={actions.setReviewStatusFilter}
        />
        <AppSelect
          value={filters.scheduleFilter}
          options={scheduleOptions}
          onChange={actions.setScheduleFilter}
        />
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={filters.onlyUnsolved}
            onChange={handleOnlyUnsolvedChange}
          />
          {t('reviewFilter.onlyUnsolved')}
        </label>
      </div>
    </>
  );
});
