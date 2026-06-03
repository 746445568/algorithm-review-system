import { memo, useCallback, useState } from "react";
import { useTranslation } from 'react-i18next';
import { api } from "../lib/api.js";



export const OnboardingPage = memo(function OnboardingPage({ onComplete }) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [model, setModel] = useState("gpt-4o-mini");
  const [provider, setProvider] = useState("openai");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleFinish = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await api.saveAISettings({ apiKey, baseUrl, model, provider });
      onComplete();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }, [apiKey, baseUrl, model, provider, onComplete]);

  return (
    <div className="onboarding-page">
      <div className="onboarding-steps">
        {[t('onboarding.stepWelcome'), t('onboarding.stepAiConfig'), t('onboarding.stepDataDir'), t('onboarding.stepDone')].map((s, i) => (
          <span key={s} className={`onboarding-step${i === step ? " active" : i < step ? " done" : ""}`}>{s}</span>
        ))}
      </div>

      {step === 0 && (
        <div className="onboarding-content">
          <h2>{t('onboarding.welcome')}</h2>
          <p>{t('onboarding.welcomeDesc')}</p>
          <button className="btn-primary" onClick={() => setStep(1)}>{t('onboarding.startConfig')}</button>
        </div>
      )}

      {step === 1 && (
        <div className="onboarding-content">
          <h2>{t('onboarding.configAi')}</h2>
          <label>API Key<input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-..." /></label>
          <label>{t('onboarding.provider')}<input value={provider} onChange={e => setProvider(e.target.value)} placeholder="openai" /></label>
          <label>API Base URL<input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} /></label>
          <label>{t('onboarding.model')}<input value={model} onChange={e => setModel(e.target.value)} /></label>
          <div className="onboarding-actions">
            <button onClick={() => setStep(0)}>{t('onboarding.prev')}</button>
            <button className="btn-primary" onClick={() => setStep(2)} disabled={!apiKey}>{t('onboarding.next')}</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="onboarding-content">
          <h2>{t('onboarding.dataDir')}</h2>
          <p>{t('onboarding.dataDirDesc')}</p>
          <div className="onboarding-actions">
            <button onClick={() => setStep(1)}>{t('onboarding.prev')}</button>
            <button className="btn-primary" onClick={() => setStep(3)}>{t('actions.confirm')}</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="onboarding-content">
          <h2>{t('onboarding.configDone')}</h2>
          <p>{t('onboarding.readyToUse')}</p>
          {error && <p className="error">{error}</p>}
          <button className="btn-primary" onClick={handleFinish} disabled={saving}>
            {saving ? t('onboarding.saving') : t('onboarding.enterApp')}
          </button>
        </div>
      )}
    </div>
  );
});
