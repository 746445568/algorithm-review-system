import { useState } from "react";
import { useTranslation } from "react-i18next";
import useSWR from "swr";
import { api } from "../../lib/api.js";
import { desktopBridge } from "../../lib/desktopBridge.js";

function platformLabel(platform) {
  const normalized = String(platform ?? "").toUpperCase();
  if (normalized === "CODEFORCES") return "CF";
  if (normalized === "ATCODER") return "AT";
  return normalized || "OJ";
}

function reasonKey(reason) {
  if (reason === "retry_failed") return "dashboard.recommendation.reasons.retryFailed";
  if (reason === "stretch_zone") return "dashboard.recommendation.reasons.stretchZone";
  return "dashboard.recommendation.reasons.weakestKnowledge";
}

export function LearningRecommendationCard({ serviceStatus, navigateTo }) {
  const { t } = useTranslation();
  const [exclude, setExclude] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState("");

  const { data, error, isLoading, mutate } = useSWR(
    serviceStatus?.state === "healthy" ? ["review-recommendation", exclude] : null,
    ([, currentExclude]) => api.getReviewRecommendation(currentExclude),
    { keepPreviousData: true, refreshInterval: 60000 }
  );

  const problem = data?.problem ?? null;

  async function handleStart() {
    if (problem?.url) {
      if (desktopBridge.isAvailable()) {
        await desktopBridge.openExternal(problem.url);
      } else {
        window.open(problem.url, "_blank", "noopener,noreferrer");
      }
      return;
    }
    navigateTo("review");
  }

  function handleNext() {
    if (problem?.key) {
      setExclude(problem.key);
      return;
    }
    void mutate();
  }

  async function handleSyncPool() {
    setSyncing(true);
    setNotice("");
    try {
      await api.syncProblemPool();
      setNotice(t("dashboard.recommendation.syncQueued"));
      await mutate();
    } catch (syncError) {
      setNotice(syncError?.message || t("dashboard.recommendation.syncFailed"));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <section className="panel dash-recommend-card">
      <div className="dash-panel-head">
        <div>
          <div className="dash-panel-title">{t("dashboard.recommendation.title")}</div>
          <div className="dash-panel-sub">
            {problem
              ? t(reasonKey(problem.reason))
              : t("dashboard.recommendation.subtitle")}
          </div>
        </div>
        <button
          type="button"
          className="dash-btn-ghost dash-btn-compact"
          onClick={handleSyncPool}
          disabled={syncing || serviceStatus?.state !== "healthy"}
        >
          {syncing ? t("dashboard.recommendation.syncing") : t("dashboard.recommendation.syncPool")}
        </button>
      </div>

      {error ? (
        <p className="dash-muted">{t("dashboard.recommendation.loadFailed", { error: error.message })}</p>
      ) : isLoading && !problem ? (
        <p className="dash-muted">{t("common.loading")}</p>
      ) : problem ? (
        <div className="dash-recommend-body">
          <div className="dash-recommend-main">
            <span className={`dash-chip ${problem.platform === "ATCODER" ? "chip-at" : "chip-cf"}`}>
              {platformLabel(problem.platform)}
            </span>
            <div className="dash-recommend-title-wrap">
              <div className="dash-recommend-title">{problem.title}</div>
              <div className="dash-recommend-meta">
                {problem.externalProblemId}
                {problem.difficulty ? ` · ${problem.difficulty}` : ""}
                {problem.knowledgeName ? ` · ${problem.knowledgeName}` : ""}
              </div>
            </div>
          </div>

          {problem.tags?.length ? (
            <div className="dash-recommend-tags">
              {problem.tags.slice(0, 4).map((tag) => (
                <span key={tag} className="dash-chip chip-warn">{tag}</span>
              ))}
            </div>
          ) : null}

          <div className="dash-recommend-actions">
            <button type="button" className="dash-hero-cta dash-recommend-primary" onClick={handleStart}>
              {t("dashboard.recommendation.start")}
            </button>
            <button type="button" className="dash-btn-ghost" onClick={handleNext}>
              {t("dashboard.recommendation.next")}
            </button>
          </div>
        </div>
      ) : (
        <div className="dash-empty-action">
          <p className="dash-muted">{t("dashboard.recommendation.empty")}</p>
          <button
            type="button"
            className="dash-btn-ghost"
            onClick={handleSyncPool}
            disabled={syncing || serviceStatus?.state !== "healthy"}
          >
            {syncing ? t("dashboard.recommendation.syncing") : t("dashboard.recommendation.syncPool")}
          </button>
        </div>
      )}

      {notice ? <p className="dash-recommend-notice">{notice}</p> : null}
    </section>
  );
}
