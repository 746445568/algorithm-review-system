import React from "react";

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
  if (!hasSubmissions) {
    return (
      <div className="panel rd-raw-panel">
        <p className="muted">无可用原始数据。</p>
      </div>
    );
  }

  return (
    <div className="panel rd-raw-panel">
      <p className="rd-raw-note muted">
        当前服务返回 raw_json（提交元数据），非源代码。
      </p>
      <pre className="rd-raw-pre">
        {formatRawJSON(representativeSubmission.rawJson)}
      </pre>
    </div>
  );
});
