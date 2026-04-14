import { useCallback, useState } from "react";

/**
 * 错误页面降级 UI 组件
 * 用于 ErrorBoundary 捕获错误后显示
 *
 * @param {Object} props
 * @param {string} [props.title] - 错误标题
 * @param {string} [props.message] - 错误描述
 * @param {Function} [props.onRetry] - 重试回调
 * @param {boolean} [props.showHomeButton] - 是否显示返回主页按钮
 */
export function ErrorPageFallback({
  title = "页面发生错误",
  message = "抱歉，页面加载时出现了问题。您可以尝试重新加载或返回主页。",
  onRetry,
  showHomeButton = true,
}) {
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = useCallback(async () => {
    if (onRetry) {
      setIsRetrying(true);
      try {
        await onRetry();
      } finally {
        setIsRetrying(false);
      }
    } else {
      // 默认重试：刷新当前页面
      window.location.reload();
    }
  }, [onRetry]);

  return (
    <div className="error-page-fallback">
      <div className="error-page-content">
        <div className="error-page-icon">
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>

        <h2 className="error-page-title">{title}</h2>
        <p className="error-page-message">{message}</p>

        <div className="error-page-actions">
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={handleRetry}
            disabled={isRetrying}
          >
            {isRetrying ? "加载中..." : "重新加载"}
          </button>

          {showHomeButton && (
            <button
              type="button"
              className="btn btn-secondary btn-lg"
              onClick={() => (window.location.href = "/")}
            >
              返回主页
            </button>
          )}
        </div>

        <div className="error-page-tips">
          <p>提示：如果问题持续，请尝试：</p>
          <ul>
            <li>清除浏览器缓存</li>
            <li>检查网络连接</li>
            <li>重启应用程序</li>
          </ul>
        </div>
      </div>

      <style>{`
        .error-page-fallback {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 400px;
          padding: 2rem;
          text-align: center;
        }

        .error-page-content {
          max-width: 480px;
        }

        .error-page-icon {
          margin-bottom: 1.5rem;
          color: var(--color-text-muted, #6c757d);
        }

        .error-page-title {
          font-size: 1.5rem;
          font-weight: 600;
          margin-bottom: 1rem;
          color: var(--color-text, #212529);
        }

        .error-page-message {
          color: var(--color-text-muted, #6c757d);
          margin-bottom: 2rem;
          line-height: 1.6;
        }

        .error-page-actions {
          display: flex;
          gap: 1rem;
          justify-content: center;
          margin-bottom: 2rem;
        }

        .error-page-tips {
          text-align: left;
          background: var(--color-bg-soft, #f8f9fa);
          padding: 1rem;
          border-radius: 8px;
          font-size: 0.875rem;
        }

        .error-page-tips p {
          margin: 0 0 0.5rem;
          font-weight: 500;
        }

        .error-page-tips ul {
          margin: 0;
          padding-left: 1.25rem;
        }

        .error-page-tips li {
          margin-bottom: 0.25rem;
          color: var(--color-text-muted, #6c757d);
        }

        [data-theme="dark"] .error-page-tips {
          background: var(--color-surface-elevated, #2d2d2d);
        }

        @media (max-width: 640px) {
          .error-page-actions {
            flex-direction: column;
          }

          .error-page-fallback {
            padding: 1rem;
          }
        }
      `}</style>
    </div>
  );
}

export default ErrorPageFallback;
