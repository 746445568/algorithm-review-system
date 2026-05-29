import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api.js";
import "../styles/ui-contests.css";

const STATUS_FILTERS = [
  { key: "upcoming", label: "即将开始" },
  { key: "all", label: "全部状态" },
];

const PLATFORM_FILTERS = [
  { key: "all", label: "全部" },
  { key: "codeforces", label: "Codeforces" },
  { key: "atcoder", label: "AtCoder" },
];

function normalizePlatform(platform) {
  const value = String(platform ?? "").trim().toLowerCase();
  if (value === "cf" || value === "codeforces") return "codeforces";
  if (value === "at" || value === "ac" || value === "atcoder") return "atcoder";
  return value || "other";
}

// Returns ISO week number (1-53) for a given Date
function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

// Returns the Monday of the ISO week that contains `date`
function getISOWeekMonday(date) {
  const d = new Date(date);
  const dayNum = d.getUTCDay() || 7; // 1=Mon ... 7=Sun
  d.setUTCDate(d.getUTCDate() - dayNum + 1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function formatWeekHeader(monday) {
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  const week = getISOWeek(monday);
  const fmt = (d) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  return `第 ${week} 周 · ${fmt(monday)} - ${fmt(sunday)}`;
}

// Convert any ISO timestamp to a Date object shifted to UTC+8 (Beijing)
function toBeijingDate(isoStr) {
  const utcMs = new Date(isoStr).getTime();
  return new Date(utcMs + 8 * 60 * 60 * 1000);
}

function formatStartTime(isoStr) {
  const d = toBeijingDate(isoStr);
  const M = d.getUTCMonth() + 1;
  const D = d.getUTCDate();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${M}/${D} ${hh}:${mm} (北京)`;
}

function formatDuration(minutes) {
  if (!minutes) return "-";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function groupByWeek(contests) {
  const groups = new Map(); // key: "YYYY-WNN"
  for (const c of contests) {
    const start = toBeijingDate(c.startTime);
    const monday = getISOWeekMonday(start);
    const year = monday.getFullYear();
    const week = getISOWeek(monday);
    const key = `${year}-W${String(week).padStart(2, "0")}`;
    if (!groups.has(key)) {
      groups.set(key, { monday, contests: [] });
    }
    groups.get(key).contests.push(c);
  }
  // Sort groups by date ascending
  return Array.from(groups.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([, v]) => v);
}

function PlatformBadge({ platform }) {
  const normalized = normalizePlatform(platform);
  const label = normalized === "codeforces" ? "CF" : normalized === "atcoder" ? "AT" : platform;
  return <span className={`platform-badge platform-badge--${normalized}`}>{label}</span>;
}

function StatusBadge({ status }) {
  const map = {
    UPCOMING: { label: "即将开始", cls: "upcoming" },
    ONGOING: { label: "进行中", cls: "ongoing" },
    FINISHED: { label: "已结束", cls: "finished" },
  };
  const { label, cls } = map[status] ?? { label: status, cls: "finished" };
  return <span className={`status-badge ${cls}`}>{label}</span>;
}

export function ContestsPage() {
  const [contests, setContests] = useState([]);
  const [statusFilter, setStatusFilter] = useState("upcoming"); // "upcoming" | "all"
  const [platformFilter, setPlatformFilter] = useState("all"); // "all" | "codeforces" | "atcoder"
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadContests = useCallback(async (currentFilter) => {
    setLoading(true);
    setError(null);
    try {
      const query = currentFilter === "upcoming" ? { status: "UPCOMING" } : {};
      const data = await api.getContests(query);
      setContests(Array.isArray(data) ? data : data?.contests ?? []);
    } catch (err) {
      setError(err?.message ?? "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void api.syncContests().catch(() => {});
    void loadContests(statusFilter);
  }, [statusFilter, loadContests]);

  const summary = {
    all: contests.length,
    codeforces: contests.filter((contest) => normalizePlatform(contest.platform) === "codeforces").length,
    atcoder: contests.filter((contest) => normalizePlatform(contest.platform) === "atcoder").length,
  };
  const filteredContests =
    platformFilter === "all"
      ? contests
      : contests.filter((contest) => normalizePlatform(contest.platform) === platformFilter);
  const groups = groupByWeek(filteredContests);
  const activePlatformLabel = PLATFORM_FILTERS.find((item) => item.key === platformFilter)?.label ?? "当前平台";

  return (
    <div className="page-content contests-page">
      <div className="contest-toolbar">
        <div className="contest-toolbar-copy">
          <span className="section-label">Contests</span>
          <h2>比赛日历</h2>
          <p>按平台分类筛选，不影响后端接口和数据同步。</p>
        </div>

        <div className="contest-toolbar-actions">
          <div className="filter-tabs" aria-label="平台筛选">
            {PLATFORM_FILTERS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`filter-tab${platformFilter === item.key ? " active" : ""}`}
                onClick={() => setPlatformFilter(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="contest-status-toggle" aria-label="状态筛选">
            {STATUS_FILTERS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`contest-status-btn${statusFilter === item.key ? " active" : ""}`}
                onClick={() => setStatusFilter(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="contest-summary">
        <article className={`summary-card${platformFilter === "all" ? " active" : ""}`}>
          <span className="summary-val">{summary.all}</span>
          <span className="summary-label">全部比赛</span>
        </article>
        <article className={`summary-card${platformFilter === "codeforces" ? " active" : ""}`}>
          <span className="summary-val">{summary.codeforces}</span>
          <span className="summary-label">Codeforces</span>
        </article>
        <article className={`summary-card${platformFilter === "atcoder" ? " active" : ""}`}>
          <span className="summary-val">{summary.atcoder}</span>
          <span className="summary-label">AtCoder</span>
        </article>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      {loading ? (
        <div className="contest-state contest-state--loading">
          <p className="muted-text">加载中...</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="contest-state">
          <p className="muted-text">
            {contests.length === 0 ? "暂无比赛数据" : `暂无 ${activePlatformLabel} 比赛`}
          </p>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.monday.toISOString()} className="contest-week-group">
            <h4 className="week-header">{formatWeekHeader(group.monday)}</h4>
            <div className="contest-list">
              {group.contests.map((c) => (
                <div key={c.id} className="calendar-item contest-card">
                  <div className="contest-card-left">
                    <PlatformBadge platform={c.platform} />
                    <div className="contest-info calendar-main">
                      <span className="contest-name calendar-name">
                        {c.url ? (
                          <a href={c.url} target="_blank" rel="noopener noreferrer">
                            {c.name}
                          </a>
                        ) : (
                          c.name
                        )}
                      </span>
                      <span className="contest-meta calendar-meta">
                        {formatStartTime(c.startTime)} · {formatDuration(c.durationMinutes)}
                      </span>
                    </div>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
