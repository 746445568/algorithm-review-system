import { memo } from "react";
import { useTranslation } from 'react-i18next';
import { formatDate } from "../../lib/format.js";

function getFreshnessLabel(meta, t) {
  if (!meta?.lastSyncedAt) {
    return t('dashboard.cache.notSynced');
  }
  return meta.stale ? t('dashboard.cache.maybeStale') : t('dashboard.cache.updated');
}

export const CacheStatusStrip = memo(function CacheStatusStrip({ cacheStatus }) {
  const { t } = useTranslation();
  return (
    <section className="panel stats-strip full-span">
      <article>
        <span>{t('dashboard.cache.problemCache')}</span>
        <strong>{getFreshnessLabel(cacheStatus.problems, t)}</strong>
        <small>{formatDate(cacheStatus.problems?.lastSyncedAt)}</small>
      </article>
      <article>
        <span>{t('dashboard.cache.submissionCache')}</span>
        <strong>{getFreshnessLabel(cacheStatus.submissions, t)}</strong>
        <small>{formatDate(cacheStatus.submissions?.lastSyncedAt)}</small>
      </article>
      <article>
        <span>{t('dashboard.cache.accountCache')}</span>
        <strong>{getFreshnessLabel(cacheStatus.accounts, t)}</strong>
        <small>{formatDate(cacheStatus.accounts?.lastSyncedAt)}</small>
      </article>
      <article>
        <span>{t('dashboard.cache.reviewStateCache')}</span>
        <strong>{getFreshnessLabel(cacheStatus.reviewStates, t)}</strong>
        <small>{formatDate(cacheStatus.reviewStates?.lastSyncedAt)}</small>
      </article>
    </section>
  );
});
