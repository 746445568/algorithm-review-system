import { memo } from "react";
import { useTranslation } from 'react-i18next';

/**
 * AI Hero Section - Gradient hero with score cards
 * @param {{
 *   period: string,
 *   setPeriod: Function,
 *   globalTask: object|null,
 *   globalLoading: boolean,
 *   onGenerateGlobal: Function,
 * }} props
 */
export const AiHero = memo(function AiHero({
  period,
  setPeriod,
  globalTask,
  globalLoading,
  onGenerateGlobal
}) {
  const { t } = useTranslation();

  const handlePeriodChange = (newPeriod) => {
    setPeriod(newPeriod);
  };

  // Extract scores from global task result
  const scores = globalTask?.status === "SUCCESS" ? (globalTask.result?.scores || {}) : {};
  const diagnosisCount = globalTask?.status === "SUCCESS" ? (globalTask.result?.diagnosis?.length || 0) : 0;

  return (
    <div className="ai-hero">
      <div className="ai-hero-title">{t('analysis.hero.title')}</div>
      <div className="ai-hero-desc">
        {t('analysis.hero.description')}
      </div>

      <div className="ai-actions">
        <button
          type="button"
          className="ai-white-btn"
          disabled={globalLoading}
          onClick={onGenerateGlobal}
        >
          {globalLoading ? (
            <>{t('analysis.hero.generating')}</>
          ) : (
            t('analysis.hero.generateWeekly')
          )}
        </button>
        <button
          type="button"
          className="ai-ghost-btn"
          onClick={() => {
            // Export functionality - to be implemented
            alert(t('analysis.hero.exportWip'));
          }}
        >
          {t('analysis.hero.exportReport')}
        </button>
      </div>

      <div className="ai-score-grid">
        <div className="ai-score">
          <div className="ai-score-val">{scores.quality || "--"}%</div>
          <div className="ai-score-label">{t('analysis.hero.reviewQuality')}</div>
        </div>
        <div className="ai-score">
          <div className="ai-score-val">{scores.errorTypes || diagnosisCount || "--"}</div>
          <div className="ai-score-label">{t('analysis.hero.frequentErrors')}</div>
        </div>
        <div className="ai-score">
          <div className="ai-score-val">{scores.recommended || "--"}</div>
          <div className="ai-score-label">{t('analysis.hero.recommendedReview')}</div>
        </div>
      </div>
    </div>
  );
});
