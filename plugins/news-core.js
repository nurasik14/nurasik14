// Pure news.fm logic: week math, Gmail MIME to text, Claude output validation
// and the encrypted snapshot format. No Node APIs: hashing, randomness and
// encryption use Web Crypto and time zones use Intl, so the browser can run
// this too. See docs/NEWS.md.
import { addDays, compareDates, isDate } from '../src/planner/dates.js';
import { localDateIn, localTimeIn, sha256Hex, zonedMidnight } from './google-core.js';

export const NEWS_TZ = 'Asia/Hong_Kong';
export const NEWS_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

export const TEXT_MAX = 30_000;
export const HEADLINE_MAX = 140;
export const SCRIPT_MAX = 900;
export const STORIES_MAX = 20;
export const NEWSLETTER_MAX = 60;
// The owner chose 8 (2026-11-04): safe only for random characters from every key
// type; a word or name of this length falls to an offline dictionary attack.
export const MIN_PASSPHRASE = 8;
export const DEFAULT_ITERATIONS = 600_000;
export const FORMAT_VERSION = 2;
/** Version 1 files have no links, and stay readable: published weeks are never re-encrypted. */
const READABLE_VERSIONS = new Set([1, FORMAT_VERSION]);
/** index.json did not change with the week files, and the deployed page checks this number. */
const INDEX_VERSION = 1;
/** The id of the one-time first wrap-up: every email before the first weekly week. */
export const BACKLOG_ID = 'backlog';
/** The id of the bookmarks file, which is bound to it like a week file is to its week. */
export const BOOKMARKS_ID = 'bookmarks';
export const BOOKMARKS_MAX = 500;
const BOOKMARKS_VERSION = 1;
export const LINK_TAGS_MAX = 150;
const LINK_URL_MAX = 2048;
const ANCHOR_MAX = 200;

/** Conversion input cap: far above a real newsletter, it bounds a hostile one. */
const HTML_MAX = 2_000_000;
const FRIDAY = 5;
const DAY_SECONDS = 86_400;

// ---------------------------------------------------------------- weeks

const weekday = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();

/** True for 'YYYY-MM-DD' naming a real Friday: the only valid week ids. */
export const isWeekId = (id) => typeof id === 'string' && isDate(id) && weekday(id) === FRIDAY;

/** An instant as local ISO in NEWS_TZ with its real offset, derived from Intl. */
export function zonedIso(ms) {
  const instant = new Date(ms);
  const date = localDateIn(instant, NEWS_TZ);
  const time = localTimeIn(instant, NEWS_TZ);
  const minutes = (Date.parse(`${date}T${time}:00Z`) - Math.floor(ms / 60_000) * 60_000) / 60_000;
  const abs = Math.abs(minutes);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date}T${time}:${pad(instant.getUTCSeconds())}${minutes < 0 ? '-' : '+'}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** The Friday ('YYYY-MM-DD', NEWS_TZ) on or before an instant (Date or ms). */
export function weekStartOf(instant) {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) throw new RangeError('weekStartOf: invalid instant');
  const local = localDateIn(date, NEWS_TZ);
  return addDays(local, -((weekday(local) - FRIDAY + 7) % 7));
}

/** A week is [Friday 00:00, next Friday 00:00) in NEWS_TZ. */
export function weekWindow(weekId) {
  if (!isWeekId(weekId)) throw new RangeError(`${weekId} is not a week id (a Friday as YYYY-MM-DD)`);
  const startMs = Date.parse(zonedMidnight(weekId, NEWS_TZ));
  const endMs = Date.parse(zonedMidnight(addDays(weekId, 7), NEWS_TZ));
  return { id: weekId, startMs, endMs, startIso: zonedIso(startMs), endIso: zonedIso(endMs) };
}

/** Complete weeks from fromWeekId (inclusive), ascending. A week is complete once it has ended. */
export function completeWeeksBetween(fromWeekId, nowMs) {
  const weeks = [];
  for (let id = fromWeekId; weekWindow(id).endMs <= nowMs; id = addDays(id, 7)) weeks.push(id);
  return weeks;
}

/**
 * Complete weeks still to publish, ascending: everything after the newest
 * published week. With nothing published, start at firstWeek if given, else
 * only the most recent complete week (a first run must not ingest the inbox).
 */
export function pendingWeeks({ published = [], nowMs, firstWeek }) {
  const newest = [...published].sort(compareDates).at(-1);
  if (newest) return completeWeeksBetween(addDays(newest, 7), nowMs);
  if (firstWeek) return completeWeeksBetween(firstWeek, nowMs);
  return [addDays(weekStartOf(nowMs), -7)];
}

/**
 * The backlog: everything before the week `untilWeekId` starts. It has no start
 * (startMs is -Infinity), so it holds the whole inbox history up to that Friday.
 */
export function backlogWindow(untilWeekId) {
  const { startMs, startIso } = weekWindow(untilWeekId);
  return { id: BACKLOG_ID, until: untilWeekId, startMs: Number.NEGATIVE_INFINITY, endMs: startMs, startIso: null, endIso: startIso };
}

/**
 * Gmail's after/before inclusivity is not documented precisely, so the query is
 * a day wider on each side and the caller filters with inWindow. A window
 * without a start (the backlog) has no after: term.
 */
export function gmailQuery(window) {
  const before = Math.floor(window.endMs / 1000) + DAY_SECONDS;
  const after = Number.isFinite(window.startMs) ? `after:${Math.floor(window.startMs / 1000) - DAY_SECONDS} ` : '';
  return `${after}before:${before} -in:sent -in:drafts -in:chats`;
}

/** internalDate (ms, UTC; Gmail sends a string) inside [startMs, endMs). */
export function inWindow(internalDateMs, window) {
  const ms = Number(internalDateMs);
  return Number.isFinite(ms) && ms >= window.startMs && ms < window.endMs;
}

// ---------------------------------------------------------------- scrubbing

// Bounded quantifiers keep this linear on hostile text like "a-a-a-a-…".
const URL_RE = /<?\b[a-z][a-z0-9+.-]{0,30}:\/\/[^\s<>)\]"]*>?|<?\b(?:www\.|mailto:)[^\s<>)\]"]+>?|\b[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63}){0,8}\.[a-z]{2,24}\/[^\s<>)\]"]*/gi;
const ADDRESS_RE = /[^\s<>()[\]@,;:"]+@[^\s<>()[\]@,;:"]+\.[^\s<>()[\]@,;:"]+/g;
const INVISIBLE_RE = /[­​‌⁠﻿]/g;

/** Removes URLs and the empty brackets a removed URL leaves: "[more](x)" -> "[more]". */
const dropUrls = (text) => text.replace(URL_RE, '').replace(/\(\s*\)|\[\s*\]|<\s*>/g, '');

/** Cuts at `max` code units without leaving half of a surrogate pair. */
function hardCut(text, max) {
  const cut = text.slice(0, max);
  return /[\ud800-\udbff]$/.test(cut) ? cut.slice(0, -1) : cut;
}

/** Truncates at the last sentence end, else the last word boundary, else hard. */
export function truncateText(text, max) {
  if (text.length <= max) return text;
  const cut = hardCut(text, max);
  // One character past the cut, so "3.14" cut after the dot is not a sentence end.
  const probe = text.slice(0, cut.length + 1);
  let sentence = -1;
  for (const m of probe.matchAll(/[.!?…]["'”’)]*(?=\s)/g)) sentence = m.index + m[0].length;
  if (sentence >= max / 2) return text.slice(0, sentence).trim();
  if (/\s/.test(probe.at(-1))) return cut.trim();
  const space = cut.search(/\s\S*$/);
  return (space > 0 ? cut.slice(0, space) : cut).trim();
}

// ---------------------------------------------------------------- MIME

function decodeBase64Url(data) {
  const bin = atob(String(data).replace(/-/g, '+').replace(/_/g, '/').replace(/[=\s]+$/, ''));
  return new TextDecoder('utf-8').decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', bull: '•', middot: '·',
  copy: '©', reg: '®', trade: '™', euro: '€', pound: '£', yen: '¥', cent: '¢', deg: '°',
};

function decodeEntities(text) {
  return text.replace(/&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|([a-z]+));/gi, (all, dec, hex, name) => {
    if (name) return ENTITIES[name] ?? ENTITIES[name.toLowerCase()] ?? all;
    const code = dec ? Number(dec) : Number.parseInt(hex, 16);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '';
  });
}

/**
 * Cuts every open…close region. Each scan moves forward only, so a hostile
 * email full of unterminated tags stays linear. An unterminated region drops
 * the rest of the text when `toEnd` (how browsers treat raw-text elements),
 * otherwise only its opening tag.
 */
function dropRegions(text, openRe, closeFor, toEnd = true) {
  let out = '';
  let at = 0;
  for (let m = openRe.exec(text); m; m = openRe.exec(text)) {
    out += text.slice(at, m.index);
    const close = closeFor(m);
    close.lastIndex = openRe.lastIndex;
    const end = close.exec(text);
    if (!end) return toEnd ? out : out + text.slice(openRe.lastIndex);
    at = end.index + end[0].length;
    openRe.lastIndex = at;
  }
  return out + text.slice(at);
}

// ---------------------------------------------------------------- links

const parseHttp = (text) => {
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
};

function decodedOr(text) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** Query parameters that redirectors keep the real address in. google.com/url alone uses q. */
const WRAP_PARAMS = ['url', 'u', 'target', 'redirect', 'redirect_url', 'dest', 'destination', 'link'];
const TRACKING_PARAM_RE = /^(?:utm_.*|mc_cid|mc_eid|ref_src)$/i;
const isGoogleRedirect = (url) => url.pathname === '/url' && /(?:^|\.)google\.[a-z.]{2,8}$/i.test(url.hostname);

/** An http(s) URL hiding under up to three rounds of percent-encoding, or null. */
function decodedTarget(text) {
  let value = text;
  for (let round = 0; round < 3; round += 1) {
    if (/^https?:\/\//i.test(value)) return parseHttp(value) ? value : null;
    const next = decodedOr(value);
    if (next === value) return null;
    value = next;
  }
  return null;
}

function embeddedTarget(url) {
  for (const name of isGoogleRedirect(url) ? ['q', ...WRAP_PARAMS] : WRAP_PARAMS) {
    const target = decodedTarget(url.searchParams.get(name) ?? '');
    if (target) return target;
  }
  for (const segment of url.pathname.split('/')) {
    const target = decodedTarget(segment);
    if (target) return target;
  }
  return null;
}

function stripTracking(link) {
  const url = parseHttp(link);
  const names = url ? [...url.searchParams.keys()].filter((name) => TRACKING_PARAM_RE.test(name)) : [];
  if (!names.length) return link;
  for (const name of names) url.searchParams.delete(name);
  return url.toString();
}

/**
 * The address a tracking redirect points at, read out of the URL itself (at most
 * three levels), without tracking parameters. Anything without an embedded
 * http(s) target stays as it is. This never fetches: resolving a redirect over
 * the network would register a tracked click.
 */
export function unwrapLink(link) {
  let current = String(link ?? '');
  for (let level = 0; level < 3; level += 1) {
    const url = parseHttp(current);
    const target = url && embeddedTarget(url);
    if (!target) break;
    current = target;
  }
  return stripTracking(current);
}

const CHROME_LINK_RE = /unsubscribe|opt[\s_-]*out|preferences|manage[\s_-]*(?:your[\s_-]*)?subscription|update[\s_-]*(?:your[\s_-]*)?profile|\bview[\s_-]*(?:in|online)\b|web[\s_-]*version/i;
const LINK_TAG_RE = /\[L\d+\]/g;

/** One email's links: the same final URL gets the same tag. Footer links and other schemes get none. */
function createLinkTable() {
  const tags = new Map(); // final URL -> tag
  const links = {};
  return {
    links,
    tag(raw, anchor = '') {
      if (!parseHttp(raw)) return null;
      const url = unwrapLink(raw);
      if (url.length > LINK_URL_MAX || [decodedOr(raw), decodedOr(url), anchor].some((text) => CHROME_LINK_RE.test(text))) return null;
      let tag = tags.get(url);
      if (!tag) {
        if (tags.size >= LINK_TAGS_MAX) return null;
        tag = `L${tags.size + 1}`;
        tags.set(url, tag);
        links[tag] = { url, anchor };
      }
      return tag;
    },
  };
}

const HREF_RE = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;

/**
 * <a href="X">anchor</a> -> "anchor [L1]". Every scan moves forward only, and
 * once no </a> is left the search stops, so hostile markup stays linear. An
 * unclosed anchor gets its tag where it opens.
 */
function tagAnchors(html, table) {
  const open = /<a\b[^<>]*>/gi;
  const close = /<\/a\s*>/gi;
  let out = '';
  let at = 0;
  let closable = true;
  for (let m = open.exec(html); m; m = open.exec(html)) {
    out += html.slice(at, m.index);
    close.lastIndex = open.lastIndex;
    const end = closable ? close.exec(html) : null;
    closable = Boolean(end);
    const inner = end ? html.slice(open.lastIndex, end.index) : '';
    const href = HREF_RE.exec(m[0]);
    const target = href ? decodeEntities(href[1] ?? href[2] ?? href[3]).replace(INVISIBLE_RE, '').trim() : '';
    const anchor = hardCut(decodeEntities(inner.replace(/<[^<>]*>/g, ' ')).replace(/\s+/g, ' ').trim(), ANCHOR_MAX);
    const tag = target ? table.tag(target, anchor) : null;
    out += tag ? `${inner} [${tag}] ` : inner;
    at = end ? end.index + end[0].length : open.lastIndex;
    open.lastIndex = at;
  }
  return out + html.slice(at);
}

/** Bare URLs -> tags, or nothing when dropped. Sentence punctuation after a tagged URL stays in the text. */
function tagBareUrls(text, table) {
  return text.replace(URL_RE, (match) => {
    const bare = match.replace(/^</, '').replace(/>$/, '');
    const tail = /[.,;:!?'*_~]+$/.exec(bare)?.[0] ?? '';
    const url = bare.slice(0, bare.length - tail.length);
    const tag = table.tag(/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`);
    return tag ? ` [${tag}]${tail}` : '';
  });
}

const BLOCK_TAG_RE = /<\/?(?:address|article|aside|blockquote|br|center|dd|div|dl|dt|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul)\b[^<>]*>/gi;

function htmlToText(html, table) {
  let text = hardCut(html, HTML_MAX);
  text = dropRegions(text, /<!--/g, () => /-->/g);
  text = dropRegions(text, /<(script|style|title|noscript|template)\b[^<>]*>/gi, (m) => new RegExp(`</${m[1]}\\s*>`, 'gi'));
  // A closing </head> is optional in HTML; what is left in there is only empty tags.
  text = dropRegions(text, /<head\b[^<>]*>/gi, () => /<\/head\s*>/gi, false);
  text = tagAnchors(text, table);
  text = text.replace(BLOCK_TAG_RE, '\n').replace(/<[a-z/!?][^<>]*>/gi, '');
  // Entities last, so "&lt;b&gt;" stays the text "<b>" instead of becoming a tag.
  return decodeEntities(text);
}

/** Drops the URLs still there and invisible characters, collapses whitespace, keeps paragraphs. */
function tidyText(text) {
  return dropUrls(text.replace(INVISIBLE_RE, ''))
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The text Claude gets, with the table cut down to the tags that made it in. Only tags and no words is no text. */
function finishBody(raw, table) {
  const tagged = tagBareUrls(hardCut(raw, HTML_MAX).replace(INVISIBLE_RE, ''), table);
  const tidy = tidyText(tagged.replace(/\(\s*(\[L\d+\])\s*\)/g, ' $1')).replace(/(\[L\d+\])(?:\s*\1)+/g, '$1');
  const text = hardCut(tidy, TEXT_MAX).replace(/\[(?:L\d*)?$/, '').trim();
  if (!text.replace(LINK_TAG_RE, '').trim()) return { text: '', links: {} };
  return { text, links: Object.fromEntries(Object.entries(table.links).filter(([tag]) => text.includes(`[${tag}]`))) };
}

/** Inline body parts by type. Attachments carry a filename and are skipped whole. */
function collectParts(part, found) {
  if (!part || part.filename) return found;
  const type = String(part.mimeType || '').toLowerCase();
  if (part.body?.data && (type === 'text/plain' || type === 'text/html')) found[type].push(part.body.data);
  for (const child of part.parts ?? []) collectParts(child, found);
  return found;
}

/**
 * A Gmail format=full message as { text, links }: plain text capped at TEXT_MAX
 * where every link is a tag like [L1], and the table tag -> { url, anchor }.
 * No raw URL is left in the text. A text/plain part wins unless it is blank once
 * links are gone (many newsletters ship a plain part that is only a link).
 */
export function emailToText(message) {
  const parts = collectParts(message?.payload, { 'text/plain': [], 'text/html': [] });
  const plain = finishBody(parts['text/plain'].map(decodeBase64Url).join('\n\n'), createLinkTable());
  if (plain.text) return plain;
  const table = createLinkTable();
  return finishBody(parts['text/html'].map((d) => htmlToText(decodeBase64Url(d), table)).join('\n\n'), table);
}

/** RFC 2047 encoded words ("=?UTF-8?B?…?="), which raw headers may still contain. */
function decodeHeader(value) {
  return value
    .replace(/(\?=)\s+(?==\?)/g, '$1')
    .replace(/=\?([^?\s]+)\?([bq])\?([^?\s]*)\?=/gi, (all, charset, kind, data) => {
      try {
        const bytes =
          kind.toLowerCase() === 'b'
            ? Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
            : Uint8Array.from(
                data.replace(/_/g, ' ').replace(/=([0-9a-f]{2})|[^]/gi, (c, hex) => String.fromCharCode(hex ? Number.parseInt(hex, 16) : c.charCodeAt(0))),
                (c) => c.charCodeAt(0),
              );
        return new TextDecoder(charset).decode(bytes);
      } catch {
        return all;
      }
    });
}

function headerOf(message, name) {
  const found = message?.payload?.headers?.find?.((h) => String(h?.name).toLowerCase() === name);
  return typeof found?.value === 'string' ? found.value : '';
}

/** Second-level labels under a country TLD: mail.bbc.co.uk is "bbc", not "co". */
const CC_SECOND_LEVEL = new Set(['ac', 'co', 'com', 'edu', 'go', 'gov', 'ne', 'net', 'or', 'org']);

function domainLabel(address) {
  const domain = /@([a-z0-9.-]+)/i.exec(address)?.[1] ?? '';
  const labels = domain.toLowerCase().split('.').filter(Boolean);
  if (labels.length < 2) return labels[0] ?? 'unknown';
  const shared = labels.length > 2 && labels.at(-1).length === 2 && CC_SECOND_LEVEL.has(labels.at(-2));
  return labels.at(shared ? -3 : -2);
}

/**
 * The sender's display name, never the address. Falls back to the domain's
 * second-level label when the name is missing or itself holds an address or URL.
 */
export function senderName(fromHeader) {
  const from = decodeHeader(String(fromHeader ?? '')).trim();
  const angle = /^(.*)<([^<>]*)>$/s.exec(from);
  const address = angle ? angle[2] : from;
  let name = angle ? angle[1].trim() : from.includes('@') ? '' : from;
  const quoted = /^(["'])(.*)\1$/s.exec(name);
  if (quoted) name = quoted[2].replace(/\\(.)/g, '$1');
  name = name.replace(/[\p{Cc}\s]+/gu, ' ').replace(INVISIBLE_RE, '').trim();
  const usable = /[\p{L}\p{N}]/u.test(name) && !name.includes('@') && dropUrls(name) === name;
  return usable ? truncateText(name, NEWSLETTER_MAX) : domainLabel(address);
}

/** The decoded Subject on one line without URLs, or ''. */
export function subjectOf(message) {
  return dropUrls(decodeHeader(headerOf(message, 'subject'))).replace(/\s+/g, ' ').trim();
}

/** The raw From header, for senderName. */
export const fromOf = (message) => headerOf(message, 'from');

// ---------------------------------------------------------------- Claude output

export const STORY_SCHEMA = {
  type: 'object',
  properties: {
    stories: {
      type: 'array',
      items: {
        type: 'object',
        properties: { headline: { type: 'string' }, script: { type: 'string' }, link: { type: 'string' } },
        required: ['headline', 'script', 'link'],
        additionalProperties: false,
      },
    },
  },
  required: ['stories'],
  additionalProperties: false,
};

/** Model output is untrusted too: an email could coax it into repeating a link or an address. */
const speakable = (text, max) => truncateText(dropUrls(text.replace(INVISIBLE_RE, '').replace(/\s*\[\s*L\d+\s*\]/gi, '')).replace(ADDRESS_RE, '').replace(/\s+/g, ' ').trim(), max);

/** The URL behind a tag like "L3", but only one this email's table really has. */
function linkFor(tag, links) {
  const name = typeof tag === 'string' ? tag.trim().replace(/^\[(.*)\]$/, '$1') : '';
  return /^L\d+$/.test(name) && Object.hasOwn(links, name) ? links[name].url : null;
}

/**
 * Validates structured output against this email's link table. Throws on garbage;
 * empty items are dropped; lengths are enforced here. `link` comes back as the URL or null.
 */
export function parseStories(structured, links = {}) {
  if (!Array.isArray(structured?.stories)) throw new Error('claude output has no stories list');
  const stories = [];
  for (const item of structured.stories) {
    if (typeof item?.headline !== 'string' || typeof item?.script !== 'string') throw new Error('claude output has a malformed story');
    const headline = speakable(item.headline, HEADLINE_MAX);
    const script = speakable(item.script, SCRIPT_MAX);
    if (headline && script) stories.push({ headline, script, link: linkFor(item.link, links) });
  }
  return stories.slice(0, STORIES_MAX);
}

// ---------------------------------------------------------------- payload

const MESSAGE_ID_RE = /^[0-9a-f]{8,24}$/i;
const ACCOUNT_RE = /^[^\s/?#@]+@[^\s/?#@]+$/;

/** Opens the email in Gmail, on a device logged in to that account. null when either part looks wrong. */
export function gmailLink(account, messageId) {
  const address = String(account ?? '').trim();
  return ACCOUNT_RE.test(address) && MESSAGE_ID_RE.test(String(messageId)) ? `https://mail.google.com/mail/u/${address}/#all/${messageId}` : null;
}

/**
 * The plaintext of one week (or the backlog). `emails` are { messageId,
 * internalDate, newsletter, stories }. Built by whitelist: nothing else from an
 * email can reach the result, and the account address only reaches links.email.
 * Weeks run oldest first; the backlog newest first, so the freshest of a long
 * history comes first.
 */
export async function buildPayload({ weekId, generatedAt, emails, newestFirst = false, account = null }) {
  const rows = [];
  for (const email of emails) {
    for (const [index, story] of email.stories.entries()) {
      const id = (await sha256Hex(`${email.messageId}:${index}`)).slice(0, 12);
      rows.push({
        ms: Number(email.internalDate),
        story: {
          id,
          headline: story.headline,
          script: story.script,
          newsletter: email.newsletter,
          receivedAt: zonedIso(Number(email.internalDate)),
          links: { email: gmailLink(account, email.messageId), article: parseHttp(story.link) ? story.link : null },
        },
      });
    }
  }
  // Array.prototype.sort is stable, so equal instants keep the order in the email.
  rows.sort((a, b) => (newestFirst ? b.ms - a.ms : a.ms - b.ms));
  return { version: FORMAT_VERSION, week: weekId, generatedAt, stories: rows.map((r) => r.story) };
}

// ---------------------------------------------------------------- crypto

export class WrongPassphraseError extends Error {
  constructor() {
    super('wrong passphrase, or the file was altered or renamed to another week');
    this.name = 'WrongPassphraseError';
  }
}

/** The text that keys are derived from: the file's trailing newline is not part of it. */
const normalizePassphrase = (p) => (typeof p === 'string' ? p.replace(/[\r\n]+$/, '').normalize('NFC') : '');

/** 'ok' | 'missing' | 'too-short', measured after trimming the trailing newline. */
export function checkPassphrase(p) {
  const text = normalizePassphrase(p);
  if (!text) return 'missing';
  return text.length < MIN_PASSPHRASE ? 'too-short' : 'ok';
}

function toBase64(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const utf8 = (text) => new TextEncoder().encode(text);
const additionalData = (week) => utf8(`news.fm:${week}`);

async function deriveKey(passphrase, salt, iterations, usage) {
  const material = await globalThis.crypto.subtle.importKey('raw', utf8(normalizePassphrase(passphrase)), 'PBKDF2', false, ['deriveKey']);
  return globalThis.crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, { name: 'AES-GCM', length: 256 }, false, [usage]);
}

/** The public file object for one week. Salt and IV are fresh on every call. */
export function encryptWeek({ weekId, payload, passphrase, iterations }) {
  const { startIso, endIso } = weekWindow(weekId);
  return encryptSnapshot({ id: weekId, start: startIso, end: endIso, payload, passphrase, iterations });
}

/** The backlog file: `week` is "backlog", `start` is null, `until` names the first weekly week. */
export async function encryptBacklog({ until, payload, passphrase, iterations }) {
  const { endIso } = backlogWindow(until);
  return { ...(await encryptSnapshot({ id: BACKLOG_ID, start: null, end: endIso, payload, passphrase, iterations })), until };
}

/** The bookmarks file: a snapshot list bound to its own id, so a week file renamed to it does not open. */
export const encryptBookmarks = ({ bookmarks, passphrase, iterations }) =>
  encryptSnapshot({ id: BOOKMARKS_ID, start: null, end: null, payload: { version: BOOKMARKS_VERSION, bookmarks }, passphrase, iterations });

async function encryptSnapshot({ id: weekId, start: startIso, end: endIso, payload, passphrase, iterations = DEFAULT_ITERATIONS }) {
  const state = checkPassphrase(passphrase);
  if (state !== 'ok') throw new Error(`passphrase is ${state}; at least ${MIN_PASSPHRASE} characters are required`);
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, iterations, 'encrypt');
  const data = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: additionalData(weekId) }, key, utf8(JSON.stringify(payload)));
  return {
    version: FORMAT_VERSION,
    week: weekId,
    start: startIso,
    end: endIso,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toBase64(salt) },
    cipher: { name: 'AES-GCM', iv: toBase64(iv) },
    data: toBase64(new Uint8Array(data)),
  };
}

/**
 * The payload of a week file. Pass `week` (the id the file was fetched as) so
 * that a renamed file fails authentication even with its `week` field untouched.
 */
export async function decryptWeek(file, passphrase, { week = file?.week } = {}) {
  const { kdf, cipher } = file ?? {};
  const iterations = kdf?.iterations;
  if (!READABLE_VERSIONS.has(file?.version) || kdf?.name !== 'PBKDF2' || kdf?.hash !== 'SHA-256' || cipher?.name !== 'AES-GCM' || !Number.isInteger(iterations) || iterations < 1 || iterations > 10_000_000) {
    throw new Error('not a news.fm week file');
  }
  let salt;
  let iv;
  let data;
  try {
    salt = fromBase64(kdf.salt);
    iv = fromBase64(cipher.iv);
    data = fromBase64(file.data);
  } catch {
    throw new Error('not a news.fm week file');
  }
  let plain;
  try {
    const key = await deriveKey(passphrase, salt, iterations, 'decrypt');
    plain = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: additionalData(week) }, key, data);
  } catch {
    throw new WrongPassphraseError();
  }
  return JSON.parse(new TextDecoder().decode(plain));
}

// ---------------------------------------------------------------- files

/** Same formatting everywhere: 2-space JSON with a trailing newline. */
export const serializeWeek = (file) => `${JSON.stringify(file, null, 2)}\n`;

/**
 * The on-disk text of public/data/news/index.json, newest week first. Once the
 * backlog is published it is listed as `backlog: { until }`.
 */
export function serializeIndex(weekIds, backlog = null) {
  const weeks = [...new Set(weekIds)].sort(compareDates).reverse();
  return serializeWeek({ version: INDEX_VERSION, ...(backlog ? { backlog: { until: backlog.until } } : {}), weeks });
}
