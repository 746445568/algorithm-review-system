import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { statusLabel } from "../lib/format.js";

const defaultAISettings = {
  provider: "",
  model: "",
  baseUrl: "",
  apiKey: "",
};

const providerOptions = [
  { value: "openai", label: "OpenAI-compatible" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "ollama", label: "Ollama" },
];

const themeOptions = [
  { value: "follow-system", label: "Follow system" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function SettingsPage({ runtimeInfo, serviceStatus }) {
  const [aiSettings, setAISettings] = useState(defaultAISettings);
  const [themeMode, setThemeMode] = useState("follow-system");
  const [loading, setLoading] = useState(true);
  const [savingAI, setSavingAI] = useState(false);
  const [testingAI, setTestingAI] = useState(false);
  const [savingTheme, setSavingTheme] = useState(false);
  const [diagExporting, setDiagExporting] = useState(false);
  const [diagPath, setDiagPath] = useState("");
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const refreshSequenceRef = useRef(0);

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
      const [nextAISettings, nextTheme] = await Promise.all([
        api.getAISettings(),
        api.getThemeSettings(),
      ]);

      if (requestId !== refreshSequenceRef.current) {
        return;
      }

      setAISettings({
        provider: nextAISettings?.provider ?? "",
        model: nextAISettings?.model ?? "",
        baseUrl: nextAISettings?.baseUrl ?? "",
        apiKey: nextAISettings?.apiKey ?? "",
      });
      setThemeMode(nextTheme?.mode ?? "follow-system");
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
  }, [serviceStatus.state]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const serviceUnavailable = serviceStatus.state !== "healthy";

  async function saveAISettings() {
    setSavingAI(true);
    setError("");
    setNotice("");
    setTestResult(null);

    try {
      await api.saveAISettings(aiSettings);
      setNotice("AI settings saved.");
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
      setNotice(result.ok ? "AI settings test passed." : "");
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setTestingAI(false);
    }
  }

  async function saveThemeSettings() {
    setSavingTheme(true);
    setError("");
    setNotice("");

    try {
      await api.saveThemeSettings(themeMode);
      setNotice("Theme preference saved.");
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setSavingTheme(false);
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
      setNotice("Diagnostics exported.");
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setDiagExporting(false);
    }
  }

  return (
    <div className="page-grid two-column">
      <section className="panel">
        <div className="panel-header">
          <h3>Runtime</h3>
          <span className="caption">Local service and storage layout</span>
        </div>
        {loading ? <p className="muted">Loading settings...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
        {notice ? <p className="success-text">{notice}</p> : null}

        <div className="stack-list">
          <article className="inline-card">
            <div>
              <strong>Service state</strong>
              <p>{serviceStatus.message}</p>
            </div>
            <div className="meta-pill">
              {statusLabel(serviceStatus.state)}
              <span>{serviceStatus.source}</span>
            </div>
          </article>

          <article className="inline-card">
            <div>
              <strong>Runtime dir</strong>
              <p>{runtimeInfo.runtimeDir || "pending"}</p>
            </div>
            <button
              type="button"
              className="ghost-button"
              disabled={!runtimeInfo.runtimeDir}
              onClick={() => window.desktopBridge?.openPath(runtimeInfo.runtimeDir)}
            >
              Open folder
            </button>
          </article>

          <article className="inline-card">
            <div>
              <strong>App shell path</strong>
              <p>{runtimeInfo.appPath || "pending"}</p>
            </div>
            <button
              type="button"
              className="ghost-button"
              disabled={!runtimeInfo.appPath}
              onClick={() => window.desktopBridge?.openPath(runtimeInfo.appPath)}
            >
              Open path
            </button>
          </article>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>Diagnostics</h3>
          <span className="caption">Export runtime metadata for debugging</span>
        </div>
        <div className="form-stack">
          {serviceUnavailable ? (
            <p className="muted">
              Service-backed settings are disabled until {runtimeInfo.serviceUrl || serviceStatus.url} is healthy.
            </p>
          ) : null}
          <button
            type="button"
            className="primary-button"
            disabled={diagExporting || serviceUnavailable}
            onClick={() => void exportDiagnostics()}
          >
            {diagExporting ? "Exporting..." : "Export diagnostics"}
          </button>

          {diagPath ? (
            <article className="inline-card">
              <div>
                <strong>Latest export</strong>
                <p>{diagPath}</p>
              </div>
              <button
                type="button"
                className="ghost-button"
                onClick={() => window.desktopBridge?.openPath(diagPath)}
              >
                Open file
              </button>
            </article>
          ) : (
            <p className="muted">No diagnostics export has been generated in this session.</p>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>AI provider</h3>
          <span className="caption">Backed by /api/settings/ai and /api/settings/ai/test</span>
        </div>
        <div className="form-stack">
          <label>
            <span>Provider</span>
            <select
              value={aiSettings.provider}
              onChange={(event) =>
                setAISettings((current) => ({
                  ...current,
                  provider: event.target.value,
                }))
              }
            >
              <option value="">Select provider</option>
              {providerOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Model</span>
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
            <span>Base URL</span>
            <input
              value={aiSettings.baseUrl}
              placeholder="Optional for custom OpenAI-compatible endpoints"
              onChange={(event) =>
                setAISettings((current) => ({
                  ...current,
                  baseUrl: event.target.value,
                }))
              }
            />
          </label>

          <label>
            <span>API key</span>
            <input
              type="password"
              value={aiSettings.apiKey}
              placeholder="Stored locally with encryption"
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
              {testingAI ? "Testing..." : "Test configuration"}
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={savingAI || serviceUnavailable}
              onClick={() => void saveAISettings()}
            >
              {savingAI ? "Saving..." : "Save AI settings"}
            </button>
          </div>

          {testResult ? (
            <article className="inline-card">
              <div>
                <strong>{testResult.ok ? "Configuration valid" : "Configuration failed"}</strong>
                <p>{testResult.message}</p>
              </div>
            </article>
          ) : null}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>Appearance</h3>
          <span className="caption">Persisted in local app settings</span>
        </div>
        <div className="form-stack">
          <label>
            <span>Theme mode</span>
            <select value={themeMode} onChange={(event) => setThemeMode(event.target.value)}>
              {themeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="editor-toolbar">
            <span className="meta-pill review-state-pill">
              Theme
              <span>{themeMode}</span>
            </span>
            <button
              type="button"
              className="primary-button"
              disabled={savingTheme || serviceUnavailable}
              onClick={() => void saveThemeSettings()}
            >
              {savingTheme ? "Saving..." : "Save theme preference"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
