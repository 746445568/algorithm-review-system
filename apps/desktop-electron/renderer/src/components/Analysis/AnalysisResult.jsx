import { memo } from "react";
import { useTranslation } from 'react-i18next';
import { formatDate } from "../../lib/format.js";
import { SimpleMarkdown } from "../SimpleMarkdown.jsx";

/**
 * 加载状态显示组件
 * @param {{ task: object|null, isSmall?: boolean }} props
 */
export const LoadingState = memo(function LoadingState({ task, isSmall = false }) {
  const { t } = useTranslation();

  return (
    <div className={`an-progress ${isSmall ? "an-progress--small" : ""}`}>
      <span className="an-spinner" />
      <span>
        {!task && t('analysis.status.submitting')}
        {task?.status === "PENDING" && t('analysis.status.queuing')}
        {task?.status === "RUNNING" && t('analysis.status.analyzing')}
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
  const { t } = useTranslation();

  return (
    <div className={`an-failed ${isSmall ? "an-failed--small" : ""}`}>
      <p className="an-error-msg">{task.errorMessage || t('analysis.status.failedRetry')}</p>
      {onRetry && (
        <button
          type="button"
          className="ghost-button"
          onClick={onRetry}
        >
          {t('actions.retry')}
        </button>
      )}
    </div>
  );
});
