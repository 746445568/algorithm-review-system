import { memo } from "react";

/**
 * AI Hero Section - Gradient hero with score cards
 * @param {{
 *   period: string,
 *   setPeriod: Function,
 *   globalTask: object|null,
 *   globalLoading: boolean,
 *   onGenerateGlobal: Function,
 * }} props
 */
export const AiHero = memo(function AiHero({
  period,
  setPeriod,
  globalTask,
  globalLoading,
  onGenerateGlobal
}) {
  const handlePeriodChange = (newPeriod) => {
    setPeriod(newPeriod);
  };

  // Extract scores from global task result
  const scores = globalTask?.status === "SUCCESS" ? (globalTask.result?.scores || {}) : {};
  const diagnosisCount = globalTask?.status === "SUCCESS" ? (globalTask.result?.diagnosis?.length || 0) : 0;

  return (
    <div className="ai-hero">
      <div className="ai-hero-title">AI 分析中心</div>
      <div className="ai-hero-desc">
        把提交记录、复盘内容、错误类型和标签掌握情况汇总到一起。这里不是聊天窗口，而是训练诊断面板。
      </div>

      <div className="ai-actions">
        <button
          type="button"
          className="ai-white-btn"
          disabled={globalLoading}
          onClick={onGenerateGlobal}
        >
          {globalLoading ? (
            <>⏳ 正在生成...</>
          ) : (
            "生成本周全局分析"
          )}
        </button>
        <button
          type="button"
          className="ai-ghost-btn"
          onClick={() => {
            // Export functionality - to be implemented
            alert("导出功能开发中");
          }}
        >
          导出训练报告
        </button>
      </div>

      <div className="ai-score-grid">
        <div className="ai-score">
          <div className="ai-score-val">{scores.quality || "--"}%</div>
          <div className="ai-score-label">复盘质量</div>
        </div>
        <div className="ai-score">
          <div className="ai-score-val">{scores.errorTypes || diagnosisCount || "--"}</div>
          <div className="ai-score-label">高频错误类型</div>
        </div>
        <div className="ai-score">
          <div className="ai-score-val">{scores.recommended || "--"}</div>
          <div className="ai-score-label">建议复习题</div>
        </div>
      </div>
    </div>
  );
});
