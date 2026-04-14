import { Component } from "react";
import { error as logError } from "../lib/logger.js";

/**
 * 错误边界组件 - 捕获子组件树中的 JavaScript 错误
 *
 * 使用方式:
 * <ErrorBoundary fallback={<ErrorPageFallback />}>
 *   <YourComponent />
 * </ErrorBoundary>
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - 被包裹的子组件
 * @param {React.ReactNode} [props.fallback] - 错误发生时显示的降级 UI
 * @param {string} [props.moduleName] - 模块名称，用于日志记录
 * @param {Function} [props.onError] - 错误发生时的回调函数
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
    this.handleReset = this.handleReset.bind(this);
  }

  /**
   * static getDerivedStateFromError - 当子组件抛出错误时更新 state
   * @param {Error} error - 捕获到的错误
   * @returns {Object} 新的 state
   */
  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
    };
  }

  /**
   * componentDidCatch - 记录错误详情
   * @param {Error} error - 捕获到的错误
   * @param {Object} errorInfo - 错误信息，包括组件堆栈
   */
  componentDidCatch(error, errorInfo) {
    const moduleName = this.props.moduleName || "UnknownModule";

    logError(
      `组件崩溃：${moduleName}`,
      "ErrorBoundary",
      error,
      "\n组件堆栈:",
      errorInfo.componentStack
    );

    this.setState({ errorInfo });

    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  /**
   * 处理重置/重新加载
   */
  handleReset() {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  }

  /**
   * 渲染错误降级 UI
   * @returns {React.ReactNode}
   */
  renderError() {
    const { error, errorInfo } = this.state;
    const moduleName = this.props.moduleName || "组件";

    return (
      <div className="error-boundary-fallback">
        <div className="error-boundary-icon">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h3 className="error-boundary-title">{moduleName} 发生错误</h3>
        <p className="error-boundary-message">
          抱歉，{moduleName} 出现了问题。您可以尝试重新加载或返回主页。
        </p>
        {error && (
          <details className="error-boundary-details">
            <summary>错误详情</summary>
            <p className="error-boundary-error-message">
              <strong>错误:</strong> {error.message}
            </p>
            {errorInfo && (
              <pre className="error-boundary-stack">
                {errorInfo.componentStack}
              </pre>
            )}
          </details>
        )}
        <div className="error-boundary-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={this.handleReset}
          >
            重新加载
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => window.location.href = "/"}
          >
            返回主页
          </button>
        </div>
      </div>
    );
  }

  /**
   * 渲染主内容
   * @returns {React.ReactNode}
   */
  render() {
    if (this.state.hasError) {
      // 使用自定义 fallback 或默认错误 UI
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return this.renderError();
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
