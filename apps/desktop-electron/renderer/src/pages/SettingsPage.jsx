import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api.js";
import { statusLabel } from "../lib/format.js";
import { useNavigation } from "../lib/NavigationContext.jsx";
import { AccountsPage } from "./AccountsPage.jsx";
import { AppDatePicker, AppSelect } from "../components/AppControls.jsx";

const defaultAISettings = {
  provider: "",
  model: "",
  baseUrl: "",
  apiKey: "",
  hasApiKey: false,
};

const defaultGoalForm = {
  platform: "CODEFORCES",
  targetRating: "",
  title: "",
  deadline: "",
};

const goalPlatformOptions = [
  { value: "CODEFORCES", label: "Codeforces" },
  { value: "ATCODER", label: "AtCoder" },
];

const languageOptions = [
  { value: "zh-CN", label: "简体中文" },
  { value: "en-US", label: "English" },
];

function platformLabel(platform) {
  return goalPlatformOptions.find((option) => option.value === platform)?.label ?? platform;
}

function translatedStatus(t, status) {
  const key = (status || "UNKNOWN").toUpperCase();
  return t(`statusLabels.${key}`, { defaultValue: statusLabel(status) });
}

function formatGoalDeadline(deadline, language = "zh-CN") {
  if (!deadline) return "";
  return new Date(deadline).toLocaleDateString(language);
}

export function SettingsPage({ runtimeInfo, serviceStatus }) {
  const { t, i18n } = useTranslation();
  const { navigationState } = useNavigation();
  const goalsSectionRef = useRef(null);
  const refreshSequenceRef = useRef(0);

  const [aiSettings, setAISettings] = useState(defaultAISettings);
  const [goals, setGoals] = useState([]);
  const [goalForm, setGoalForm] = useState(defaultGoalForm);
  const [language, setLanguage] = useState(() => i18n.language || "zh-CN");
  const [loading, setLoading] = useState(true);
  const [savingLanguage, setSavingLanguage] = useState(false);
  const [savingAI, setSavingAI] = useState(false);
  const [testingAI, setTestingAI] = useState(false);
  const [savingGoal, setSavingGoal] = useState(false);
  const [deletingGoalId, setDeletingGoalId] = useState(null);
  const [diagExporting, setDiagExporting] = useState(false);
  const [diagPath, setDiagPath] = useState("");
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [updateInfo, setUpdateInfo] = useState(null);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [checking, setChecking] = useState(false);
  const providerOptions = [
    { value: "openai", label: t("settings.ai.providers.openai") },
    { value: "deepseek", label: "DeepSeek" },
    { value: "ollama", label: "Ollama" },
  ];

  useEffect(() => {
    const bridge = window.desktopBridge?.updater;
    if (!bridge) return undefined;
    const unsubAvailable = bridge.onUpdateAvailable((info) => setUpdateInfo(info));
    const unsubDownloaded = bridge.onUpdateDownloaded(() => setUpdateDownloaded(true));
    return () => {
      unsubAvailable();
      unsubDownloaded();
    };
  }, []);

  useEffect(() => {
    if (navigationState?.focus !== "goals") return;
    const timeoutId = window.setTimeout(() => {
      goalsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(timeoutId);
  }, [navigationState?.focus]);

  function handleCheckUpdate() {
    setChecking(true);
    window.desktopBridge?.updater?.check?.().finally(() => setChecking(false));
  }

  const refresh = useCallback(async () => {
    const requestId = refreshSequenceRef.current + 1;
    refreshSequenceRef.current = requestId;

    if (serviceStatus.state !== "healthy") {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const [nextAISettings, nextGoals, nextLanguage] = await Promise.all([
        api.getAISettings(),
        api.getGoals(),
        api.getLanguage(),
      ]);

      if (requestId !== refreshSequenceRef.current) {
        return;
      }

      setAISettings({
        provider: nextAISettings?.provider ?? "",
        model: nextAISettings?.model ?? "",
        baseUrl: nextAISettings?.baseUrl ?? "",
        apiKey: "",
        hasApiKey: Boolean(nextAISettings?.hasApiKey),
      });
      setGoals(Array.isArray(nextGoals) ? nextGoals : []);
      const loadedLanguage = nextLanguage?.language || "zh-CN";
      setLanguage(loadedLanguage);
      if (i18n.language !== loadedLanguage) {
        void i18n.changeLanguage(loadedLanguage);
      }
    } catch (nextError) {
      if (requestId !== refreshSequenceRef.current) {
        return;
      }
      setError(nextError.message);
    } finally {
      if (requestId === refreshSequenceRef.current) {
        setLoading(false);
      }
    }
  }, [i18n, serviceStatus.state]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const serviceUnavailable = serviceStatus.state !== "healthy";

  async function saveLanguage(value) {
    setSavingLanguage(true);
    setError("");
    setNotice("");
    setLanguage(value);

    try {
      await api.saveLanguage(value);
      await i18n.changeLanguage(value);
      setNotice(t("settings.language.updated"));
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setSavingLanguage(false);
    }
  }

  async function saveAISettings() {
    setSavingAI(true);
    setError("");
    setNotice("");
    setTestResult(null);

    try {
      await api.saveAISettings(aiSettings);
      setAISettings((current) => ({
        ...current,
        apiKey: "",
        hasApiKey: current.hasApiKey || current.apiKey.trim() !== "",
      }));
      setNotice(t("settings.ai.saved"));
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setSavingAI(false);
    }
  }

  async function clearAIKey() {
    setSavingAI(true);
    setError("");
    try {
      await api.saveAISettings({ ...aiSettings, apiKey: "", clearApiKey: true });
      setAISettings((current) => ({ ...current, apiKey: "", hasApiKey: false }));
      setNotice(t("settings.ai.keyCleared"));
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setSavingAI(false);
    }
  }

  async function testAISettings() {
    setTestingAI(true);
    setError("");
    setNotice("");
    setTestResult(null);

    try {
      const result = await api.testAISettings(aiSettings);
      setTestResult(result);
      setNotice(result.ok ? t("settings.ai.testSuccess") : "");
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setTestingAI(false);
    }
  }

  async function createGoal(event) {
    event.preventDefault();
    setSavingGoal(true);
    setError("");
    setNotice("");

    const targetRating = Number.parseInt(goalForm.targetRating, 10);
    if (!Number.isFinite(targetRating) || targetRating <= 0) {
      setError(t("settings.goals.invalidTarget"));
      setSavingGoal(false);
      return;
    }

    try {
      await api.createGoal({
        platform: goalForm.platform,
        targetRating,
        title: goalForm.title.trim() || undefined,
        deadline: goalForm.deadline || undefined,
      });
      setGoalForm((current) => ({
        ...defaultGoalForm,
        platform: current.platform,
      }));
      setNotice(t("settings.goals.created"));
      await refresh();
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setSavingGoal(false);
    }
  }

  async function deleteGoal(goalId) {
    setDeletingGoalId(goalId);
    setError("");
    setNotice("");

    try {
      await api.deleteGoal(goalId);
      setNotice(t("settings.goals.deleted"));
      await refresh();
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setDeletingGoalId(null);
    }
  }

  async function exportDiagnostics() {
    setDiagExporting(true);
    setError("");
    setNotice("");

    try {
      const result = await api.exportDiagnostics();
      const nextPath = result?.path ?? "";
      setDiagPath(nextPath);
      setNotice(t("settings.diagnostics.exported"));
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setDiagExporting(false);
    }
  }

  return (
    <div className="settings-page-root">
      <AccountsPage serviceStatus={serviceStatus} runtimeInfo={runtimeInfo} />
    <div className="settings-grid settings-control-grid">
      <section className="panel settings-language-panel">
        <div className="panel-header">
          <h3>{t("settings.language.title")}</h3>
          <span className="caption">{t("settings.language.caption")}</span>
        </div>
        <div className="form-stack">
          <label>
            <span>{t("settings.appearance.language")}</span>
            <AppSelect
              value={language}
              options={languageOptions}
              disabled={serviceUnavailable || savingLanguage}
              onChange={(value) => void saveLanguage(value)}
            />
          </label>
        </div>
      </section>

      <section className="panel settings-runtime-panel">
        <div className="panel-header">
          <h3>{t("settings.runtime.title")}</h3>
          <span className="caption">{t("settings.runtime.caption")}</span>
        </div>
        {loading ? <p className="muted">{t("settings.loading")}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
        {notice ? <p className="success-text">{notice}</p> : null}

        <div className="stack-list">
          <article className="inline-card">
            <div>
              <strong>{t("settings.runtime.serviceStatus")}</strong>
              <p>{serviceStatus.message}</p>
            </div>
            <div className="meta-pill">
              {translatedStatus(t, serviceStatus.state)}
              <span>{serviceStatus.source}</span>
            </div>
          </article>

          <article className="inline-card">
            <div>
              <strong>{t("settings.runtime.dataDir")}</strong>
              <p>{runtimeInfo.runtimeDir || t("common.pending")}</p>
            </div>
            <button
              type="button"
              className="ghost-button"
              disabled={!runtimeInfo.runtimeDir}
              onClick={() => window.desktopBridge?.openPath(runtimeInfo.runtimeDir)}
            >
              {t("settings.runtime.openFolder")}
            </button>
          </article>

          <article className="inline-card">
            <div>
              <strong>{t("settings.runtime.appPath")}</strong>
              <p>{runtimeInfo.appPath || t("common.pending")}</p>
            </div>
            <button
              type="button"
              className="ghost-button"
              disabled={!runtimeInfo.appPath}
              onClick={() => window.desktopBridge?.openPath(runtimeInfo.appPath)}
            >
              {t("settings.runtime.openPath")}
            </button>
          </article>
        </div>
      </section>

      <section className="panel settings-goals-panel" ref={goalsSectionRef}>
        <div className="panel-header">
          <h3>{t("settings.goals.title")}</h3>
          <span className="caption">{t("settings.goals.caption")}</span>
        </div>
        <form className="form-stack" onSubmit={createGoal}>
          {serviceUnavailable ? (
            <p className="muted">
              {t("settings.goals.serviceUnavailable", {
                url: runtimeInfo.serviceUrl || serviceStatus.url,
              })}
            </p>
          ) : null}
          <label>
            <span>{t("settings.accounts.platform")}</span>
            <AppSelect
              value={goalForm.platform}
              options={goalPlatformOptions}
              disabled={serviceUnavailable || savingGoal}
              onChange={(value) =>
                setGoalForm((current) => ({ ...current, platform: value }))
              }
            />
          </label>

          <label>
            <span>{t("settings.goals.targetRating")}</span>
            <input
              type="number"
              min="1"
              max="9999"
              value={goalForm.targetRating}
              disabled={serviceUnavailable || savingGoal}
              placeholder={t("settings.goals.targetPlaceholder")}
              onChange={(event) =>
                setGoalForm((current) => ({ ...current, targetRating: event.target.value }))
              }
            />
            <small>{aiSettings.hasApiKey ? t("settings.ai.keyConfigured") : t("settings.ai.keyNotConfigured")}</small>
          </label>

          <label>
            <span>{t("settings.goals.titleLabel")}</span>
            <input
              value={goalForm.title}
              disabled={serviceUnavailable || savingGoal}
              placeholder={t("settings.goals.titlePlaceholder")}
              onChange={(event) =>
                setGoalForm((current) => ({ ...current, title: event.target.value }))
              }
            />
          </label>

          <label>
            <span>{t("settings.goals.deadline")}</span>
            <AppDatePicker
              value={goalForm.deadline}
              disabled={serviceUnavailable || savingGoal}
              placeholder={t("settings.goals.deadlinePlaceholder")}
              onChange={(value) =>
                setGoalForm((current) => ({ ...current, deadline: value }))
              }
            />
          </label>

          <button
            type="submit"
            className="primary-button"
            disabled={serviceUnavailable || savingGoal}
          >
            {savingGoal ? t("settings.goals.creating") : t("settings.goals.create")}
          </button>
        </form>

        <div className="settings-goal-list">
          {goals.length === 0 ? (
            <p className="muted">{t("settings.goals.empty")}</p>
          ) : (
            goals.map((goal) => (
              <article className="inline-card" key={goal.id}>
                <div>
                  <strong>{goal.title || t("settings.goals.defaultTitle", { platform: platformLabel(goal.platform) })}</strong>
                  <p>
                    {platformLabel(goal.platform)} · {goal.targetRating} 分
                    {goal.deadline ? ` · ${t("settings.goals.deadlineValue", { date: formatGoalDeadline(goal.deadline, i18n.language) })}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="ghost-button danger"
                  disabled={deletingGoalId === goal.id || serviceUnavailable}
                  onClick={() => void deleteGoal(goal.id)}
                >
                  {deletingGoalId === goal.id ? t("settings.goals.deleting") : t("actions.delete")}
                </button>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="panel settings-diagnostics-panel">
        <div className="panel-header">
          <h3>{t("settings.diagnostics.title")}</h3>
          <span className="caption">{t("settings.diagnostics.caption")}</span>
        </div>
        <div className="form-stack">
          {serviceUnavailable ? (
            <p className="muted">
              {t("settings.serviceUnavailable", {
                url: runtimeInfo.serviceUrl || serviceStatus.url,
              })}
            </p>
          ) : null}
          <button
            type="button"
            className="primary-button"
            disabled={diagExporting || serviceUnavailable}
            onClick={() => void exportDiagnostics()}
          >
            {diagExporting ? t("settings.diagnostics.exporting") : t("settings.diagnostics.export")}
          </button>

          {diagPath ? (
            <article className="inline-card">
              <div>
                <strong>{t("settings.diagnostics.latestExport")}</strong>
                <p>{diagPath}</p>
              </div>
              <button
                type="button"
                className="ghost-button"
                onClick={() => window.desktopBridge?.openPath(diagPath)}
              >
                {t("settings.diagnostics.openFile")}
              </button>
            </article>
          ) : (
            <p className="muted">{t("settings.diagnostics.empty")}</p>
          )}
        </div>
      </section>

      <section className="panel settings-ai-panel">
        <div className="panel-header">
          <h3>{t("settings.ai.title")}</h3>
          <span className="caption">{t("settings.ai.caption")}</span>
        </div>
        <div className="form-stack">
          <label>
            <span>{t("settings.ai.provider")}</span>
            <AppSelect
              value={aiSettings.provider}
              options={providerOptions}
              placeholder={t("settings.ai.providerPlaceholder")}
              onChange={(value) =>
                setAISettings((current) => ({
                  ...current,
                  provider: value,
                }))
              }
            />
          </label>

          <label>
            <span>{t("settings.ai.model")}</span>
            <input
              value={aiSettings.model}
              placeholder="gpt-4.1 / deepseek-chat / llama3.1"
              onChange={(event) =>
                setAISettings((current) => ({
                  ...current,
                  model: event.target.value,
                }))
              }
            />
          </label>

          <label>
            <span>{t("settings.ai.baseUrl")}</span>
            <input
              value={aiSettings.baseUrl}
              placeholder={t("settings.ai.baseUrlPlaceholder")}
              onChange={(event) =>
                setAISettings((current) => ({
                  ...current,
                  baseUrl: event.target.value,
                }))
              }
            />
          </label>

          <label>
            <span>{t("settings.ai.apiKey")}</span>
            <input
              type="password"
              value={aiSettings.apiKey}
              placeholder={t("settings.ai.apiKeyPlaceholder")}
              onChange={(event) =>
                setAISettings((current) => ({
                  ...current,
                  apiKey: event.target.value,
                }))
              }
            />
          </label>

          <div className="editor-toolbar">
            <button
              type="button"
              className="ghost-button"
              disabled={testingAI || serviceUnavailable}
              onClick={() => void testAISettings()}
            >
              {testingAI ? t("settings.ai.testing") : t("settings.ai.test")}
            </button>
            {aiSettings.hasApiKey ? (
              <button
                type="button"
                className="ghost-button"
                disabled={savingAI || serviceUnavailable}
                onClick={() => void clearAIKey()}
              >
                {t("settings.ai.clearKey")}
              </button>
            ) : null}
            <button
              type="button"
              className="primary-button"
              disabled={savingAI || serviceUnavailable}
              onClick={() => void saveAISettings()}
            >
              {savingAI ? t("settings.ai.saving") : t("settings.ai.save")}
            </button>
          </div>

          {testResult ? (
            <article className="inline-card">
              <div>
                <strong>
                  {testResult.ok ? t("settings.ai.valid") : t("settings.ai.invalid")}
                </strong>
                <p>{testResult.message}</p>
              </div>
            </article>
          ) : null}
        </div>
      </section>

      <section className="panel settings-update-panel">
        <div className="panel-header">
          <h3>{t("settings.update.title")}</h3>
          <span className="caption">{t("settings.update.caption")}</span>
        </div>
        <div className="form-stack">
          {updateDownloaded ? (
            <div>
              <p>{t("settings.update.downloaded")}</p>
              <button className="btn-primary" onClick={() => window.desktopBridge?.updater?.install?.()}>
                {t("settings.update.install")}
              </button>
            </div>
          ) : updateInfo ? (
            <div>
              <p>{t("settings.update.available", { version: updateInfo.version })}</p>
              <button className="btn-primary" onClick={() => window.desktopBridge?.updater?.download?.()}>
                {t("settings.update.download")}
              </button>
            </div>
          ) : (
            <button className="ghost-button" onClick={handleCheckUpdate} disabled={checking}>
              {checking ? t("settings.update.checking") : t("settings.update.check")}
            </button>
          )}
        </div>
      </section>
    </div>
    </div>
  );
}
