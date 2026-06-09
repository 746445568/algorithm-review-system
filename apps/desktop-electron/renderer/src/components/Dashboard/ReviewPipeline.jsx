import { memo } from "react";
import { useTranslation } from 'react-i18next';

export const ReviewPipeline = memo(function ReviewPipeline({ reviewSummary }) {
  const { t } = useTranslation();
  if (!reviewSummary) {
    return null;
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h3>{t('dashboard.pipeline.title')}</h3>
        <span className="caption">{t('dashboard.pipeline.caption')}</span>
      </div>
      <div className="stack-list">
        <article className="inline-card">
          <div>
            <strong>{t('dashboard.pipeline.scheduled')}</strong>
            <p>{t('dashboard.pipeline.scheduledDesc')}</p>
          </div>
          <div className="meta-pill">{reviewSummary.scheduledReviewCount ?? 0}</div>
        </article>
        <article className="inline-card">
          <div>
            <strong>{t('dashboard.pipeline.dueReview')}</strong>
            <p>{t('dashboard.pipeline.dueReviewDesc')}</p>
          </div>
          <div className="meta-pill">{reviewSummary.dueReviewCount ?? 0}</div>
        </article>
        <article className="inline-card">
          <div>
            <strong>{t('dashboard.pipeline.recovered')}</strong>
            <p>{t('dashboard.pipeline.recoveredDesc')}</p>
          </div>
          <div className="meta-pill">
            {reviewSummary.problemSummaries?.filter((item) => item.solvedLater).length ?? 0}
          </div>
        </article>
      </div>
    </section>
  );
});
