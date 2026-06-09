import React from "react";
import { useTranslation } from "react-i18next";

export const ReviewTabs = React.memo(function ReviewTabs({
  activeTab,
  setActiveTab,
  hasSubmissions,
  submissionsCount,
}) {
  const { t } = useTranslation();
  const tabs = [
    { id: "state", label: t("review.detail.tabs.state") },
    {
      id: "submissions",
      label: `${t("review.detail.tabs.submissions")}${hasSubmissions ? ` (${submissionsCount})` : ""}`,
    },
    { id: "analysis", label: t("review.detail.tabs.analysis") },
    { id: "chat", label: t("review.detail.tabs.chat", "聊天") },
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
