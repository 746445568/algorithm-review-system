import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from 'react-i18next';

const WEEKDAYS_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatDateValue(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseDateValue(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function clampTimePart(value, max) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 2);
  if (!digits) return "00";
  return pad2(Math.min(Number(digits), max));
}

function buildCalendarDays(viewDate) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date,
      value: formatDateValue(date),
      inMonth: date.getMonth() === month,
    };
  });
}

function useOutsideDismiss(ref, onDismiss) {
  useEffect(() => {
    function handlePointerDown(event) {
      if (ref.current && !ref.current.contains(event.target)) {
        onDismiss();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [onDismiss, ref]);
}

export function AppSelect({
  value,
  options,
  onChange,
  disabled = false,
  placeholder,
  className = "",
}) {
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder ?? t('controls.selectPlaceholder');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);

  const selectedIndex = options.findIndex((option) => String(option.value) === String(value));
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null;

  const close = useCallback(() => setOpen(false), []);
  useOutsideDismiss(rootRef, close);

  useEffect(() => {
    if (open) {
      setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    }
  }, [open, selectedIndex]);

  function choose(option) {
    if (disabled || option.disabled) return;
    onChange(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function handleKeyDown(event) {
    if (disabled) return;

    if (event.key === "Escape") {
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => {
        const next = (current + delta + options.length) % options.length;
        return next;
      });
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const option = options[activeIndex];
      if (option) choose(option);
    }
  }

  return (
    <div
      className={`app-select${open ? " is-open" : ""}${disabled ? " is-disabled" : ""}${className ? ` ${className}` : ""}`}
      ref={rootRef}
      onKeyDown={handleKeyDown}
    >
      <button
        ref={buttonRef}
        type="button"
        className="app-control-trigger app-select-trigger"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selectedOption ? "app-select-value" : "app-control-placeholder"}>
          {selectedOption?.label ?? resolvedPlaceholder}
        </span>
        <span className="app-control-chevron" aria-hidden="true" />
      </button>

      {open ? (
        <div className="app-popover app-select-menu" role="listbox">
          {options.map((option, index) => {
            const selected = String(option.value) === String(value);
            return (
              <button
                key={option.value}
                type="button"
                className={`app-select-option${selected ? " is-selected" : ""}${index === activeIndex ? " is-active" : ""}`}
                disabled={option.disabled}
                onClick={() => choose(option)}
                role="option"
                aria-selected={selected}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function CalendarPopover({
  value,
  viewDate,
  setViewDate,
  onSelect,
  onClear,
  footer,
}) {
  const { t } = useTranslation();
  const todayValue = formatDateValue(new Date());
  const selectedValue = value || "";
  const days = useMemo(() => buildCalendarDays(viewDate), [viewDate]);
  const weekdays = WEEKDAYS_KEYS.map((key) => t(`controls.weekdays.${key}`));

  function shiftMonth(delta) {
    setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  return (
    <div className="app-popover app-calendar-popover">
      <div className="app-calendar-head">
        <strong>{t('controls.calendarMonth', { year: viewDate.getFullYear(), month: pad2(viewDate.getMonth() + 1) })}</strong>
        <div className="app-calendar-nav">
          <button type="button" onClick={() => shiftMonth(-1)} aria-label={t('controls.prevMonth')}>‹</button>
          <button type="button" onClick={() => shiftMonth(1)} aria-label={t('controls.nextMonth')}>›</button>
        </div>
      </div>

      <div className="app-calendar-grid app-calendar-weekdays">
        {weekdays.map((day) => <span key={day}>{day}</span>)}
      </div>

      <div className="app-calendar-grid">
        {days.map((day) => (
          <button
            key={day.value}
            type="button"
            className={`app-calendar-day${day.inMonth ? "" : " is-muted"}${day.value === selectedValue ? " is-selected" : ""}${day.value === todayValue ? " is-today" : ""}`}
            onClick={() => onSelect(day.value)}
          >
            {day.date.getDate()}
          </button>
        ))}
      </div>

      {footer}

      <div className="app-calendar-actions">
        <button type="button" onClick={onClear}>{t('controls.clear')}</button>
        <button type="button" onClick={() => onSelect(todayValue)}>{t('controls.today')}</button>
      </div>
    </div>
  );
}

export function AppDatePicker({
  value,
  onChange,
  disabled = false,
  placeholder,
  className = "",
}) {
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder ?? t('controls.selectDate');
  const [open, setOpen] = useState(false);
  const selectedDate = parseDateValue(value);
  const [viewDate, setViewDate] = useState(() => selectedDate || new Date());
  const rootRef = useRef(null);

  const close = useCallback(() => setOpen(false), []);
  useOutsideDismiss(rootRef, close);

  useEffect(() => {
    if (open) setViewDate(parseDateValue(value) || new Date());
  }, [open, value]);

  function selectDate(nextValue) {
    onChange(nextValue);
    setOpen(false);
  }

  return (
    <div className={`app-date-control${open ? " is-open" : ""}${className ? ` ${className}` : ""}`} ref={rootRef}>
      <button
        type="button"
        className="app-control-trigger app-date-trigger"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={value ? "app-date-value" : "app-control-placeholder"}>
          {value || resolvedPlaceholder}
        </span>
        <span className="app-calendar-icon" aria-hidden="true" />
      </button>

      {open ? (
        <CalendarPopover
          value={value}
          viewDate={viewDate}
          setViewDate={setViewDate}
          onSelect={selectDate}
          onClear={() => selectDate("")}
        />
      ) : null}
    </div>
  );
}

export function AppDateTimePicker({
  value,
  onChange,
  disabled = false,
  placeholder,
  className = "",
}) {
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder ?? t('controls.selectTime');
  const [open, setOpen] = useState(false);
  const [datePart = "", timePart = "09:00"] = String(value || "").split("T");
  const [hour, setHour] = useState(timePart.slice(0, 2) || "09");
  const [minute, setMinute] = useState(timePart.slice(3, 5) || "00");
  const selectedDate = parseDateValue(datePart);
  const [viewDate, setViewDate] = useState(() => selectedDate || new Date());
  const rootRef = useRef(null);

  const close = useCallback(() => setOpen(false), []);
  useOutsideDismiss(rootRef, close);

  useEffect(() => {
    if (!open) return;
    setViewDate(parseDateValue(datePart) || new Date());
    setHour(timePart.slice(0, 2) || "09");
    setMinute(timePart.slice(3, 5) || "00");
  }, [datePart, open, timePart]);

  function emit(nextDate, nextHour = hour, nextMinute = minute) {
    if (!nextDate) {
      onChange("");
      return;
    }
    onChange(`${nextDate}T${clampTimePart(nextHour, 23)}:${clampTimePart(nextMinute, 59)}`);
  }

  function handleHourChange(event) {
    const nextHour = event.target.value.replace(/\D/g, "").slice(0, 2);
    setHour(nextHour);
  }

  function handleMinuteChange(event) {
    const nextMinute = event.target.value.replace(/\D/g, "").slice(0, 2);
    setMinute(nextMinute);
  }

  function commitTime() {
    const nextHour = clampTimePart(hour, 23);
    const nextMinute = clampTimePart(minute, 59);
    setHour(nextHour);
    setMinute(nextMinute);
    if (datePart) {
      emit(datePart, nextHour, nextMinute);
    }
  }

  const footer = (
    <div className="app-time-row">
      <span>{t('controls.time')}</span>
      <input
        value={hour}
        inputMode="numeric"
        onChange={handleHourChange}
        onBlur={commitTime}
        aria-label={t('controls.hour')}
      />
      <span>:</span>
      <input
        value={minute}
        inputMode="numeric"
        onChange={handleMinuteChange}
        onBlur={commitTime}
        aria-label={t('controls.minute')}
      />
    </div>
  );

  return (
    <div className={`app-date-control${open ? " is-open" : ""}${className ? ` ${className}` : ""}`} ref={rootRef}>
      <button
        type="button"
        className="app-control-trigger app-date-trigger"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={value ? "app-date-value" : "app-control-placeholder"}>
          {value ? value.replace("T", " ") : resolvedPlaceholder}
        </span>
        <span className="app-calendar-icon" aria-hidden="true" />
      </button>

      {open ? (
        <CalendarPopover
          value={datePart}
          viewDate={viewDate}
          setViewDate={setViewDate}
          onSelect={(nextDate) => {
            emit(nextDate);
            setOpen(false);
          }}
          onClear={() => {
            emit("");
            setOpen(false);
          }}
          footer={footer}
        />
      ) : null}
    </div>
  );
}
