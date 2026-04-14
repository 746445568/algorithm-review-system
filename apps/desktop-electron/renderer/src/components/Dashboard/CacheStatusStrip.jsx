import { memo } from "react";
import { formatDate } from "../../lib/format.js";

function getFreshnessLabel(meta) {
  if (!meta?.lastSyncedAt) {
    return "未同步";
  }
  return meta.stale ? "缓存可能陈旧" : "已更新";
}

export const CacheStatusStrip = memo(function CacheStatusStrip({ cacheStatus }) {
  return (
    <section className="panel stats-strip full-span">
      <article>
        <span>题库缓存</span>
        <strong>{getFreshnessLabel(cacheStatus.problems)}</strong>
        <small>{formatDate(cacheStatus.problems?.lastSyncedAt)}</small>
      </article>
      <article>
        <span>提交缓存</span>
        <strong>{getFreshnessLabel(cacheStatus.submissions)}</strong>
        <small>{formatDate(cacheStatus.submissions?.lastSyncedAt)}</small>
      </article>
      <article>
        <span>账号缓存</span>
        <strong>{getFreshnessLabel(cacheStatus.accounts)}</strong>
        <small>{formatDate(cacheStatus.accounts?.lastSyncedAt)}</small>
      </article>
      <article>
        <span>复习状态缓存</span>
        <strong>{getFreshnessLabel(cacheStatus.reviewStates)}</strong>
        <small>{formatDate(cacheStatus.reviewStates?.lastSyncedAt)}</small>
      </article>
    </section>
  );
});
