import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import useSWR from "swr";
import { api } from "../lib/api.js";

function getMonthStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfWeek(year, month) {
  return new Date(year, month - 1, 1).getDay();
}

const WEEKDAY_KEYS = ["日", "一", "二", "三", "四", "五", "六"];
const WEEKDAY_KEYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function ReviewCalendar() {
  const { t, i18n } = useTranslation();
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const monthStr = getMonthStr(currentDate);

  const { data } = useSWR(
    `/api/review/calendar?month=${monthStr}`,
    () => api.getReviewCalendar(monthStr),
    { refreshInterval: 60000 }
  );

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);
  const todayStr = new Date().toISOString().slice(0, 10);

  const dayMap = useMemo(() => {
    const map = {};
    if (data?.days) {
      for (const d of data.days) {
        map[d.date] = d;
      }
    }
    return map;
  }, [data]);

  const goToPrevMonth = () => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const isEnglish = i18n.language?.startsWith("en");
  const weekdays = isEnglish ? WEEKDAY_KEYS_EN : WEEKDAY_KEYS;

  const monthLabel = isEnglish
    ? currentDate.toLocaleDateString("en-US", { year: "numeric", month: "long" })
    : `${year}年${month}月`;

  const cells = [];
  for (let i = 0; i < firstDay; i++) {
    cells.push(<div key={`empty-${i}`} className="cal-cell cal-cell-empty" />);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dayData = dayMap[dateStr];
    const isToday = dateStr === todayStr;
    const due = dayData?.due || 0;
    const completed = dayData?.completed || 0;

    let heatLevel = "";
    if (completed > 0) {
      heatLevel = completed >= 5 ? "cal-heat-3" : completed >= 3 ? "cal-heat-2" : "cal-heat-1";
    }

    cells.push(
      <div
        key={d}
        className={`cal-cell ${isToday ? "cal-today" : ""} ${heatLevel}`}
        title={due > 0 || completed > 0 ? `${t("review.calendar.due")}: ${due}, ${t("review.calendar.completed")}: ${completed}` : ""}
      >
        <span className="cal-day-num">{d}</span>
        {(due > 0 || completed > 0) && (
          <div className="cal-indicators">
            {due > 0 && <span className="cal-due-dot" title={`${due} ${t("review.calendar.due")}`}>{due}</span>}
            {completed > 0 && <span className="cal-done-dot" title={`${completed} ${t("review.calendar.completed")}`}>{completed}</span>}
          </div>
        )}
      </div>
    );
  }

  const currentStreak = data?.currentStreak || 0;
  const longestStreak = data?.longestStreak || 0;
  const todayDue = data?.todayDue || 0;

  return (
    <div className="review-calendar">
      <div className="cal-header">
        <h3 className="cal-title">{t("review.calendar.title")}</h3>
        <div className="cal-stats">
          <div className="cal-stat">
            <span className="cal-stat-value">{todayDue}</span>
            <span className="cal-stat-label">{t("review.calendar.todayDue")}</span>
          </div>
          <div className="cal-stat">
            <span className="cal-stat-value">{currentStreak}</span>
            <span className="cal-stat-label">{t("review.calendar.currentStreak")}</span>
          </div>
          <div className="cal-stat">
            <span className="cal-stat-value">{longestStreak}</span>
            <span className="cal-stat-label">{t("review.calendar.longestStreak")}</span>
          </div>
        </div>
      </div>

      <div className="cal-nav">
        <button type="button" className="cal-nav-btn" onClick={goToPrevMonth}>‹</button>
        <button type="button" className="cal-month-label" onClick={goToToday}>{monthLabel}</button>
        <button type="button" className="cal-nav-btn" onClick={goToNextMonth}>›</button>
      </div>

      <div className="cal-grid">
        {weekdays.map((wd) => (
          <div key={wd} className="cal-weekday">{wd}</div>
        ))}
        {cells}
      </div>

      <div className="cal-legend">
        <span className="cal-legend-item">
          <span className="cal-legend-swatch cal-heat-1" />
          1-2
        </span>
        <span className="cal-legend-item">
          <span className="cal-legend-swatch cal-heat-2" />
          3-4
        </span>
        <span className="cal-legend-item">
          <span className="cal-legend-swatch cal-heat-3" />
          5+
        </span>
      </div>
    </div>
  );
}
