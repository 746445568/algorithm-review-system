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
  { value: "openai", label: "OpenAI 兼容" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "ollama", label: "Ollama" },
];

const themeOptions = [
  { value: "follow-system", label: "跟随系统" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
];

export function SettingsPage({ runtimeInfo, serviceStatus, themeMode, onThemeChange }) {
  const [aiSettings, setAISettings] = useState(defaultAISettings);
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
  const [updateInfo, setUpdateInfo] = useState(null);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const bridge = window.desktopBridge?.updater;
    if (!bridge) return;
    const unsubAvailable = bridge.onUpdateAvailable((info) => setUpdateInfo(info));
    const unsubDownloaded = bridge.onUpdateDownloaded(() => setUpdateDownloaded(true));
    return () => { unsubAvailable(); unsubDownloaded(); };
  }, []);

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
      const nextAISettings = await api.getAISettings();

      if (requestId !== refreshSequenceRef.current) {
        return;
      }

      setAISettings({
        provider: nextAISettings?.provider ?? "",
        model: nextAISettings?.model ?? "",
        baseUrl: nextAISettings?.baseUrl ?? "",
        apiKey: nextAISettings?.apiKey ?? "",
      });
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
      setNotice("AI 设置已保存。");
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
      setNotice(result.ok ? "AI 配置测试通过。" : "");
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
      onThemeChange(themeMode);
      if (serviceStatus.state === "healthy") {
        await api.saveThemeSettings(themeMode);
      }
      setNotice("主题偏好已保存。");
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
      setNotice("诊断信息已导出。");
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
          <h3>运行时信息</h3>
          <span className="caption">本地服务和存储布局</span>
        </div>
        {loading ? <p className="muted">正在加载设置...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
        {notice ? <p className="success-text">{notice}</p> : null}

        <div className="stack-list">
          <article className="inline-card">
            <div>
              <strong>服务状态</strong>
              <p>{serviceStatus.message}</p>
            </div>
            <div className="meta-pill">
              {statusLabel(serviceStatus.state)}
              <span>{serviceStatus.source}</span>
            </div>
          </article>

          <article className="inline-card">
            <div>
              <strong>数据目录</strong>
              <p>{runtimeInfo.runtimeDir || "等待中"}</p>
            </div>
            <button
              type="button"
              className="ghost-button"
              disabled={!runtimeInfo.runtimeDir}
              onClick={() => window.desktopBridge?.openPath(runtimeInfo.runtimeDir)}
            >
              打开文件夹
            </button>
          </article>

          <article className="inline-card">
            <div>
              <strong>应用路径</strong>
              <p>{runtimeInfo.appPath || "等待中"}</p>
            </div>
            <button
              type="button"
              className="ghost-button"
              disabled={!runtimeInfo.appPath}
              onClick={() => window.desktopBridge?.openPath(runtimeInfo.appPath)}
            >
              打开路径
            </button>
          </article>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>诊断信息</h3>
          <span className="caption">导出运行时元数据用于调试</span>
        </div>
        <div className="form-stack">
          {serviceUnavailable ? (
            <p className="muted">
              本地服务 {runtimeInfo.serviceUrl || serviceStatus.url} 未就绪，设置暂不可用。
            </p>
          ) : null}
          <button
            type="button"
            className="primary-button"
            disabled={diagExporting || serviceUnavailable}
            onClick={() => void exportDiagnostics()}
          >
            {diagExporting ? "导出中..." : "导出诊断信息"}
          </button>

          {diagPath ? (
            <article className="inline-card">
              <div>
                <strong>最近导出</strong>
                <p>{diagPath}</p>
              </div>
              <button
                type="button"
                className="ghost-button"
                onClick={() => window.desktopBridge?.openPath(diagPath)}
              >
                打开文件
              </button>
            </article>
          ) : (
            <p className="muted">本次会话尚未生成诊断导出。</p>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>AI 服务</h3>
          <span className="caption">通过 /api/settings/ai 接口配置</span>
        </div>
        <div className="form-stack">
          <label>
            <span>服务商</span>
            <select
              value={aiSettings.provider}
              onChange={(event) =>
                setAISettings((current) => ({
                  ...current,
                  provider: event.target.value,
                }))
              }
            >
              <option value="">选择服务商</option>
              {providerOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>模型</span>
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
            <span>接口地址</span>
            <input
              value={aiSettings.baseUrl}
              placeholder="可选，用于自定义 OpenAI 兼容接口"
              onChange={(event) =>
                setAISettings((current) => ({
                  ...current,
                  baseUrl: event.target.value,
                }))
              }
            />
          </label>

          <label>
            <span>API 密钥</span>
            <input
              type="password"
              value={aiSettings.apiKey}
              placeholder="本地加密存储"
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
              {testingAI ? "测试中..." : "测试配置"}
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={savingAI || serviceUnavailable}
              onClick={() => void saveAISettings()}
            >
              {savingAI ? "保存中..." : "保存 AI 设置"}
            </button>
          </div>

          {testResult ? (
            <article className="inline-card">
              <div>
                <strong>{testResult.ok ? "配置有效" : "配置失败"}</strong>
                <p>{testResult.message}</p>
              </div>
            </article>
          ) : null}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>应用更新</h3>
          <span className="caption">检查并安装新版本</span>
        </div>
        <div className="form-stack">
          {updateDownloaded ? (
            <div>
              <p>新版本已下载，重启后生效。</p>
              <button className="btn-primary" onClick={() => window.desktopBridge?.updater?.install?.()}>立即重启安装</button>
            </div>
          ) : updateInfo ? (
            <div>
              <p>发现新版本：{updateInfo.version}</p>
              <button className="btn-primary" onClick={() => window.desktopBridge?.updater?.download?.()}>下载更新</button>
            </div>
          ) : (
            <button className="ghost-button" onClick={handleCheckUpdate} disabled={checking}>
              {checking ? "检查中..." : "检查更新"}
            </button>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>外观</h3>
          <span className="caption">保存在本地应用设置中</span>
        </div>
        <div className="form-stack">
          <label>
            <span>主题模式</span>
            <select value={themeMode} onChange={(event) => onThemeChange(event.target.value)}>
              {themeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="editor-toolbar">
            <span className="meta-pill review-state-pill">
              主题
              <span>{themeMode}</span>
            </span>
            <button
              type="button"
              className="primary-button"
              disabled={savingTheme}
              onClick={() => void saveThemeSettings()}
            >
              {savingTheme ? "保存中..." : "保存主题偏好"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
