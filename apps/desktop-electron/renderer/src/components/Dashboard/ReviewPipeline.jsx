import { memo } from "react";

export const ReviewPipeline = memo(function ReviewPipeline({ reviewSummary }) {
  if (!reviewSummary) {
    return null;
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h3>复习管线</h3>
        <span className="caption">当前队列概况</span>
      </div>
      <div className="stack-list">
        <article className="inline-card">
          <div>
            <strong>已排期</strong>
            <p>设置了下次复习时间的题目</p>
          </div>
          <div className="meta-pill">{reviewSummary.scheduledReviewCount ?? 0}</div>
        </article>
        <article className="inline-card">
          <div>
            <strong>待复习</strong>
            <p>复习时间已到的题目</p>
          </div>
          <div className="meta-pill">{reviewSummary.dueReviewCount ?? 0}</div>
        </article>
        <article className="inline-card">
          <div>
            <strong>已恢复</strong>
            <p>最终通过 (AC) 的题目</p>
          </div>
          <div className="meta-pill">
            {reviewSummary.problemSummaries?.filter((item) => item.solvedLater).length ?? 0}
          </div>
        </article>
      </div>
    </section>
  );
});
