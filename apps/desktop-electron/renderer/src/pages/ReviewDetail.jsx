import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { formatDate, statusLabel, tagLabel, toDatetimeLocalValue, verdictTone } from "../lib/format.js";
import { useReviewFlow } from "../hooks/useReviewFlow.js";

const STATUS_OPTIONS = [
  { value: "TODO",      label: "待复习", chipClass: "rl-chip-neutral" },
  { value: "REVIEWING", label: "复习中", chipClass: "rl-chip-warn"    },
  { value: "SCHEDULED", label: "已排期", chipClass: "rl-chip-blue"    },
  { value: "DONE",      label: "已完成", chipClass: "rl-chip-good"    },
];

const RATE_OPTIONS = [
  { quality: 1, label: "忘了", key: "Q", className: "rd-rate-btn--forgot"  },
  { quality: 2, label: "困难", key: "W", className: "rd-rate-btn--hard"    },
  { quality: 3, label: "一般", key: "E", className: "rd-rate-btn--medium"  },
  { quality: 5, label: "简单", key: "R", className: "rd-rate-btn--easy"    },
];

function isMissingReviewStateRoute(error) {
  return /\b404\b/.test(error?.message || "");
}

function buildSupportMessage(serviceUrl) {
  return `ojreviewd (${serviceUrl}) 版本过旧，不支持复习状态读写。请从 apps/server 重新构建。`;
}

function formatRawJSON(raw) {
  try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
}

// ─── Minimal Markdown renderer (zero deps) ───────────────────────────────────

function renderInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i} className="md-code">{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

function SimpleMarkdown({ text }) {
  if (!text) return <p className="rd-notes-placeholder">暂无笔记</p>;

  const lines = text.split("\n");
  const elements = [];
  let listItems = [];

  function flushList() {
    if (listItems.length > 0) {
      elements.push(<ul key={`ul-${elements.length}`} className="md-ul">{listItems}</ul>);
      listItems = [];
    }
  }

  lines.forEach((line, i) => {
    if (line.startsWith("## ")) {
      flushList();
      elements.push(<h4 key={i} className="md-h2">{line.slice(3)}</h4>);
    } else if (line.startsWith("# ")) {
      flushList();
      elements.push(<h3 key={i} className="md-h1">{line.slice(2)}</h3>);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      listItems.push(<li key={i}>{renderInline(line.slice(2))}</li>);
    } else if (line.trim() === "") {
      flushList();
      elements.push(<div key={i} className="md-gap" />);
    } else {
      flushList();
      elements.push(<p key={i} className="md-p">{renderInline(line)}</p>);
    }
  });
  flushList();

  return <div className="md-body">{elements}</div>;
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, isError, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2000);
    return () => clearTimeout(t);
  }, [onDone]);
  return <div className={`rd-toast ${isError ? "rd-toast--error" : ""}`}>{message}</div>;
}

// ─── ReviewDetail ─────────────────────────────────────────────────────────────

export function ReviewDetail({
  selectedProblem,
  selectedProblemRecord,
  selectedSubmissions,
  selectedTags,
  serviceStatus,
  runtimeInfo,
  filteredProblems,
  onSelect,
  onReviewSaved,
}) {
  const [reviewState, setReviewState] = useState({
    status: "TODO",
    notes: "",
    nextReviewAt: "",
    lastUpdatedAt: "",
  });
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewStateSupported, setReviewStateSupported] = useState(true);
  const [supportMessage, setSupportMessage] = useState("");
  const [toast, setToast] = useState(null);
  const [activeTab, setActiveTab] = useState("state");
  const [srsInfo, setSrsInfo] = useState({ easeFactor: 2.5, intervalDays: 0, repetitionCount: 0 });
  const [rating, setRating] = useState(false);

  const seqRef = useRef(0);
  const autoAdvRef = useRef(null);

  const selectedProblemId = selectedProblem?.problemId ?? null;
  const serviceUnavailable = serviceStatus.state !== "healthy";
  const serviceUrl = runtimeInfo.serviceUrl || serviceStatus.url || "";

  // Load review state when problem changes
  useEffect(() => {
    const reqId = ++seqRef.current;

    if (!selectedProblemId || serviceUnavailable) {
      setReviewState({ status: "TODO", notes: "", nextReviewAt: "", lastUpdatedAt: "" });
      setReviewStateSupported(true);
      setSupportMessage("");
      return;
    }

    api.getReviewState(selectedProblemId).then((state) => {
      if (reqId !== seqRef.current) return;
      setReviewState({
        status: state.status || "TODO",
        notes: state.notes || "",
        nextReviewAt: toDatetimeLocalValue(state.nextReviewAt),
        lastUpdatedAt: state.lastUpdatedAt || "",
      });
      setSrsInfo({
        easeFactor: state.easeFactor ?? 2.5,
        intervalDays: state.intervalDays ?? 0,
        repetitionCount: state.repetitionCount ?? 0,
      });
      setReviewStateSupported(true);
      setSupportMessage("");
    }).catch((err) => {
      if (reqId !== seqRef.current) return;
      if (isMissingReviewStateRoute(err)) {
        setReviewStateSupported(false);
        setSupportMessage(buildSupportMessage(serviceUrl));
      }
    });
  }, [selectedProblemId, serviceUnavailable, serviceUrl]);

  const saveReviewState = useCallback(async () => {
    if (!selectedProblemId || !reviewStateSupported || reviewSaving) return;

    setReviewSaving(true);
    try {
      const saved = await api.saveReviewState(selectedProblemId, {
        status: reviewState.status,
        notes: reviewState.notes,
        nextReviewAt: reviewState.nextReviewAt
          ? new Date(reviewState.nextReviewAt).toISOString()
          : null,
      });
      setReviewState({
        status: saved.status || "TODO",
        notes: saved.notes || "",
        nextReviewAt: toDatetimeLocalValue(saved.nextReviewAt),
        lastUpdatedAt: saved.lastUpdatedAt || "",
      });
      setReviewStateSupported(true);
      setSupportMessage("");
      onReviewSaved(saved);
      setToast({ message: "已保存", isError: false });

      if (saved.status === "DONE" || saved.status === "SCHEDULED") {
        const idx = filteredProblems.findIndex((p) => p.problemId === selectedProblemId);
        if (idx < filteredProblems.length - 1) {
          clearTimeout(autoAdvRef.current);
          autoAdvRef.current = setTimeout(() => {
            onSelect(filteredProblems[idx + 1].problemId);
          }, 1200);
        }
      }
    } catch (err) {
      if (isMissingReviewStateRoute(err)) {
        setReviewStateSupported(false);
        setSupportMessage(buildSupportMessage(serviceUrl));
      } else {
        setToast({ message: `保存失败：${err.message}`, isError: true });
      }
    } finally {
      setReviewSaving(false);
    }
  }, [selectedProblemId, reviewStateSupported, reviewSaving, reviewState, onReviewSaved, filteredProblems, onSelect, serviceUrl]);

  const handleRate = useCallback(async (quality) => {
    if (!selectedProblemId || !reviewStateSupported || rating) return;
    setRating(true);
    try {
      const result = await api.rateReview(selectedProblemId, quality);
      setSrsInfo({
        easeFactor: result.easeFactor ?? 2.5,
        intervalDays: result.intervalDays ?? 0,
        repetitionCount: result.repetitionCount ?? 0,
      });
      setReviewState((s) => ({
        ...s,
        status: result.status || "SCHEDULED",
        nextReviewAt: toDatetimeLocalValue(result.nextReviewAt),
        lastUpdatedAt: result.lastUpdatedAt || s.lastUpdatedAt,
      }));
      onReviewSaved(result);
      const days = result.intervalDays ?? 0;
      setToast({ message: `已评分，下次复习：${days} 天后`, isError: false });
      const idx = filteredProblems.findIndex((p) => p.problemId === selectedProblemId);
      if (idx < filteredProblems.length - 1) {
        clearTimeout(autoAdvRef.current);
        autoAdvRef.current = setTimeout(() => {
          onSelect(filteredProblems[idx + 1].problemId);
        }, 1200);
      }
    } catch (err) {
      setToast({ message: `评分失败：${err.message}`, isError: true });
    } finally {
      setRating(false);
    }
  }, [selectedProblemId, reviewStateSupported, rating, onReviewSaved, filteredProblems, onSelect]);

  useEffect(() => () => clearTimeout(autoAdvRef.current), []);

  useEffect(() => {
    if (!reviewStateSupported || serviceUnavailable) return;
    const keyMap = { q: 1, w: 2, e: 3, r: 5 };
    const onKey = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (activeTab !== "state") return;
      const quality = keyMap[e.key.toLowerCase()];
      if (quality) handleRate(quality);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reviewStateSupported, serviceUnavailable, activeTab, handleRate]);

  const { currentIndex, total, hasNext, hasPrev, goNext, goPrev } = useReviewFlow({
    problems: filteredProblems,
    selectedId: selectedProblemId,
    onSelect,
    onSave: saveReviewState,
    onStatusChange: (status) => setReviewState((s) => ({ ...s, status })),
  });

  // ── Empty state ──
  if (!selectedProblem) {
    return (
      <div className="rd-empty-state">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
        <p>从左侧选择一道题目</p>
        <span className="rd-empty-hint">J / K 快速导航</span>
      </div>
    );
  }

  const hasSubmissions = selectedSubmissions.length > 0;
  const representativeSubmission = selectedSubmissions[0];

  return (
    <div className="rd-container">
      {/* Nav bar */}
      <div className="rd-nav-bar">
        <span className="rd-nav-pos">{currentIndex + 1} / {total}</span>
        <div className="rd-nav-btns">
          <button
            type="button"
            className="rd-nav-btn"
            disabled={!hasPrev}
            onClick={goPrev}
            title="上一题 (K)"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            type="button"
            className="rd-nav-btn"
            disabled={!hasNext}
            onClick={goNext}
            title="下一题 (J)"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>

      {/* Animated content on problem change */}
      <div key={selectedProblemId} className="rd-content">

        {/* Problem header */}
        <div className="panel rd-header-panel">
          <div className="rd-problem-top">
            <div className="rd-problem-info">
              <span className="rd-platform-badge">{selectedProblem.platform}</span>
              <h3 className="rd-problem-title">{selectedProblem.title}</h3>
              <p className="rd-problem-sub">
                {selectedProblem.externalProblemId}
                {selectedProblem.contestId ? ` · 比赛 ${selectedProblem.contestId}` : ""}
              </p>
            </div>
            <div className="rd-problem-actions">
              <span className={`rd-solved-badge ${selectedProblem.solvedLater ? "badge-good" : "badge-bad"}`}>
                {selectedProblem.solvedLater ? "已通过" : "仍未通过"}
              </span>
              {selectedProblemRecord?.url ? (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    if (window.desktopBridge?.openExternal) {
                      window.desktopBridge.openExternal(selectedProblemRecord.url);
                    } else {
                      window.open(selectedProblemRecord.url, "_blank");
                    }
                  }}
                >
                  打开题目 ↗
                </button>
              ) : null}
            </div>
          </div>

          <div className="rd-metrics">
            <article>
              <span>尝试次数</span>
              <strong>{selectedProblem.attemptCount}</strong>
            </article>
            <article>
              <span>复习状态</span>
              <strong>{statusLabel(selectedProblem.reviewStatus)}</strong>
            </article>
            <article>
              <span>下次复习</span>
              <strong>{selectedProblem.nextReviewAt ? formatDate(selectedProblem.nextReviewAt) : "未设置"}</strong>
            </article>
            <article>
              <span>最近判定</span>
              <strong className={
                verdictTone(selectedProblem.latestVerdict) === "good" ? "text-good" :
                verdictTone(selectedProblem.latestVerdict) === "bad"  ? "text-bad"  : ""
              }>
                {selectedProblem.latestVerdict || "—"}
              </strong>
            </article>
            <article>
              <span>复习间隔</span>
              <strong>{srsInfo.intervalDays > 0 ? `${srsInfo.intervalDays} 天` : "—"}</strong>
            </article>
            <article>
              <span>累计复习</span>
              <strong>{srsInfo.repetitionCount > 0 ? `${srsInfo.repetitionCount} 次` : "—"}</strong>
            </article>
          </div>

          {selectedTags.length > 0 && (
            <div className="rd-tags">
              {selectedTags.map((tag) => (
                <span key={tag} className="rd-tag">{tagLabel(tag)}</span>
              ))}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="rd-tabs">
          {[
            { id: "state",       label: "复习状态" },
            { id: "submissions", label: `提交记录${hasSubmissions ? ` (${selectedSubmissions.length})` : ""}` },
            { id: "raw",         label: "原始数据" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`rd-tab${activeTab === tab.id ? " rd-tab--active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab: Review State */}
        {activeTab === "state" && (
          <div className="panel rd-state-panel">
            {!reviewStateSupported && (
              <p className="rd-support-msg">{supportMessage}</p>
            )}

            <div className="rd-field">
              <span className="rd-label">复习状态</span>
              <div className="rd-status-btns">
                {STATUS_OPTIONS.map((opt, i) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`rd-status-btn${reviewState.status === opt.value ? " rd-status-btn--active" : ""}`}
                    disabled={!reviewStateSupported}
                    onClick={() => setReviewState((s) => ({ ...s, status: opt.value }))}
                  >
                    <span className="rd-status-key">{i + 1}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rd-field">
              <span className="rd-label">间隔重复评分</span>
              <div className="rd-rate-btns">
                {RATE_OPTIONS.map((opt) => (
                  <button
                    key={opt.quality}
                    type="button"
                    className={`rd-rate-btn ${opt.className}`}
                    disabled={!reviewStateSupported || rating || serviceUnavailable}
                    onClick={() => handleRate(opt.quality)}
                    title={`快捷键 ${opt.key}`}
                  >
                    <span className="rd-rate-key">{opt.key}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
              {srsInfo.intervalDays > 0 && (
                <p className="rd-srs-hint">当前间隔 {srsInfo.intervalDays} 天 · 已复习 {srsInfo.repetitionCount} 次 · 熟练度 {srsInfo.easeFactor.toFixed(2)}</p>
              )}
            </div>

            <div className="rd-field">
              <label className="rd-label" htmlFor="rd-next-review">下次复习时间（手动调整）</label>
              <input
                id="rd-next-review"
                type="datetime-local"
                value={reviewState.nextReviewAt}
                disabled={!reviewStateSupported}
                onChange={(e) => setReviewState((s) => ({ ...s, nextReviewAt: e.target.value }))}
              />
            </div>

            <div className="rd-field">
              <div className="rd-notes-header">
                <label className="rd-label" htmlFor="rd-notes">笔记</label>
                <span className="rd-char-count">{reviewState.notes.length} 字</span>
              </div>
              <textarea
                id="rd-notes"
                className="rd-notes-area"
                rows={6}
                value={reviewState.notes}
                disabled={!reviewStateSupported}
                placeholder={"记录错误原因、正确思路…\n\n支持 **粗体**、`代码`、## 标题、- 列表"}
                onChange={(e) => setReviewState((s) => ({ ...s, notes: e.target.value }))}
              />
            </div>

            {reviewState.notes.trim() && (
              <div className="rd-preview">
                <span className="rd-label">预览</span>
                <div className="rd-preview-body">
                  <SimpleMarkdown text={reviewState.notes} />
                </div>
              </div>
            )}

            <div className="rd-save-bar">
              <span className="rd-last-saved">
                {reviewState.lastUpdatedAt
                  ? `上次保存 ${formatDate(reviewState.lastUpdatedAt)}`
                  : "尚未保存"}
              </span>
              <button
                type="button"
                className="primary-button rd-save-btn"
                disabled={reviewSaving || serviceUnavailable || !reviewStateSupported}
                onClick={() => void saveReviewState()}
              >
                {reviewSaving ? (
                  <><span className="rd-spinner" /> 保存中…</>
                ) : (
                  <><span className="rd-kbd-hint">⌘S</span> 保存</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Tab: Submissions */}
        {activeTab === "submissions" && (
          <div className="panel rd-subs-panel">
            {!hasSubmissions ? (
              <p className="muted">当前范围内未找到该题的提交记录。</p>
            ) : (
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
                        <span className={`rd-verdict-badge ${tone === "good" ? "badge-good" : tone === "bad" ? "badge-bad" : "badge-neutral"}`}>
                          {sub.verdict}
                        </span>
                        <div>
                          <strong className="rd-sub-lang">{sub.language || "未知语言"}</strong>
                          <p className="rd-sub-date muted">{formatDate(sub.submittedAt)}</p>
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
            )}
          </div>
        )}

        {/* Tab: Raw Data */}
        {activeTab === "raw" && (
          <div className="panel rd-raw-panel">
            <p className="rd-raw-note muted">当前服务返回 raw_json（提交元数据），非源代码。</p>
            {representativeSubmission ? (
              <pre className="rd-raw-pre">{formatRawJSON(representativeSubmission.rawJson)}</pre>
            ) : (
              <p className="muted">无可用原始数据。</p>
            )}
          </div>
        )}

      </div>

      {toast && (
        <Toast
          message={toast.message}
          isError={toast.isError}
          onDone={() => setToast(null)}
        />
      )}
    </div>
  );
}
