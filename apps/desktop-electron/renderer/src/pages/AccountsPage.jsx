import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppSelect } from "../components/AppControls.jsx";
import { api } from "../lib/api.js";
import { formatDate, platformLabel, statusLabel } from "../lib/format.js";

const defaultPlatforms = [
  { value: "CODEFORCES", label: "Codeforces" },
  { value: "ATCODER", label: "AtCoder" },
];

function accountSyncPlatformOptions(judges) {
  if (!Array.isArray(judges)) {
    return defaultPlatforms;
  }
  const options = judges
    .filter((judge) => judge.accountSync === "supported" || judge.accountSync === "partial")
    .map((judge) => ({
      value: judge.platform,
      label: judge.label || platformLabel(judge.platform),
    }))
    .filter((option) => option.value);
  return options.length > 0 ? options : defaultPlatforms;
}

function translatedStatus(t, status) {
  const key = (status || "UNKNOWN").toUpperCase();
  return t(`statusLabels.${key}`, { defaultValue: statusLabel(status) });
}

export function AccountsPage({ serviceStatus, runtimeInfo }) {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState([]);
  const [syncTasks, setSyncTasks] = useState([]);
  const [form, setForm] = useState({ platform: "CODEFORCES", handle: "" });
  const [platforms, setPlatforms] = useState(defaultPlatforms);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshingIds, setRefreshingIds] = useState(new Set());
  const refreshSequenceRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = refreshSequenceRef.current + 1;
    refreshSequenceRef.current = requestId;

    if (serviceStatus.state !== "healthy") {
      return;
    }

    setError("");
    try {
      const [nextAccounts, nextSyncTasks] = await Promise.all([
        api.getAccounts(),
        api.getSyncTasks(),
      ]);
      if (requestId !== refreshSequenceRef.current) {
        return;
      }
      setAccounts(nextAccounts);
      setSyncTasks(nextSyncTasks);
    } catch (nextError) {
      if (requestId !== refreshSequenceRef.current) {
        return;
      }
      setError(nextError.message);
    }
  }, [serviceStatus.state]);

  const refreshPlatforms = useCallback(async () => {
    if (serviceStatus.state !== "healthy") {
      setPlatforms(defaultPlatforms);
      return;
    }

    try {
      const judges = await api.getJudges();
      const nextPlatforms = accountSyncPlatformOptions(judges);
      setPlatforms(nextPlatforms);
      setForm((current) => {
        if (nextPlatforms.some((option) => option.value === current.platform)) {
          return current;
        }
        return { ...current, platform: nextPlatforms[0].value };
      });
    } catch {
      setPlatforms(defaultPlatforms);
    }
  }, [serviceStatus.state]);

  useEffect(() => {
    void refresh();
    if (serviceStatus.state !== "healthy") {
      return undefined;
    }

    const timer = window.setInterval(() => {
      void refresh();
    }, 12000);
    return () => window.clearInterval(timer);
  }, [refresh, serviceStatus.state]);

  useEffect(() => {
    void refreshPlatforms();
  }, [refreshPlatforms]);

  const latestTaskByAccount = useMemo(() => {
    const index = new Map();
    for (const task of syncTasks) {
      if (!index.has(task.platformAccountId)) {
        index.set(task.platformAccountId, task);
      }
    }
    return index;
  }, [syncTasks]);

  const serviceUnavailable = serviceStatus.state !== "healthy";

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setNotice("");

    try {
      await api.createAccount(form.platform, form.handle.trim());
      setForm((current) => ({ ...current, handle: "" }));
      setNotice(t("settings.accounts.saved"));
      await refresh();
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteAccount(account) {
    setError("");
    setNotice("");

    try {
      await api.deleteAccount(account.id);
      setNotice(t("settings.accounts.deleted", { handle: account.externalHandle }));
      await refresh();
    } catch (nextError) {
      setError(nextError.message);
    }
  }

  const handleRefreshRating = useCallback(async (account) => {
    setRefreshingIds(prev => new Set(prev).add(account.id));
    setError("");
    try {
      await api.refreshRating(account.id);
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setRefreshingIds(prev => { const s = new Set(prev); s.delete(account.id); return s; });
    }
  }, [refresh]);

  async function triggerSync(account) {
    setError("");
    setNotice("");

    try {
      await api.syncAccount(account.platform, account.id);
      setNotice(t("settings.accounts.queued", { handle: account.externalHandle }));
      await refresh();
    } catch (nextError) {
      setError(nextError.message);
    }
  }

  return (
    <div className="page-grid two-column">
      <section className="panel">
        <div className="panel-header">
          <h3>{t("settings.accounts.bindTitle")}</h3>
          <span className="caption">{t("settings.accounts.bindCaption")}</span>
        </div>
        <form className="form-stack" onSubmit={handleSubmit}>
          <label>
            <span>{t("settings.accounts.platform")}</span>
            <AppSelect
              value={form.platform}
              options={platforms}
              disabled={serviceUnavailable || submitting}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  platform: value,
                }))
              }
            />
          </label>

          <label>
            <span>{t("settings.accounts.handle")}</span>
            <input
              value={form.handle}
              placeholder={t("settings.accounts.handlePlaceholder")}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  handle: event.target.value,
                }))
              }
            />
          </label>

          <button
            type="submit"
            className="primary-button"
            disabled={submitting || !form.handle.trim() || serviceUnavailable}
          >
            {submitting ? t("settings.accounts.saving") : t("settings.accounts.save")}
          </button>
        </form>
        {serviceUnavailable ? (
          <p className="muted">
            {t("settings.accounts.serviceUnavailable", {
              url: runtimeInfo.serviceUrl || serviceStatus.url,
            })}
          </p>
        ) : null}
        {notice ? <p className="success-text">{notice}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>{t("settings.accounts.syncQueue")}</h3>
          <button
            type="button"
            className="ghost-button"
            disabled={serviceUnavailable}
            onClick={() => void refresh()}
          >
            {t("actions.refresh")}
          </button>
        </div>
        <div className="stack-list">
          {syncTasks.length === 0 ? (
            <p className="muted">{t("settings.accounts.noSyncTasks")}</p>
          ) : (
            syncTasks.slice(0, 8).map((task) => (
              <article key={task.id} className="inline-card">
                <div>
                  <strong>{translatedStatus(t, task.status)}</strong>
                  <p>{formatDate(task.createdAt)}</p>
                </div>
                <div className="meta-pill">
                  {task.fetchedCount}/{task.insertedCount}
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="panel full-span">
        <div className="panel-header">
          <h3>{t("settings.accounts.boundTitle")}</h3>
          <span className="caption">{t("settings.accounts.boundCaption")}</span>
        </div>
        <div className="stack-list">
          {accounts.length === 0 ? (
            <p className="muted">{t("settings.accounts.empty")}</p>
          ) : (
            accounts.map((account) => {
              const latestTask = latestTaskByAccount.get(account.id);
              return (
                <article key={account.id} className="account-card">
                  <div className="account-main">
                    <span className="section-label">{platformLabel(account.platform)}</span>
                    <h4>{account.externalHandle}</h4>
                    <p>
                      {translatedStatus(t, account.status)} / {t("settings.accounts.lastSync")}{" "}
                      {formatDate(account.lastSyncedAt)}
                    </p>
                    {latestTask ? (
                      <p className="muted">
                        {t("settings.accounts.latestTask")}: {translatedStatus(t, latestTask.status)} /{" "}
                        {t("settings.accounts.fetched")} {latestTask.fetchedCount} /{" "}
                        {t("settings.accounts.inserted")} {latestTask.insertedCount}
                      </p>
                    ) : null}
                    {account.rating != null ? (
                      <p className="muted">
                        {t("settings.accounts.ratingValue", {
                          rating: account.rating,
                          max: account.maxRating ?? account.rating,
                        })}
                      </p>
                    ) : (
                      <p className="muted">{t("settings.accounts.ratingMissing")}</p>
                    )}
                  </div>
                  <div className="account-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={serviceUnavailable || refreshingIds.has(account.id)}
                      onClick={() => void handleRefreshRating(account)}
                    >
                      {refreshingIds.has(account.id)
                        ? t("settings.accounts.refreshingRating")
                        : t("settings.accounts.refreshRating")}
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={serviceUnavailable}
                      onClick={() => void triggerSync(account)}
                    >
                      {t("settings.accounts.syncNow")}
                    </button>
                    <button
                      type="button"
                      className="ghost-button danger"
                      disabled={serviceUnavailable}
                      onClick={() => void deleteAccount(account)}
                    >
                      {t("actions.delete")}
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
