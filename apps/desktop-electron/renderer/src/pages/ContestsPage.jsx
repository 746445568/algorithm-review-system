import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api.js";

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
  return `第${week}周 ${fmt(monday)} – ${fmt(sunday)}`;
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
  if (!minutes) return "—";
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
  const label = platform === "codeforces" ? "CF" : platform === "atcoder" ? "AC" : platform;
  return <span className={`platform-badge platform-badge--${platform?.toLowerCase() ?? "other"}`}>{label}</span>;
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
  const [filter, setFilter] = useState("upcoming"); // "upcoming" | "all"
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
    // 进入页面时自动同步最新比赛
    void api.syncContests().catch(() => {});
    void loadContests(filter);
  }, [filter, loadContests]);

  const groups = groupByWeek(contests);

  return (
    <div className="page-content contests-page">
      <div className="toolbar">
        <div className="filter-toggle">
          <button
            type="button"
            className={`toggle-btn${filter === "upcoming" ? " active" : ""}`}
            onClick={() => setFilter("upcoming")}
          >
            即将开始
          </button>
          <button
            type="button"
            className={`toggle-btn${filter === "all" ? " active" : ""}`}
            onClick={() => setFilter("all")}
          >
            全部
          </button>
        </div>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      {loading ? (
        <p className="muted-text">加载中...</p>
      ) : groups.length === 0 ? (
        <p className="muted-text">暂无比赛数据</p>
      ) : (
        groups.map((group) => (
          <section key={group.monday.toISOString()} className="contest-week-group">
            <h4 className="week-header">{formatWeekHeader(group.monday)}</h4>
            <div className="contest-list">
              {group.contests.map((c) => (
                <div key={c.id} className="contest-card">
                  <div className="contest-card-left">
                    <PlatformBadge platform={c.platform} />
                    <div className="contest-info">
                      <span className="contest-name">
                        {c.url ? (
                          <a href={c.url} target="_blank" rel="noopener noreferrer">
                            {c.name}
                          </a>
                        ) : (
                          c.name
                        )}
                      </span>
                      <span className="contest-meta">
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
