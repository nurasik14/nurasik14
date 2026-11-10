/* ## weekly: WakaTime editor time (public/data/wakatime.json, written daily by
 * scripts/wakatime_stats.py) and the weekly digests (public/data/weekly/,
 * written by scripts/weekly_digest.py). Fetched at runtime like github.json:
 * one cached promise per file, a validator, and a { status, data, error } hook.
 * A missing or malformed file is an error state for that block only; numbers
 * are never made up. Everything except the loaders and hooks is pure. */
import { useEffect, useState } from 'react';
import { MONTHS } from './contrib';

export const WAKA_FILE = 'data/wakatime.json';
export const INDEX_FILE = 'data/weekly/index.json';
const BASE = import.meta.env.BASE_URL ?? '/';

/* ---- validators ---------------------------------------------------------- */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const WEEK = /^\d{4}-W\d{2}$/;
// Only digest files from this directory are ever fetched.
const DIGEST_FILE = /^data\/weekly\/\d{4}-W\d{2}\.json$/;

const isObj = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x);
const isNum = (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const isStr = (x) => typeof x === 'string';
const isNumOrNull = (x) => x === null || isNum(x);

/** A source the digest could not read: { error: "..." }. */
export const isSourceError = (x) => isObj(x) && isStr(x.error);

const isRows = (xs) =>
  Array.isArray(xs) && xs.every((r) => isObj(r) && isStr(r.name) && r.name && isNum(r.seconds) && isNum(r.percent));

const isDays = (xs) =>
  Array.isArray(xs) &&
  xs.length > 0 &&
  xs.every((d) => isObj(d) && DATE.test(d.date) && isNum(d.seconds) && isObj(d.categories) && Object.values(d.categories).every(isNum));

/** The WakaTime block shared by wakatime.json and a digest's `wakatime`. */
export function isWakaStats(w) {
  return Boolean(
    isObj(w) &&
      isNum(w.total_seconds) &&
      isNum(w.daily_average_seconds) &&
      isNum(w.active_days) &&
      ['categories', 'projects', 'languages', 'editors'].every((k) => isRows(w[k])) &&
      isDays(w.days),
  );
}

/** public/data/wakatime.json */
export function isWakaData(d) {
  return Boolean(
    isWakaStats(d) && isStr(d.generated) && isObj(d.range) && DATE.test(d.range.start) && DATE.test(d.range.end),
  );
}

const isIndexRow = (w) =>
  isObj(w) &&
  WEEK.test(w.week) &&
  DATE.test(w.start) &&
  DATE.test(w.end) &&
  typeof w.complete === 'boolean' &&
  isStr(w.file) &&
  DIGEST_FILE.test(w.file) &&
  isNumOrNull(w.coding_seconds) &&
  isNumOrNull(w.commits) &&
  (w.top_track === null || isStr(w.top_track));

/** public/data/weekly/index.json */
export function isDigestIndex(d) {
  return Boolean(isObj(d) && Array.isArray(d.weeks) && d.weeks.every(isIndexRow));
}

const isGit = (g) =>
  isObj(g) &&
  isNum(g.total) &&
  Array.isArray(g.repos) &&
  g.repos.every((r) => isObj(r) && isStr(r.name) && isNum(r.commits) && Array.isArray(r.latest) && r.latest.every(isStr));

const isLastfm = (m) =>
  isObj(m) &&
  isNum(m.scrobbles) &&
  Array.isArray(m.tracks) &&
  m.tracks.every((t) => isObj(t) && isStr(t.name) && isStr(t.artist) && isNum(t.plays) && (t.url == null || isStr(t.url)));

/** public/data/weekly/<week>.json. Each source is either valid or { error }. */
export function isDigest(d) {
  return Boolean(
    isObj(d) &&
      WEEK.test(d.week) &&
      DATE.test(d.start) &&
      DATE.test(d.end) &&
      typeof d.complete === 'boolean' &&
      Array.isArray(d.highlights) &&
      d.highlights.every(isStr) &&
      (isSourceError(d.wakatime) || isWakaStats(d.wakatime)) &&
      (isSourceError(d.git) || isGit(d.git)) &&
      (isSourceError(d.lastfm) || isLastfm(d.lastfm)),
  );
}

/* ---- formatting ------------------------------------------------------------ */

/** Seconds as "3h 05m", or "59m" under an hour (same as the Python scripts). */
export function hm(seconds) {
  const total = Math.round((Number(seconds) || 0) / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const parse = (iso) => new Date(`${iso}T00:00:00Z`);

/** "Nov 4" */
export const fmtDate = (iso) => {
  const d = parse(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

/** { weekday: "Wed", day: 4 } for the chart's axis */
export const dayParts = (iso) => {
  const d = parse(iso);
  return { weekday: WEEKDAYS[d.getUTCDay()], day: d.getUTCDate() };
};

/** "Nov 4 – 10, 2026", "Oct 27 – Nov 2, 2026", "Dec 29, 2025 – Jan 4, 2026" */
export function fmtRange(start, end) {
  const a = parse(start);
  const b = parse(end);
  const ya = a.getUTCFullYear();
  const yb = b.getUTCFullYear();
  if (ya !== yb) return `${fmtDate(start)}, ${ya} – ${fmtDate(end)}, ${yb}`;
  const right = a.getUTCMonth() === b.getUTCMonth() ? String(b.getUTCDate()) : fmtDate(end);
  return `${fmtDate(start)} – ${right}, ${yb}`;
}

const TZ_ABBR = { 'Asia/Hong_Kong': 'HKT', UTC: 'UTC' };

/** An ISO timestamp in the data's time zone: "Nov 11, 04:16 HKT". Unparseable input is returned as is. */
export function fmtStamp(iso, timeZone = 'Asia/Hong_Kong') {
  const t = new Date(iso);
  if (!isStr(iso) || Number.isNaN(t.getTime())) return String(iso ?? '');
  let zone = timeZone;
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(t);
  } catch {
    zone = 'UTC';
    return fmtStamp(iso, zone);
  }
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('month')} ${get('day')}, ${get('hour')}:${get('minute')} ${TZ_ABBR[zone] ?? zone}`;
}

/* ---- shaping ------------------------------------------------------------------- */

const round1 = (x) => Math.round(x * 10) / 10;

/**
 * The first `n` named rows, with the rest folded into the data's own "Other"
 * row (kept last). Rows arrive sorted by seconds, largest first.
 */
export function topRows(rows = [], n = 8) {
  const named = rows.filter((r) => r.name !== 'Other');
  const rest = [...named.slice(n), ...rows.filter((r) => r.name === 'Other')];
  const out = named.slice(0, n);
  if (rest.length) {
    out.push({
      name: 'Other',
      seconds: rest.reduce((s, r) => s + r.seconds, 0),
      percent: round1(rest.reduce((s, r) => s + r.percent, 0)),
      other: true,
    });
  }
  return out;
}

/** Category colours, in this fixed order. heat-* and amber are not used here. */
export const SLOTS = 3;

/**
 * Categories with a colour slot (0..SLOTS-1). Past that, and the data's own
 * "Other", fold into one "other" entry with slot SLOTS.
 */
export function categorySlots(categories = []) {
  const named = categories.filter((c) => c.name !== 'Other' && c.seconds > 0);
  const out = named.slice(0, SLOTS).map((c, slot) => ({ ...c, slot }));
  const rest = [...named.slice(SLOTS), ...categories.filter((c) => c.name === 'Other')];
  if (rest.length) {
    out.push({
      name: rest.length === 1 && rest[0].name !== 'Other' ? rest[0].name : 'other',
      seconds: rest.reduce((s, c) => s + c.seconds, 0),
      percent: round1(rest.reduce((s, c) => s + c.percent, 0)),
      slot: SLOTS,
      members: rest.map((c) => c.name),
    });
  }
  return out;
}

/**
 * Per-day stacked segments in slot order: [{ date, seconds, segments: [{ name, seconds, slot }] }].
 * With one category (or none recorded), a day is a single segment of its total.
 */
export function stackDays(days = [], slots = categorySlots()) {
  return days.map((d) => {
    if (slots.length <= 1) {
      return { ...d, segments: d.seconds > 0 ? [{ name: slots[0]?.name ?? 'time', seconds: d.seconds, slot: 0 }] : [] };
    }
    const segments = slots
      .map((s) => ({
        name: s.name,
        slot: s.slot,
        seconds: (s.members ?? [s.name]).reduce((sum, name) => sum + (d.categories[name] ?? 0), 0),
      }))
      .filter((s) => s.seconds > 0);
    const known = new Set(slots.flatMap((s) => s.members ?? [s.name]));
    const unknown = Object.entries(d.categories).reduce((sum, [name, s]) => sum + (known.has(name) ? 0 : s), 0);
    if (unknown > 0) {
      const other = segments.find((s) => s.slot === SLOTS);
      if (other) other.seconds += unknown;
      else segments.push({ name: 'other', seconds: unknown, slot: SLOTS });
    }
    return { ...d, segments };
  });
}

/** Whole hours for the chart's top gridline (at least 1). */
export const chartMaxHours = (days = []) => Math.max(1, Math.ceil(Math.max(0, ...days.map((d) => d.seconds)) / 3600));

/* ---- loaders and hooks ------------------------------------------------------- */

const cache = new Map();

/** Fetch `file` (BASE_URL-relative) once and validate it; a failure is not cached. */
export function loadJson(file, validate, fetchImpl = globalThis.fetch) {
  const url = `${BASE}${file}`;
  if (!cache.has(url)) {
    const p = fetchImpl(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (!validate(d)) throw new Error('unexpected format');
        return d;
      })
      .catch((e) => {
        cache.delete(url); // a later mount may retry
        throw e;
      });
    cache.set(url, p);
  }
  return cache.get(url);
}

export const loadWaka = (fetchImpl) => loadJson(WAKA_FILE, isWakaData, fetchImpl);
export const loadDigestIndex = (fetchImpl) => loadJson(INDEX_FILE, isDigestIndex, fetchImpl);
export function loadDigest(file, fetchImpl) {
  if (!DIGEST_FILE.test(file ?? '')) return Promise.reject(new Error('bad digest path'));
  return loadJson(file, isDigest, fetchImpl);
}

/** { status: 'loading' | 'ready' | 'error', data, error } for `file`; null file = idle loading. */
function useJson(file, load) {
  const [state, setState] = useState({ file, status: 'loading', data: null, error: null });
  useEffect(() => {
    if (!file) return undefined;
    let live = true;
    load(file).then(
      (data) => live && setState({ file, status: 'ready', data, error: null }),
      (error) => live && setState({ file, status: 'error', data: null, error: String(error?.message ?? error) }),
    );
    return () => {
      live = false;
    };
  }, [file, load]);
  // A new file shows "loading" until its own result arrives.
  return state.file === file ? state : { file, status: 'loading', data: null, error: null };
}

const wakaLoader = () => loadWaka();
const indexLoader = () => loadDigestIndex();
const digestLoader = (file) => loadDigest(file);

export const useWaka = () => useJson(WAKA_FILE, wakaLoader);
export const useDigestIndex = () => useJson(INDEX_FILE, indexLoader);
export const useDigest = (file) => useJson(file ?? null, digestLoader);
