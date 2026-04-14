import { memo } from "react";
import { formatDate, tagLabel } from "../../lib/format.js";

export const WeakTagsList = memo(function WeakTagsList({ weakTags, repeatedFailures, recentUnsolved }) {
  return (
    <>
      <section className="panel">
        <div className="panel-header">
          <h3>薄弱标签</h3>
          <span className="caption">正确率最低的知识点</span>
        </div>
        <div className="stack-list">
          {weakTags.length === 0 ? (
            <p className="muted">暂无标签统计数据。</p>
          ) : (
            weakTags.map((item) => (
              <article key={item.tag} className="inline-card">
                <div>
                  <strong>{tagLabel(item.tag)}</strong>
                  <p>{item.attempts} 次尝试</p>
                </div>
                <div className="meta-pill">
                  {item.acRate}%
                  <span>{item.acCount} 次 AC</span>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>反复失败</h3>
          <span className="caption">仍在循环出错的题目</span>
        </div>
        <div className="stack-list">
          {repeatedFailures.length === 0 ? (
            <p className="muted">没有题目超过反复失败阈值。</p>
          ) : (
            repeatedFailures.map((item) => (
              <article key={`${item.problemId}-${item.externalProblemId}`} className="inline-card">
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.externalProblemId}</p>
                </div>
                <div className="meta-pill">{item.failedCount} 次失败</div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>最近未解决</h3>
          <span className="caption">需要复习的新题目</span>
        </div>
        <div className="stack-list">
          {recentUnsolved.length === 0 ? (
            <p className="muted">当前快照中没有未解决的题目。</p>
          ) : (
            recentUnsolved.map((item) => (
              <article key={`${item.problemId}-${item.externalProblemId}`} className="inline-card">
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.externalProblemId}</p>
                </div>
                <div className="meta-pill">{formatDate(item.lastSubmittedAt)}</div>
              </article>
            ))
          )}
        </div>
      </section>
    </>
  );
});
