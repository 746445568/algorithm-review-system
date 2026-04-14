import React from "react";
import { formatDate } from "../../../lib/format.js";
import { SimpleMarkdown } from "../../../components/SimpleMarkdown.jsx";

export const AnalysisTab = React.memo(function AnalysisTab({
  analysisTask,
  analysisLoading,
  analysisError,
  serviceUnavailable,
  selectedProblemId,
  handleGenerateAnalysis,
  handleAnalysisReset,
  navigateTo,
}) {
  // Empty / error state
  if (!analysisTask && !analysisLoading) {
    return (
      <div className="panel rd-ai-panel">
        <div className="rd-ai-empty">
          <p className="rd-ai-hint">
            基于全部复习数据生成个性化弱点分析，帮助你找到最需要补强的知识点。
          </p>
          {analysisError && (
            <p className="rd-ai-error-msg">
              {analysisError.includes("provider and model are required")
                ? "请先在设置页面配置 AI 服务（提供商 + 模型 + API Key）"
                : `分析失败：${analysisError}`}
            </p>
          )}
          <button
            type="button"
            className="primary-button"
            disabled={serviceUnavailable}
            onClick={() => void handleGenerateAnalysis()}
          >
            生成 AI 分析
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() =>
              navigateTo("analysis", { problemId: selectedProblemId })
            }
          >
            在分析页查看 →
          </button>
          {serviceUnavailable && (
            <p className="muted" style={{ fontSize: 12 }}>
              等待本地服务就绪…
            </p>
          )}
        </div>
      </div>
    );
  }

  // Submitting / polling progress
  if (
    analysisLoading ||
    (analysisTask &&
      analysisTask.status !== "SUCCESS" &&
      analysisTask.status !== "FAILED")
  ) {
    return (
      <div className="panel rd-ai-panel">
        <div className="rd-ai-progress">
          <span className="rd-spinner" />
          <span>
            {!analysisTask && "正在提交…"}
            {analysisTask?.status === "PENDING" && "排队等待中…"}
            {analysisTask?.status === "RUNNING" && "AI 分析中，请稍候…"}
          </span>
          {analysisTask && (
            <span className="rd-ai-provider-hint muted">
              {analysisTask.provider} · {analysisTask.model}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Failed state
  if (analysisTask?.status === "FAILED") {
    return (
      <div className="panel rd-ai-panel">
        <div className="rd-ai-failed">
          <p className="rd-ai-error-msg">
            {analysisTask.errorMessage || "分析任务失败，请重试"}
          </p>
          <button
            type="button"
            className="ghost-button"
            onClick={() => handleAnalysisReset()}
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  // Success state
  if (analysisTask?.status === "SUCCESS") {
    return (
      <div className="panel rd-ai-panel">
        <div className="rd-ai-result-area">
          <div className="rd-ai-meta">
            <span className="rd-ai-provider-badge">
              {analysisTask.provider}
            </span>
            <span className="muted">·</span>
            <span className="muted">{analysisTask.model}</span>
            <span className="muted">·</span>
            <span className="muted">{formatDate(analysisTask.updatedAt)}</span>
            <button
              type="button"
              className="ghost-button rd-ai-regen-btn"
              disabled={analysisLoading}
              onClick={() => void handleGenerateAnalysis()}
            >
              重新生成
            </button>
          </div>
          <div className="rd-ai-result">
            <SimpleMarkdown text={analysisTask.resultText} />
          </div>
        </div>
      </div>
    );
  }

  return null;
});
