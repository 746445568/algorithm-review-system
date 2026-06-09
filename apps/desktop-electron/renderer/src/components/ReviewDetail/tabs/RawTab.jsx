import React from "react";
import { useTranslation } from 'react-i18next';

function formatRawJSON(raw) {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export const RawTab = React.memo(function RawTab({
  hasSubmissions,
  representativeSubmission,
}) {
  const { t } = useTranslation();

  if (!hasSubmissions) {
    return (
      <div className="panel rd-raw-panel">
        <p className="muted">{t('review.detail.noRawData')}</p>
      </div>
    );
  }

  return (
    <div className="panel rd-raw-panel">
      <p className="rd-raw-note muted">
        {t('review.detail.rawNote')}
      </p>
      <pre className="rd-raw-pre">
        {formatRawJSON(representativeSubmission.rawJson)}
      </pre>
    </div>
  );
});
