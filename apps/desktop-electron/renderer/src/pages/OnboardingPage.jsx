import { memo, useCallback, useState } from "react";
import { api } from "../lib/api.js";

const STEPS = ["欢迎", "AI 配置", "数据目录", "完成"];

export const OnboardingPage = memo(function OnboardingPage({ onComplete }) {
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
        {STEPS.map((s, i) => (
          <span key={s} className={`onboarding-step${i === step ? " active" : i < step ? " done" : ""}`}>{s}</span>
        ))}
      </div>

      {step === 0 && (
        <div className="onboarding-content">
          <h2>欢迎使用 OJ Review</h2>
          <p>算法竞赛错题复盘工具，支持从 Codeforces 同步提交记录，AI 分析错误原因，间隔重复安排复习。</p>
          <button className="btn-primary" onClick={() => setStep(1)}>开始配置</button>
        </div>
      )}

      {step === 1 && (
        <div className="onboarding-content">
          <h2>配置 AI 分析</h2>
          <label>API Key<input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-..." /></label>
          <label>服务商（provider）<input value={provider} onChange={e => setProvider(e.target.value)} placeholder="openai" /></label>
          <label>API Base URL<input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} /></label>
          <label>模型<input value={model} onChange={e => setModel(e.target.value)} /></label>
          <div className="onboarding-actions">
            <button onClick={() => setStep(0)}>上一步</button>
            <button className="btn-primary" onClick={() => setStep(2)} disabled={!apiKey}>下一步</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="onboarding-content">
          <h2>数据目录</h2>
          <p>数据将存储在系统应用数据目录（<code>%AppData%/OJReviewDesktop</code>），无需额外配置。如需自定义，可在设置页修改后重启。</p>
          <div className="onboarding-actions">
            <button onClick={() => setStep(1)}>上一步</button>
            <button className="btn-primary" onClick={() => setStep(3)}>确认</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="onboarding-content">
          <h2>配置完成</h2>
          <p>已准备就绪，开始使用吧。</p>
          {error && <p className="error">{error}</p>}
          <button className="btn-primary" onClick={handleFinish} disabled={saving}>
            {saving ? "保存中..." : "进入应用"}
          </button>
        </div>
      )}
    </div>
  );
});
