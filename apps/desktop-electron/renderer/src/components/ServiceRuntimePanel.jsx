import { memo } from "react";
import { useTranslation } from 'react-i18next';

export const ServiceRuntimePanel = memo(function ServiceRuntimePanel({ runtimeInfo, serviceStatus }) {
  const { t } = useTranslation();

  return (
    <section className="sidebar-runtime">
      <span className="section-label">{t('serviceRuntime.title')}</span>
      <dl>
        <div>
          <dt>{t('serviceRuntime.serviceUrl')}</dt>
          <dd>{serviceStatus.url}</dd>
        </div>
        <div>
          <dt>{t('settings.runtime.dataDir')}</dt>
          <dd title={runtimeInfo.runtimeDir || t('serviceRuntime.notReady')}>{runtimeInfo.runtimeDir || t('serviceRuntime.waiting')}</dd>
        </div>
        <div>
          <dt>{t('serviceRuntime.mode')}</dt>
          <dd>{runtimeInfo.isPackaged ? t('serviceRuntime.production') : t('serviceRuntime.development')}</dd>
        </div>
      </dl>
    </section>
  );
});
