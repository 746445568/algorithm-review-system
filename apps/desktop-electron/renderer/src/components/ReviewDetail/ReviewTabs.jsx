import React from "react";

export const ReviewTabs = React.memo(function ReviewTabs({
  activeTab,
  setActiveTab,
  hasSubmissions,
  submissionsCount,
}) {
  const tabs = [
    { id: "state", label: "复习状态" },
    {
      id: "submissions",
      label: `提交记录${hasSubmissions ? ` (${submissionsCount})` : ""}`,
    },
    { id: "raw", label: "原始数据" },
    { id: "analysis", label: "AI 分析" },
  ];

  return (
    <div className="rd-tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`rd-tab${activeTab === tab.id ? " rd-tab--active" : ""}`}
          onClick={() => setActiveTab(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
});
