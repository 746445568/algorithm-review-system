import { memo } from "react";
import { useTranslation } from 'react-i18next';
import { formatDate, tagLabel } from "../../lib/format.js";

export const WeakTagsList = memo(function WeakTagsList({ weakTags, repeatedFailures, recentUnsolved }) {
  const { t } = useTranslation();
  return (
    <>
      <section className="panel">
        <div className="panel-header">
          <h3>{t('dashboard.weakTags.title')}</h3>
          <span className="caption">{t('dashboard.weakTags.caption')}</span>
        </div>
        <div className="stack-list">
          {weakTags.length === 0 ? (
            <p className="muted">{t('dashboard.weakTags.noData')}</p>
          ) : (
            weakTags.map((item) => (
              <article key={item.tag} className="inline-card">
                <div>
                  <strong>{tagLabel(item.tag)}</strong>
                  <p>{t('dashboard.weakTags.attempts', { count: item.attempts })}</p>
                </div>
                <div className="meta-pill">
                  {item.acRate}%
                  <span>{t('dashboard.weakTags.acCount', { count: item.acCount })}</span>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>{t('dashboard.weakTags.repeatedFailuresTitle')}</h3>
          <span className="caption">{t('dashboard.weakTags.repeatedFailuresCaption')}</span>
        </div>
        <div className="stack-list">
          {repeatedFailures.length === 0 ? (
            <p className="muted">{t('dashboard.weakTags.noRepeatedFailures')}</p>
          ) : (
            repeatedFailures.map((item) => (
              <article key={`${item.problemId}-${item.externalProblemId}`} className="inline-card">
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.externalProblemId}</p>
                </div>
                <div className="meta-pill">{t('dashboard.weakTags.failedCount', { count: item.failedCount })}</div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>{t('dashboard.weakTags.recentUnsolvedTitle')}</h3>
          <span className="caption">{t('dashboard.weakTags.recentUnsolvedCaption')}</span>
        </div>
        <div className="stack-list">
          {recentUnsolved.length === 0 ? (
            <p className="muted">{t('dashboard.weakTags.noUnsolved')}</p>
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
