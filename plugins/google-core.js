// Pure Google Calendar sync logic, shared by plugins/google-sync.js and the
// tests (tests/planner/google-*.test.js). No Node or DOM APIs: hashing and
// randomness use Web Crypto, time zones use Intl. See docs/PLANNER.md#google.
import { addDays, compareDates, isDate } from '../src/planner/dates.js';
import { doneCount } from './planner-core.js';

/**
 * Least-privilege scopes, verified against the Calendar API reference
 * (docs/PLANNER.md#google lists the sources):
 * - calendar.app.created: create planner.cal (calendars.insert/get) and
 *   insert/update/delete/list events on calendars this app created, only.
 * - calendar.calendarlist.readonly: calendarList.list, to offer "pull from".
 * - calendar.events.readonly: events.list on the calendars the owner picks.
 */
export const SCOPES = [
  'https://www.googleapis.com/auth/calendar.app.created',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
];

export const GOOGLE = {
  auth: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  revoke: 'https://oauth2.googleapis.com/revoke',
  calendar: 'https://www.googleapis.com/calendar/v3',
};

export const PLANNER_CALENDAR = 'planner.cal';
export const DEFAULT_SITE = 'nurasik14.github.io/nurasik14/planner/';
export const PULL_WINDOW = { before: 60, after: 365 };
/** Colour slots for published calendars; the client maps them to muted tokens. */
export const COLOR_SLOTS = 3;
/** Most days a timed event lists in `days` (a week-long conference is 7). */
export const DAYS_CAP = 62;
export const TITLE_MAX = 200;
export const BUSY = 'busy';
export const EVENTS_VERSION = 1;

// ---------------------------------------------------------------- hosts

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * True for a Host header naming a loopback address, with an optional port:
 * "localhost:5173", "127.0.0.1", "[::1]:5184". Anything else, including
 * "localhost.evil.com" and DNS-rebinding names, is rejected.
 */
export function isLoopbackHost(host) {
  if (typeof host !== 'string') return false;
  const m = /^(\[::1\]|[a-z0-9.-]+)(?::(\d{1,5}))?$/i.exec(host.trim());
  if (!m) return false;
  if (m[2] !== undefined && (Number(m[2]) < 1 || Number(m[2]) > 65535)) return false;
  return LOOPBACK_HOSTS.has(m[1].toLowerCase());
}

/** http://<host><base>api/google/callback — base starts and ends with "/". */
export function redirectUriFor(host, base) {
  if (!isLoopbackHost(host)) throw new Error('not a loopback host');
  return `http://${host.trim().toLowerCase()}${base}api/google/callback`;
}

// ---------------------------------------------------------------- PKCE

export function base64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const randomToken = (n = 32) => base64url(globalThis.crypto.getRandomValues(new Uint8Array(n)));

async function sha256Bytes(text) {
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

export async function sha256Hex(text) {
  return Array.from(await sha256Bytes(text), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** RFC 7636 S256: a 43-char verifier and base64url(sha256(verifier)). */
export async function createPkce() {
  const verifier = randomToken(32);
  return { verifier, challenge: base64url(await sha256Bytes(verifier)), method: 'S256' };
}

export function buildAuthUrl({ clientId, redirectUri, state, challenge, scopes = SCOPES }) {
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  });
  return `${GOOGLE.auth}?${q}`;
}

/** Scopes from SCOPES that a token response's space-separated `scope` lacks. */
export function missingScopes(granted, wanted = SCOPES) {
  const have = new Set(String(granted || '').split(/\s+/).filter(Boolean));
  return wanted.filter((s) => !have.has(s));
}

/** Redirect reasons are short codes, never free text from a URL. */
export const reasonCode = (s) => (/^[a-z_]{1,32}$/.test(String(s)) ? String(s) : 'unknown');

// ---------------------------------------------------------------- time zones

const dtfCache = new Map();
function partsIn(tz) {
  if (!dtfCache.has(tz)) {
    dtfCache.set(
      tz,
      new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
    );
  }
  const fmt = dtfCache.get(tz);
  return (date) => Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
}

/** The calendar date ("YYYY-MM-DD") of an instant in `tz`. */
export function localDateIn(instant, tz) {
  const p = partsIn(tz)(instant);
  return `${p.year}-${p.month}-${p.day}`;
}

/** "HH:MM" of an instant in `tz`. */
export function localTimeIn(instant, tz) {
  const p = partsIn(tz)(instant);
  return `${p.hour}:${p.minute}`;
}

/**
 * Local days a timed event touches in `tz`. The end is exclusive, so an
 * event that ends exactly at midnight does not spill into the next day.
 */
export function eventDays(startIso, endIso, tz, cap = DAYS_CAP) {
  const s = new Date(startIso);
  let e = new Date(endIso);
  if (Number.isNaN(s.getTime())) return null;
  if (Number.isNaN(e.getTime()) || e <= s) e = s;
  else e = new Date(e.getTime() - 1);
  const first = localDateIn(s, tz);
  const last = localDateIn(e, tz);
  const days = [first];
  for (let d = addDays(first, 1); compareDates(d, last) <= 0 && days.length < cap; d = addDays(d, 1)) days.push(d);
  return days;
}

/** Midnight starting local date `iso` in `tz`, as a UTC ISO instant (for timeMin/timeMax). */
export function zonedMidnight(iso, tz) {
  const [y, m, d] = iso.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const p = partsIn(tz)(new Date(guess));
  const offset = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute)) - guess;
  return new Date(guess - offset).toISOString();
}

/** { start, end } dates of the pull window around `today`. */
export const pullWindow = (today) => ({ start: addDays(today, -PULL_WINDOW.before), end: addDays(today, PULL_WINDOW.after) });

// ---------------------------------------------------------------- pull

/**
 * A calendar's public display name. Google names the primary calendar after
 * the account's email address, so names that look like an email are replaced.
 */
export function publicCalendarName(entry, index = 0) {
  const name = String(entry?.summaryOverride || entry?.summary || '').trim();
  if (!name || name.includes('@')) return entry?.primary ? 'primary' : `calendar ${index + 1}`;
  return name.slice(0, 60);
}

/** Owner declined this event (they are an attendee with self: true). */
const declined = (ev) => Array.isArray(ev.attendees) && ev.attendees.some((a) => a?.self === true && a.responseStatus === 'declined');

/**
 * Google event -> the minimal public record, or null when it must not be
 * published (cancelled, declined, working location, unparseable). Built by
 * whitelist: description, location, attendees, organizer, conference links,
 * htmlLink and calendar ids never reach the result.
 */
export async function toPublicEvent(ev, { calendarId, calendarName, color, tz }) {
  if (!ev || typeof ev.id !== 'string' || ev.status === 'cancelled' || declined(ev)) return null;
  // A working-location "event" is where the owner works that day: location data.
  if (ev.eventType === 'workingLocation') return null;
  const hidden = ev.visibility === 'private' || ev.visibility === 'confidential';
  const title = hidden ? BUSY : String(ev.summary ?? '').trim().slice(0, TITLE_MAX) || '(no title)';
  const id = (await sha256Hex(`${calendarId}${ev.id}`)).slice(0, 12);
  const base = { id, title, calendar: calendarName, color };

  if (ev.start?.date && ev.end?.date) {
    if (!isDate(ev.start.date) || !isDate(ev.end.date)) return null;
    // Google's all-day end.date is exclusive; plans use an inclusive end.
    const end = addDays(ev.end.date, -1);
    return { ...base, start: ev.start.date, end: compareDates(end, ev.start.date) < 0 ? ev.start.date : end, allDay: true };
  }
  if (ev.start?.dateTime && ev.end?.dateTime) {
    const days = eventDays(ev.start.dateTime, ev.end.dateTime, tz);
    if (!days) return null;
    return { ...base, start: ev.start.dateTime, end: ev.end.dateTime, allDay: false, days };
  }
  return null;
}

/** Sort key: local start day, all-day first, then local start time. */
const sortKey = (e, tz) => (e.allDay ? `${e.start} ` : `${e.days[0]}T${localTimeIn(new Date(e.start), tz)}`);

export function sortEvents(events, tz) {
  return [...events].sort((a, b) => compareDates(sortKey(a, tz), sortKey(b, tz)) || compareDates(a.title, b.title) || compareDates(a.id, b.id));
}

export const emptyEventsFile = () => ({ version: EVENTS_VERSION, pulledAt: null, window: { start: null, end: null }, calendars: [], events: [] });

/** The on-disk text of public/data/google-events.json. */
export function serializeEvents({ pulledAt, window, calendars, events }, tz) {
  const data = { version: EVENTS_VERSION, pulledAt, window, calendars, events: sortEvents(events, tz) };
  return `${JSON.stringify(data, null, 2)}\n`;
}

// ---------------------------------------------------------------- push

/** Google accepts client-specified event ids of 5–1024 base32hex chars (a–v, 0–9). */
export const isValidEventId = (id) => typeof id === 'string' && /^[a-v0-9]{5,1024}$/.test(id);

export function planDescription(plan) {
  const lines = plan.tasks.map((t) => `[${t.done ? 'x' : ' '}] ${t.text}`);
  const parts = [lines.join('\n')];
  if (plan.notes) parts.push(plan.notes);
  parts.push(`sealed ${plan.hash.slice(0, 7)} · ${doneCount(plan)}/${plan.tasks.length} done`);
  return parts.join('\n\n');
}

/** A sealed plan -> the planner.cal event body (all-day, transparent). */
export function planToEvent(plan) {
  return {
    id: plan.hash,
    status: 'confirmed',
    summary: plan.title,
    description: planDescription(plan),
    start: { date: plan.start },
    end: { date: addDays(plan.end, 1) },
    transparency: 'transparent',
    extendedProperties: { private: { plannerId: plan.id, plannerHash: plan.hash } },
  };
}

/**
 * Compare an existing Google event with the desired one:
 * 'unchanged' | 'updated' (description, done count, flags) |
 * 'restored' (cancelled, or dates/title edited in Google: the seal wins).
 */
export function diffEvent(existing, desired) {
  if (existing.status === 'cancelled') return 'restored';
  if (
    existing.summary !== desired.summary ||
    existing.start?.date !== desired.start.date ||
    existing.end?.date !== desired.end.date ||
    existing.start?.dateTime ||
    existing.end?.dateTime
  ) {
    return 'restored';
  }
  const priv = existing.extendedProperties?.private ?? {};
  const want = desired.extendedProperties.private;
  if (
    (existing.description ?? '') !== desired.description ||
    (existing.transparency ?? 'opaque') !== desired.transparency ||
    priv.plannerId !== want.plannerId ||
    priv.plannerHash !== want.plannerHash
  ) {
    return 'updated';
  }
  return 'unchanged';
}

/**
 * Events on planner.cal that no current plan claims. Events without a
 * plannerId were not made by sync: they are left alone and only counted.
 */
export function staleEvents(events, plans) {
  const live = new Map(plans.map((p) => [p.id, p.hash]));
  const stale = [];
  const foreign = [];
  for (const ev of events) {
    const id = ev.extendedProperties?.private?.plannerId;
    if (!id) foreign.push(ev);
    else if (live.get(id) !== ev.id) stale.push(ev);
  }
  return { stale, foreign };
}
