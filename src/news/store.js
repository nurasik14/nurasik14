// news.fm data: the published files, what this device remembers, and the
// local-only sync API. Decrypted text stays in memory; localStorage only ever
// holds clip ids, positions, speech settings and (if asked) the passphrase.
import { BACKLOG_ID, decryptWeek, isWeekId, NEWS_TZ, WrongPassphraseError } from '../../plugins/news-core.js';
import { clampRate, RATE_DEFAULT, splitSentences } from './speech.js';

const BASE = import.meta.env.BASE_URL;
const DATA = `${BASE}data/news`;
const API = `${BASE}api/news`;
export const CONNECT_HREF = `${API}/connect`;
export const PUBLISH_CMD = 'git add public/data/news && git commit -m "news: update" && git push';

const KEY_PROGRESS = 'news.fm.progress';
const KEY_PASSPHRASE = 'news.fm.passphrase';
const KEY_SETTINGS = 'news.fm.settings';

// ---------------------------------------------------------------- published files

/** Wrap-ups in display order: weeks newest first, the backlog last. Throws when malformed. */
export function parseIndex(body) {
  const weeks = body?.weeks;
  const backlog = body?.backlog ?? null;
  if (body?.version !== 1 || !Array.isArray(weeks) || !weeks.every(isWeekId) || (backlog !== null && !isWeekId(backlog?.until))) {
    throw new Error('data/news/index.json is malformed');
  }
  const entries = [...new Set(weeks)]
    .sort()
    .reverse()
    .map((id) => ({ id, kind: 'week', label: `week of ${id}`, short: `week of ${id}` }));
  if (backlog) {
    entries.push({ id: BACKLOG_ID, kind: 'backlog', label: `first wrap-up · everything before ${backlog.until}`, short: 'first wrap-up' });
  }
  return entries;
}

/** The wrap-up list. A missing index means nothing is published yet: []. */
export async function loadIndex({ fetch: get = globalThis.fetch } = {}) {
  let res;
  try {
    res = await get(`${DATA}/index.json`, { cache: 'no-store' });
  } catch {
    throw new Error('could not reach data/news/index.json');
  }
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`data/news/index.json: HTTP ${res.status}`);
  let body;
  try {
    body = await res.json();
  } catch {
    throw new Error('data/news/index.json is malformed');
  }
  return parseIndex(body);
}

const cleanStory = (s) =>
  s && typeof s.id === 'string' && typeof s.headline === 'string' && typeof s.script === 'string'
    ? {
        id: s.id,
        headline: s.headline,
        script: s.script,
        newsletter: typeof s.newsletter === 'string' ? s.newsletter : '',
        receivedAt: typeof s.receivedAt === 'string' ? s.receivedAt : '',
        sentences: splitSentences(s.script),
      }
    : null;

/**
 * Fetches and decrypts one wrap-up: { status: 'ready', stories, generatedAt }.
 * Throws WrongPassphraseError for a bad passphrase, a plain Error for the rest.
 */
export async function openWrapUp(id, passphrase, { fetch: get = globalThis.fetch } = {}) {
  // Without this decryptWeek would report an http:// LAN address as a wrong passphrase.
  if (!globalThis.crypto?.subtle) throw new Error('decrypting needs https or localhost; this address has no Web Crypto');
  let res;
  try {
    res = await get(`${DATA}/${id}.json`, { cache: 'no-store' });
  } catch {
    throw new Error(`could not reach data/news/${id}.json`);
  }
  if (!res.ok) throw new Error(`data/news/${id}.json: HTTP ${res.status}`);
  let file;
  try {
    file = await res.json();
  } catch {
    throw new Error(`data/news/${id}.json is malformed`);
  }
  let payload;
  try {
    payload = await decryptWeek(file, passphrase, { week: id });
  } catch (err) {
    if (err instanceof WrongPassphraseError) throw err;
    throw new Error(err instanceof SyntaxError ? `data/news/${id}.json holds malformed text` : `data/news/${id}.json: ${err.message}`);
  }
  if (!Array.isArray(payload?.stories)) throw new Error(`data/news/${id}.json holds no stories`);
  return { status: 'ready', stories: payload.stories.map(cleanStory).filter(Boolean), generatedAt: payload.generatedAt ?? null };
}

// ---------------------------------------------------------------- this device

/** localStorage, or null where it is blocked. Every use below tolerates null. */
export function safeStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function read(storage, key) {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(storage, key, value) {
  try {
    storage?.setItem(key, value);
  } catch {
    // Private mode or a full disk: it still works for this visit.
  }
}

function readJson(storage, key) {
  try {
    return JSON.parse(read(storage, key));
  } catch {
    return null;
  }
}

export const readRemembered = (storage) => read(storage, KEY_PASSPHRASE) || null;
export const rememberPassphrase = (storage, passphrase) => write(storage, KEY_PASSPHRASE, passphrase);
export function forgetPassphrase(storage) {
  try {
    storage?.removeItem(KEY_PASSPHRASE);
  } catch {
    // Nothing was readable either.
  }
}

/** { [wrapUpId]: { last, heard: [clipId] } }, with anything malformed dropped. */
export function readProgress(storage) {
  const raw = readJson(storage, KEY_PROGRESS);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [id, p] of Object.entries(raw)) {
    out[id] = {
      last: Number.isInteger(p?.last) && p.last >= 0 ? p.last : 0,
      heard: Array.isArray(p?.heard) ? p.heard.filter((h) => typeof h === 'string') : [],
    };
  }
  return out;
}

export const writeProgress = (storage, progress) => write(storage, KEY_PROGRESS, JSON.stringify(progress));

const entryOf = (progress, id) => progress[id] ?? { last: 0, heard: [] };

export function markHeard(progress, id, clipId) {
  const entry = entryOf(progress, id);
  if (entry.heard.includes(clipId)) return progress;
  return { ...progress, [id]: { ...entry, heard: [...entry.heard, clipId] } };
}

export function setLastClip(progress, id, last) {
  const entry = entryOf(progress, id);
  return entry.last === last ? progress : { ...progress, [id]: { ...entry, last } };
}

/** Only ids still in the wrap-up count, so a stale id can never show 109/108. */
export function heardCount(stories, progress, id) {
  const heard = new Set(entryOf(progress, id).heard);
  return stories.filter((s) => heard.has(s.id)).length;
}

const hasUnheard = (wrapUp, progress, id) => wrapUp?.status === 'ready' && heardCount(wrapUp.stories, progress, id) < wrapUp.stories.length;

/**
 * The wrap-up to open on load: the newest with unheard clips, else the newest.
 * null while a newer wrap-up is still unread, because it might be the answer.
 */
export function chooseWrapUp(entries, lib, progress) {
  for (const { id } of entries) {
    const wrapUp = lib[id];
    if (!wrapUp || wrapUp.status === 'loading') return null;
    if (hasUnheard(wrapUp, progress, id)) return id;
  }
  return entries[0]?.id ?? null;
}

/** The next wrap-up after `currentId` with unheard clips, among those already read. */
export function nextUnheardWrapUp(entries, lib, progress, currentId) {
  const at = entries.findIndex((e) => e.id === currentId);
  for (let step = 1; step < entries.length; step += 1) {
    const entry = entries[(at + step) % entries.length];
    if (hasUnheard(lib[entry.id], progress, entry.id)) return entry;
  }
  return null;
}

/** Where to pick a wrap-up up again: the last clip, or the next unheard one if that was heard. */
export function resumeIndex(stories, progress, id) {
  if (!stories.length) return 0;
  const entry = entryOf(progress, id);
  const last = Math.min(entry.last, stories.length - 1);
  const heard = new Set(entry.heard);
  for (let step = 0; step < stories.length; step += 1) {
    const i = (last + step) % stories.length;
    if (!heard.has(stories[i].id)) return i;
  }
  return last;
}

export function findClip(entries, lib, clipId) {
  for (const { id } of entries) {
    const index = lib[id]?.stories?.findIndex((s) => s.id === clipId) ?? -1;
    if (index >= 0) return { id, index };
  }
  return null;
}

/** Voice name, rate and autoplay. Never content. */
export function readSettings(storage) {
  const raw = readJson(storage, KEY_SETTINGS);
  return {
    voice: typeof raw?.voice === 'string' ? raw.voice : null,
    rate: raw?.rate === undefined ? RATE_DEFAULT : clampRate(raw.rate),
    autoplay: raw?.autoplay !== false,
  };
}

export const writeSettings = (storage, settings) => write(storage, KEY_SETTINGS, JSON.stringify(settings));

// ---------------------------------------------------------------- page helpers

/** ?w=<weekId|backlog> and #clip-<id>; whatever does not parse is null. */
export function readNewsUrl(href) {
  if (!href) return { week: null, clipId: null };
  const url = new URL(href);
  const week = url.searchParams.get('w');
  const clip = /^#clip-([0-9a-z]{4,64})$/.exec(url.hash);
  return { week: week === BACKLOG_ID || isWeekId(week) ? week : null, clipId: clip ? clip[1] : null };
}

/** The relative URL with ?w= and #clip- replaced; the rest is kept. */
export function newsUrl(href, week, clipId) {
  const url = new URL(href);
  if (week) url.searchParams.set('w', week);
  else url.searchParams.delete('w');
  url.hash = clipId ? `clip-${clipId}` : '';
  return `${url.pathname}${url.search}${url.hash}`;
}

const RECEIVED = new Intl.DateTimeFormat('en-GB', { timeZone: NEWS_TZ, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** "28 Oct 2026, 18:05 HKT". Times are shown where the week boundaries are defined. */
export function formatReceived(iso) {
  const dt = new Date(iso);
  return Number.isNaN(dt.getTime()) ? '' : `${RECEIVED.format(dt)} HKT`;
}

export const SWIPE_THRESHOLD = 60;

/**
 * 'next' | 'prev' | null for a finished vertical drag on the clip. While the
 * text overflows, a drag scrolls it, and only one that started at the matching
 * edge turns the clip.
 */
export function swipeAction({ dx, dy, startTop, clientHeight, scrollHeight, selecting }) {
  if (selecting || Math.abs(dy) < SWIPE_THRESHOLD || Math.abs(dx) > Math.abs(dy)) return null;
  const edge = 2;
  if (dy < 0) return startTop + clientHeight >= scrollHeight - edge ? 'next' : null;
  return startTop <= edge ? 'prev' : null;
}

// ---------------------------------------------------------------- local API

async function call(method, name) {
  let res;
  try {
    res = await fetch(`${API}/${name}`, {
      method,
      cache: 'no-store',
      headers: method === 'POST' ? { 'Content-Type': 'application/json' } : { Accept: 'application/json' },
      body: method === 'POST' ? '{}' : undefined,
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
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

export const newsStatus = () => call('GET', 'status');
export const syncNews = () => call('POST', 'sync');
export const audioStatus = () => call('GET', 'audio');
export const startAudio = () => call('POST', 'audio');
export const audioCues = (id) => call('GET', `audio/${id}.cues.json`);
export const audioUrl = (id) => `${API}/audio/${id}.mp3`;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "published backlog, 2026-10-30 · 34 emails · 108 stories". */
export function syncSummary({ published = [], emails = 0, stories = 0 }) {
  return `${published.length ? `published ${published.join(', ')}` : 'nothing new published'} · ${plural(emails, 'email')} · ${plural(stories, 'story').replace('storys', 'stories')}`;
}

/** Statusline text for ?google=connected|error&reason=… after the OAuth round trip. */
export function connectMessage(result, reason) {
  if (result === 'connected') return ['google connected · press sync to read the inbox', 'ok'];
  const code = /^[a-z_]{1,32}$/.test(reason ?? '') ? reason : 'unknown';
  const hints = {
    access_denied: 'access denied · is the news account a test user? see docs/NEWS.md',
    state: 'the connect link expired · try again',
    scopes: 'tick the Gmail permission and connect again',
    wrong_account: 'that is not the news account · connect again and pick it',
    no_account: 'settings.json has no account · see docs/NEWS.md',
    not_configured: 'no OAuth client yet · see docs/PLANNER.md#one-time-setup',
    redirect_uri_mismatch: 'redirect_uri_mismatch · use a Desktop app client',
  };
  return [`google: ${hints[code] ?? `connect failed (${code})`}`, 'warn'];
}
