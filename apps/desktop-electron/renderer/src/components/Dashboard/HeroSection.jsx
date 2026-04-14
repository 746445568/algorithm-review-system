import { memo } from "react";
import { statusLabel } from "../../lib/format.js";

export const HeroSection = memo(function HeroSection({ serviceStatus, connectivity, data, latestAnalysis, navigateTo }) {
  return (
    <>
      <section className="dash-ai-card">
        <div className="dash-ai-header">
          <span className="dash-ai-title">🤖 AI 分析</span>
          {latestAnalysis ? (
            <span className="muted">{latestAnalysis.period === "week" ? "本周" : "本月"} · {new Date(latestAnalysis.updatedAt).toLocaleString('zh-CN')}</span>
          ) : (
            <span className="muted">暂无历史记录</span>
          )}
        </div>
        {latestAnalysis ? (
          <>
            <p className="dash-ai-preview">
              {latestAnalysis.resultText?.slice(0, 80)}…
            </p>
            <button
              type="button"
              className="ghost-button"
              onClick={() => navigateTo("analysis")}
            >
              进入分析页 →
            </button>
          </>
        ) : (
          <button
            type="button"
            className="primary-button"
            onClick={() => navigateTo("analysis")}
          >
            生成首份分析
          </button>
        )}
      </section>

      <section className="panel hero-panel">
        <div className="hero-copy">
          <span className="section-label">
            {serviceStatus.state === "healthy" ? "已连接" : "连接中"}
          </span>
          <h3>
            {serviceStatus.state === "healthy"
              ? `欢迎回来，${data.accounts[0]?.externalHandle || "开发者"}`
              : "OJ 错题复盘 正在启动"}
          </h3>
          <p>
            {serviceStatus.state === "healthy"
              ? `当前有 ${data.reviewSummary?.dueReviewCount ?? 0} 道题目等待复习，${data.reviewSummary?.totalSubmissions ?? 0} 次提交记录已同步。`
              : "正在连接本地 Go 服务..."}
          </p>
        </div>
        <div className="hero-stats">
          <div className={serviceStatus.state === "healthy" ? "stat-good" : ""}>
            <span>服务状态</span>
            <strong>{statusLabel(serviceStatus.state)}</strong>
          </div>
          <div>
            <span>网络判定</span>
            <strong>{connectivity === "service-unreachable" ? "服务不可达" : connectivity === "offline" ? "离线" : "在线"}</strong>
          </div>
          <div className={data.reviewSummary?.dueReviewCount > 0 ? "stat-accent" : ""}>
            <span>待复习</span>
            <strong>{data.reviewSummary?.dueReviewCount ?? 0}</strong>
          </div>
          <div>
            <span>待同步操作</span>
            <strong>{data.syncTasks.length}</strong>
          </div>
        </div>
      </section>
    </>
  );
});
