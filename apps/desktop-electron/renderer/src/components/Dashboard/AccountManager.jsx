import { memo } from "react";
import { useTranslation } from 'react-i18next';
import { AppSelect } from "../AppControls.jsx";
import { formatDate, platformLabel, statusLabel } from "../../lib/format.js";

const platforms = [
  { value: "CODEFORCES", label: "Codeforces" },
  { value: "ATCODER", label: "AtCoder" },
];

export const AccountManager = memo(function AccountManager({
  serviceUnavailable,
  loading,
  error,
  notice,
  form,
  submitting,
  setForm,
  handleSubmit,
  accounts,
  latestTaskByAccount,
  refreshingIds,
  handleRefreshRating,
  triggerSync,
  deleteAccount,
  refresh,
}) {
  const { t } = useTranslation();

  return (
    <section className="panel">
      <div className="panel-header">
        <h3>{t('settings.accounts.boundTitle')}</h3>
        <button
          type="button"
          className="ghost-button"
          disabled={serviceUnavailable}
          onClick={() => void refresh()}
        >
          {t('actions.refresh')}
        </button>
      </div>
      {loading ? <p className="muted">{t('dashboard.account.loadingData')}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
      {notice ? <p className="success-text">{notice}</p> : null}

      <form className="form-stack" onSubmit={handleSubmit} style={{ marginBottom: 16 }}>
        <label>
          <span>{t('settings.accounts.platform')}</span>
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
          <span>{t('settings.accounts.handle')}</span>
          <input
            value={form.handle}
            placeholder={t('settings.accounts.handlePlaceholder')}
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
          {submitting ? t('settings.accounts.saving') : t('settings.accounts.save')}
        </button>
      </form>

      <div className="stack-list">
        {accounts.length === 0 ? (
          <p className="muted">{t('settings.accounts.empty')}</p>
        ) : (
          accounts.map((account) => {
            const latestTask = latestTaskByAccount.get(account.id);
            return (
              <article key={account.id} className="account-card">
                <div className="account-main">
                  <span className="section-label">{platformLabel(account.platform)}</span>
                  <h4>{account.externalHandle}</h4>
                  <p>
                    {statusLabel(account.status)} / {t('status.lastSync')}{' '}
                    {formatDate(account.lastSyncedAt)}
                  </p>
                  {latestTask ? (
                    <p className="muted">
                      {t('settings.accounts.latestTask')}：{statusLabel(latestTask.status)} / {t('settings.accounts.fetched')}{' '}
                      {latestTask.fetchedCount} / {t('settings.accounts.inserted')} {latestTask.insertedCount}
                    </p>
                  ) : null}
                  {account.rating != null ? (
                    <p className="muted">{t('settings.accounts.ratingValue', { rating: account.rating, max: account.maxRating ?? account.rating })}</p>
                  ) : (
                    <p className="muted">{t('settings.accounts.ratingMissing')}</p>
                  )}
                </div>
                <div className="account-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={serviceUnavailable || refreshingIds.has(account.id)}
                    onClick={() => void handleRefreshRating(account)}
                  >
                    {refreshingIds.has(account.id) ? t('settings.accounts.refreshingRating') : t('settings.accounts.refreshRating')}
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={serviceUnavailable}
                    onClick={() => void triggerSync(account)}
                  >
                    {t('settings.accounts.syncNow')}
                  </button>
                  <button
                    type="button"
                    className="ghost-button danger"
                    disabled={serviceUnavailable}
                    onClick={() => void deleteAccount(account)}
                  >
                    {t('actions.delete')}
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
});
