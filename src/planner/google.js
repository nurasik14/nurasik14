// Google Calendar on planner.cal: the static overlay (data/google-events.json,
// readable everywhere, including Pages) and the local-only sync API.
import { compareDates, isDate } from './dates.js';

const BASE = import.meta.env.BASE_URL;
const API = `${BASE}api/google`;
const EVENTS = `${BASE}data/google-events.json`;
export const CONNECT_HREF = `${API}/connect`;
export const SETUP_DOC = 'docs/PLANNER.md#google';

const SLOTS = 3;

/** A published record, checked field by field; anything else is dropped. */
function clean(e) {
  if (!e || typeof e.id !== 'string' || typeof e.title !== 'string' || typeof e.allDay !== 'boolean') return null;
  const color = Number.isInteger(e.color) && e.color >= 0 ? e.color % SLOTS : 0;
  const calendar = typeof e.calendar === 'string' ? e.calendar : '';
  if (e.allDay) {
    if (!isDate(e.start) || !isDate(e.end) || compareDates(e.start, e.end) > 0) return null;
    return { id: e.id, title: e.title, calendar, color, allDay: true, start: e.start, end: e.end };
  }
  if (typeof e.start !== 'string' || typeof e.end !== 'string' || !Array.isArray(e.days) || !e.days.length || !e.days.every(isDate)) return null;
  return { id: e.id, title: e.title, calendar, color, allDay: false, start: e.start, end: e.end, days: e.days };
}

/** The pulled snapshot, or null when there is none (never pulled, missing, malformed). */
export async function loadGoogleEvents() {
  try {
    const res = await fetch(EVENTS, { cache: 'no-store' });
    if (!res.ok) return null;
    const body = await res.json();
    if (body?.version !== 1 || !body.pulledAt || !Array.isArray(body.events)) return null;
    return { pulledAt: body.pulledAt, events: body.events.map(clean).filter(Boolean) };
  } catch (err) {
    // Not silent: an unreadable snapshot (e.g. HTML instead of JSON) is a bug to see.
    console.warn(`planner.cal: could not read ${EVENTS}:`, err);
    return null;
  }
}

/** "HH:MM" as published: dateTimes carry the owner's offset, so every visitor sees the owner's wall clock. */
export const timeOf = (iso) => (/T(\d{2}:\d{2})/.exec(iso)?.[1] ?? '');

/** Google events on `day`: all-day first, then timed by start time. */
export function eventsOn(events, day) {
  const allDay = events.filter((e) => e.allDay && compareDates(e.start, day) <= 0 && compareDates(e.end, day) >= 0);
  const timed = events.filter((e) => !e.allDay && e.days.includes(day));
  return [...allDay, ...timed];
}

/** True when a timed event started on an earlier day. */
export const continues = (e, day) => !e.allDay && e.days[0] !== day;

/** Screen-reader text: "Google: CS1102 lecture 10:00". */
export function eventLabel(e, day) {
  if (e.allDay) return `Google: ${e.title}, all day`;
  return `Google: ${e.title} ${continues(e, day) ? 'continued' : timeOf(e.start)}`;
}

/** Muted token colours per slot; the dashed edge, not the colour, marks a Google event. */
export const SLOT_BORDER = ['border-info/70', 'border-fg-dim/70', 'border-ok/60'];

// ---------------------------------------------------------------- local API

async function call(method, name, body) {
  let res;
  try {
    res = await fetch(`${API}/${name}`, {
      method,
      cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json' } : { Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('dev server unreachable — is `bun run dev` still running?');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) throw Object.assign(new Error(data?.error || `HTTP ${res.status}`), { status: res.status });
  return data;
}

export const googleStatus = () => call('GET', 'status');
export const selectCalendars = (selected) => call('PUT', 'calendars', { selected });
export const syncGoogle = () => call('POST', 'sync', {});
export const disconnectGoogle = () => call('POST', 'disconnect', {});

/** "synced · pulled 37 · pushed +2 ~1 −0" (~ counts updated and restored). */
export function syncSummary({ pulled, pushed }) {
  return `synced · pulled ${pulled.events} · pushed +${pushed.created} ~${pushed.updated + pushed.restored} −${pushed.deleted}`;
}

/** Statusline text for ?google=connected|error&reason=… after the OAuth round trip. */
export function connectMessage(result, reason) {
  if (result === 'connected') return ['google connected · press sync to pull and push', 'ok'];
  const code = /^[a-z_]{1,32}$/.test(reason ?? '') ? reason : 'unknown';
  const hints = {
    access_denied: 'access denied · is your account a test user? see docs/PLANNER.md#google',
    state: 'the connect link expired · try again',
    scopes: 'tick every permission and connect again',
    redirect_uri_mismatch: 'redirect_uri_mismatch · use a Desktop app client',
    not_configured: `no OAuth client yet · see ${SETUP_DOC}`,
  };
  return [`google: ${hints[code] ?? `connect failed (${code})`}`, 'warn'];
}
