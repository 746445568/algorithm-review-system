import React from "react";
import { formatDate, verdictTone } from "../../../lib/format.js";

export const SubmissionsTab = React.memo(function SubmissionsTab({
  hasSubmissions,
  selectedSubmissions,
}) {
  if (!hasSubmissions) {
    return (
      <div className="panel rd-subs-panel">
        <p className="muted">当前范围内未找到该题的提交记录。</p>
      </div>
    );
  }

  return (
    <div className="panel rd-subs-panel">
      <div className="rd-subs-list">
        {selectedSubmissions.map((sub, i) => {
          const tone = verdictTone(sub.verdict);
          return (
            <article
              key={sub.id}
              className="rd-sub-row"
              style={{ animationDelay: `${i * 25}ms` }}
            >
              <div className="rd-sub-left">
                <span
                  className={`rd-verdict-badge ${tone === "good" ? "badge-good" : tone === "bad" ? "badge-bad" : "badge-neutral"}`}
                >
                  {sub.verdict}
                </span>
                <div>
                  <strong className="rd-sub-lang">
                    {sub.language || "未知语言"}
                  </strong>
                  <p className="rd-sub-date muted">
                    {formatDate(sub.submittedAt)}
                  </p>
                </div>
              </div>
              <div className="rd-sub-right">
                <span>{sub.executionTimeMs ?? "—"} ms</span>
                <span>{sub.memoryKb ?? "—"} KB</span>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
});
