// Local calendar dates as "YYYY-MM-DD" strings.
//
// Never `new Date('YYYY-MM-DD')`: that parses as UTC midnight and shows the
// previous day west of Greenwich. Arithmetic here goes through a plain day
// number (days since 1970-01-01), using Date.UTC only as a calendar table,
// so no timezone ever enters the result. Shared by the client and the
// planner API (plugins/planner-core.js), so keep it free of DOM and Node APIs.

const DAY_MS = 86400000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const pad = (n, w = 2) => String(n).padStart(w, '0');

/** "YYYY-MM-DD" -> { y, m, d } (m is 1..12), or null if not a real calendar date. */
export function parseDate(iso) {
  if (typeof iso !== 'string') return null;
  const match = ISO_RE.exec(iso);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

export const isDate = (iso) => parseDate(iso) !== null;

export function formatDate(y, m, d) {
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

export function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Days since 1970-01-01 for a valid "YYYY-MM-DD". */
export function toDayNumber(iso) {
  const p = parseDate(iso);
  if (!p) throw new RangeError(`invalid date: ${iso}`);
  return Math.round(Date.UTC(p.y, p.m - 1, p.d) / DAY_MS);
}

export function fromDayNumber(n) {
  const dt = new Date(n * DAY_MS);
  return formatDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export const addDays = (iso, n) => fromDayNumber(toDayNumber(iso) + n);

/** Negative, zero or positive, like a sort comparator. ISO strings sort lexically. */
export function compareDates(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Inclusive length of a range in days: same day -> 1. */
export const rangeLength = (start, end) => toDayNumber(end) - toDayNumber(start) + 1;

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(iso) {
  // 1970-01-01 was a Thursday (index 3).
  return (((toDayNumber(iso) + 3) % 7) + 7) % 7;
}

/** ISO-8601 week number: weeks start Monday, week 1 holds the year's first Thursday. */
export function isoWeek(iso) {
  const n = toDayNumber(iso);
  const thursday = n - weekdayIndex(iso) + 3;
  const year = Number(fromDayNumber(thursday).slice(0, 4));
  const jan1 = toDayNumber(formatDate(year, 1, 1));
  return Math.floor((thursday - jan1) / 7) + 1;
}

/** Today in the visitor's local timezone. */
export function today(now = new Date()) {
  return formatDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** "YYYY-MM" -> { y, m } or null. */
export function parseMonth(key) {
  if (typeof key !== 'string') return null;
  const match = MONTH_RE.exec(key);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  return m >= 1 && m <= 12 && y >= 1 ? { y, m } : null;
}

export const monthKey = (y, m) => `${pad(y, 4)}-${pad(m)}`;
export const monthOf = (iso) => iso.slice(0, 7);

export function addMonths(key, n) {
  const { y, m } = parseMonth(key);
  const total = y * 12 + (m - 1) + n;
  return monthKey(Math.floor(total / 12), (total % 12) + 1);
}

/** Same day-of-month `n` months away, clamped to the target month's length. */
export function addMonthsToDate(iso, n) {
  const { d } = parseDate(iso);
  const key = addMonths(monthOf(iso), n);
  const { y, m } = parseMonth(key);
  return formatDate(y, m, Math.min(d, daysInMonth(y, m)));
}

/**
 * Monday-first weeks covering a month: [{ week, days: [7 x "YYYY-MM-DD"] }].
 * Leading and trailing days belong to the neighbouring months.
 */
export function monthGrid(key) {
  const { y, m } = parseMonth(key);
  const first = formatDate(y, m, 1);
  const last = formatDate(y, m, daysInMonth(y, m));
  let cursor = toDayNumber(first) - weekdayIndex(first);
  const end = toDayNumber(last);
  const weeks = [];
  while (cursor <= end) {
    const days = Array.from({ length: 7 }, (_, i) => fromDayNumber(cursor + i));
    weeks.push({ week: isoWeek(days[0]), days });
    cursor += 7;
  }
  return weeks;
}

/** "Nov 3" (or "Nov 3 2027" when `withYear`). */
export function shortDate(iso, withYear = false) {
  const { y, m, d } = parseDate(iso);
  return `${MONTHS[m - 1].slice(0, 3)} ${d}${withYear ? ` ${y}` : ''}`;
}

/** "Monday, 3 November 2025" */
export function longDate(iso) {
  const { y, m, d } = parseDate(iso);
  return `${WEEKDAYS[weekdayIndex(iso)]}, ${d} ${MONTHS[m - 1]} ${y}`;
}

/** "Nov 3 → Nov 9", adding years only when they differ from `refYear` or each other. */
export function rangeLabel(start, end, refYear) {
  const sy = start.slice(0, 4);
  const ey = end.slice(0, 4);
  const showYear = sy !== ey || (refYear != null && sy !== String(refYear));
  if (start === end) return shortDate(start, showYear);
  return `${shortDate(start, showYear)} → ${shortDate(end, showYear)}`;
}
