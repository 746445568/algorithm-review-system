import { memo } from "react";
import { useTranslation } from 'react-i18next';

/**
 * Diagnosis Report Component
 * Displays weekly diagnosis or training suggestions
 * @param {{
 *   title: string,
 *   priority: 'high' | 'mid' | 'low',
 *   priorityLabel: string,
 *   type: 'diagnosis' | 'suggestions',
 *   items: Array,
 *   globalTask: object|null,
 * }} props
 */
export const DiagnosisReport = memo(function DiagnosisReport({
  title,
  priority,
  priorityLabel,
  type,
  globalTask
}) {
  const { t } = useTranslation();

  // Extract data from global task
  const diagnosis = globalTask?.status === "SUCCESS" ? (globalTask.result?.diagnosis || []) : [];
  const suggestions = globalTask?.status === "SUCCESS" ? (globalTask.result?.suggestions || []) : [];

  const data = type === "diagnosis" ? diagnosis : suggestions;

  // Icon mapping for diagnosis items
  const iconMap = {
    "error": { icon: "!", className: "icon-red" },
    "trend": { icon: "↻", className: "icon-blue" },
    "success": { icon: "✓", className: "icon-green" }
  };

  if (type === "diagnosis") {
    return (
      <div className="ai-report-card">
        <div className="ai-report-head">
          <div className="ai-report-title">{title}</div>
          {priority && <span className={`priority ${priority}`}>{priorityLabel}</span>}
        </div>

        <div className="ai-list">
          {data.length > 0 ? (
            data.map((item, index) => {
              const iconInfo = iconMap[item.icon] || iconMap["error"];
              return (
                <div className="ai-list-row" key={index}>
                  <div className={`ai-list-icon ${iconInfo.className}`}>
                    {iconInfo.icon}
                  </div>
                  <div>
                    <div className="ai-row-title">{item.title || t('analysis.diagnosis.item', { index: index + 1 })}</div>
                    <div className="ai-row-text">{item.description || ""}</div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="ai-row-text" style={{ padding: "12px", textAlign: "center", color: "var(--text3)" }}>
              {globalTask?.status === "SUCCESS" ? t('analysis.diagnosis.noDiagnosis') : t('analysis.diagnosis.generateFirst')}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Suggestions type - uses ai-detail-grid
  return (
    <div className="ai-report-card">
      <div className="ai-report-head">
        <div className="ai-report-title">{title}</div>
        {priority && <span className={`priority ${priority}`}>{priorityLabel}</span>}
      </div>

      <div className="ai-detail-grid">
        {data.length > 0 ? (
          data.map((item, index) => (
            <div className="ai-detail" key={index}>
              <div className="ai-detail-title">{item.title || t('analysis.diagnosis.suggestion', { index: index + 1 })}</div>
              <div className="ai-detail-text">{item.description || ""}</div>
            </div>
          ))
        ) : (
          <div className="ai-detail" style={{ gridColumn: "1 / -1" }}>
            <div className="ai-detail-text" style={{ textAlign: "center", color: "var(--text3)" }}>
              {globalTask?.status === "SUCCESS" ? t('analysis.diagnosis.noSuggestions') : t('analysis.diagnosis.generateFirst')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
