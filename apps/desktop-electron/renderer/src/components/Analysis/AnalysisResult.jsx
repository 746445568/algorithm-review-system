import { memo } from "react";
import { formatDate } from "../../lib/format.js";
import { SimpleMarkdown } from "../SimpleMarkdown.jsx";

/**
 * 加载状态显示组件
 * @param {{ task: object|null, isSmall?: boolean }} props
 */
export const LoadingState = memo(function LoadingState({ task, isSmall = false }) {
  return (
    <div className={`an-progress ${isSmall ? "an-progress--small" : ""}`}>
      <span className="an-spinner" />
      <span>
        {!task && "正在提交…"}
        {task?.status === "PENDING" && "排队等待中…"}
        {task?.status === "RUNNING" && "AI 分析中，请稍候…"}
      </span>
    </div>
  );
});

/**
 * 错误消息组件
 * @param {{ message: string, isSmall?: boolean }} props
 */
export const ErrorMessage = memo(function ErrorMessage({ message, isSmall = false }) {
  return (
    <div className={`an-error-msg ${isSmall ? "an-error-msg--small" : ""}`}>
      {message}
    </div>
  );
});

/**
 * 分析结果展示组件
 * @param {{ task: object, isCompact?: boolean }} props
 */
export const AnalysisResult = memo(function AnalysisResult({ task, isCompact = false }) {
  return (
    <div className={`an-result ${isCompact ? "an-result--compact" : ""}`}>
      <div className="an-result-meta">
        <span className="an-provider-badge">{task.provider}</span>
        <span className="muted">·</span>
        {task.model && (
          <>
            <span className="muted">{task.model}</span>
            <span className="muted">·</span>
          </>
        )}
        <span className="muted">{formatDate(task.updatedAt)}</span>
      </div>
      <div className="an-result-body">
        <SimpleMarkdown text={task.resultText} />
      </div>
    </div>
  );
});

/**
 * 失败状态组件
 * @param {{ task: object, onRetry?: Function, isSmall?: boolean }} props
 */
export const FailedState = memo(function FailedState({ task, onRetry, isSmall = false }) {
  return (
    <div className={`an-failed ${isSmall ? "an-failed--small" : ""}`}>
      <p className="an-error-msg">{task.errorMessage || "分析任务失败，请重试"}</p>
      {onRetry && (
        <button
          type="button"
          className="ghost-button"
          onClick={onRetry}
        >
          重试
        </button>
      )}
    </div>
  );
});
