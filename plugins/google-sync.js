// Two-way Google Calendar sync for planner.cal, as Vite middleware next to the
// plans API (registered from plugins/planner-api.js, loopback clients only).
// Nothing talks to Google until the owner presses `sync` or connects.
// See docs/PLANNER.md#google.
//
//   GET  …/api/google/status      -> { configured, connected, email, calendars?, plannerCalendar, lastSync, scopes }
//   GET  …/api/google/connect     -> 302 to Google (PKCE S256)
//   GET  …/api/google/callback    -> 302 to <base>planner/?google=connected|error&reason=…
//   POST …/api/google/disconnect  -> revoke (best effort), delete token.json
//   PUT  …/api/google/calendars   -> { selected: [calendarId] }
//   POST …/api/google/sync        -> { pulled, pushed, errors, lastSync }
//
// Secrets live outside the repo in ~/.config/planner-cal/ (or $PLANNER_CAL_HOME):
// client_secret.json (owner-provided), token.json, settings.json; dir 0700, files 0600.
// Tokens never appear in a URL, a response body or a log line.
import { realpathSync } from 'node:fs';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { addDays } from '../src/planner/dates.js';
import {
  buildAuthUrl,
  COLOR_SLOTS,
  createPkce,
  DEFAULT_SITE,
  diffEvent,
  GOOGLE,
  isLoopbackHost,
  isValidEventId,
  localDateIn,
  missingScopes,
  PLANNER_CALENDAR,
  planToEvent,
  publicCalendarName,
  pullWindow,
  randomToken,
  reasonCode,
  redirectUriFor,
  SCOPES,
  serializeEvents,
  staleEvents,
  toPublicEvent,
  zonedMidnight,
} from './google-core.js';
import { HttpError, isLoopbackClient, readJsonBody, send } from './http.js';

const ROUTE_RE = /\/api\/google\/(status|connect|callback|disconnect|calendars|sync)\/?$/;
const STATE_TTL_MS = 10 * 60 * 1000;
const RETRIES = 3;
const RATE_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded']);
const PULL_FIELDS = 'items(id,status,summary,start,end,visibility,eventType,attendees(self,responseStatus)),nextPageToken';
const LIST_FIELDS = 'items(id,summary,summaryOverride,primary,deleted),nextPageToken';

// ---------------------------------------------------------------- secrets

const isInside = (parent, child) => {
  const rel = relative(parent, child);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
};

/** realpath of `p`, or of its nearest existing ancestor joined with the rest. */
function realish(p) {
  try {
    return realpathSync(p);
  } catch {
    const parent = dirname(p);
    return parent === p ? p : join(realish(parent), p.slice(parent.length));
  }
}

/**
 * The secrets directory: $PLANNER_CAL_HOME or ~/.config/planner-cal.
 * Throws when it resolves inside the project, so secrets can never be committed.
 */
export function resolveHome({ root, env = process.env }) {
  const dir = resolve(env.PLANNER_CAL_HOME || join(homedir(), '.config', 'planner-cal'));
  const top = resolve(root);
  if (isInside(top, dir) || isInside(realish(top), realish(dir))) {
    throw new Error(`planner.cal: PLANNER_CAL_HOME (${dir}) is inside the project (${top}). Keep Google secrets outside the repository.`);
  }
  return dir;
}

const tilde = (p) => (p.startsWith(homedir() + sep) ? `~${p.slice(homedir().length)}` : p);

async function writeAtomic(file, text, mode) {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await rm(tmp, { force: true });
  await writeFile(tmp, text, mode ? { encoding: 'utf8', mode } : 'utf8');
  if (mode) await chmod(tmp, mode);
  await rename(tmp, file);
}

const DEFAULT_SETTINGS = { selected: [], plannerCalendarId: null, lastSync: null, needsReconnect: false };

export function createSecrets(home) {
  const at = (name) => join(home, name);
  let queue = Promise.resolve();
  const serial = (fn) => {
    const run = queue.then(fn);
    queue = run.catch(() => {});
    return run;
  };

  async function ensureHome() {
    await mkdir(home, { recursive: true, mode: 0o700 });
    await chmod(home, 0o700);
  }

  async function readJson(name) {
    let text;
    try {
      text = await readFile(at(name), 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new HttpError(500, `${tilde(at(name))} is not valid JSON`);
    }
  }

  async function writeJson(name, data) {
    await ensureHome();
    await writeAtomic(at(name), `${JSON.stringify(data, null, 2)}\n`, 0o600);
  }

  return {
    home,
    ensureHome,
    clientFile: at('client_secret.json'),
    /** { clientId, clientSecret } | { error } | null when the file is missing. */
    async client() {
      let data;
      try {
        data = await readJson('client_secret.json');
      } catch (err) {
        return { error: err.message };
      }
      if (data == null) return null;
      if (!data.installed && data.web) return { error: 'client_secret.json is a "Web application" client; create a "Desktop app" client' };
      const c = data.installed;
      if (!c || typeof c.client_id !== 'string') return { error: 'client_secret.json has no installed.client_id' };
      return { clientId: c.client_id, clientSecret: typeof c.client_secret === 'string' ? c.client_secret : '' };
    },
    token: () => readJson('token.json'),
    saveToken: (t) => writeJson('token.json', t),
    deleteToken: () => rm(at('token.json'), { force: true }),
    async settings() {
      const s = (await readJson('settings.json')) ?? {};
      return { ...DEFAULT_SETTINGS, ...s, selected: Array.isArray(s.selected) ? s.selected.filter((x) => typeof x === 'string') : [] };
    },
    saveSettings(patch) {
      return serial(async () => {
        const next = { ...(await this.settings()), ...patch };
        await writeJson('settings.json', next);
        return next;
      });
    },
  };
}

// ---------------------------------------------------------------- Google client

export class ReconnectError extends HttpError {
  constructor() {
    super(409, 'reconnect');
  }
}

export class GoogleError extends HttpError {
  constructor(status, message) {
    super(502, `google ${status}: ${message}`);
    this.googleStatus = status;
  }
}

const form = (params) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString(),
});

async function readBody(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function createGoogle({ secrets, fetch, sleep, now }) {
  async function refresh(token, client) {
    let res;
    try {
      res = await fetch(
        GOOGLE.token,
        form({ client_id: client.clientId, client_secret: client.clientSecret, grant_type: 'refresh_token', refresh_token: token.refresh_token }),
      );
    } catch {
      throw new HttpError(502, 'google token endpoint unreachable');
    }
    if (res.status === 400 || res.status === 401) {
      // invalid_grant: revoked, expired (7 days in Testing) or the client changed.
      await secrets.deleteToken();
      await secrets.saveSettings({ needsReconnect: true });
      throw new ReconnectError();
    }
    const body = await readBody(res);
    if (!res.ok || !body?.access_token) throw new HttpError(502, `token refresh failed: HTTP ${res.status}`);
    const next = {
      ...token,
      access_token: body.access_token,
      expires_at: now() + (Number(body.expires_in) || 3600) * 1000,
      scope: body.scope ?? token.scope,
    };
    if (body.refresh_token) next.refresh_token = body.refresh_token;
    await secrets.saveToken(next);
    return next;
  }

  async function session() {
    const client = await secrets.client();
    if (!client?.clientId) throw new HttpError(409, 'not configured');
    const token = await secrets.token();
    if (!token?.refresh_token) throw new HttpError(409, 'not connected');
    return { client, token };
  }

  /**
   * One Calendar API call. Refreshes an expired token first; a 401 triggers
   * one refresh and one retry; 429 / 403 rate limits back off briefly.
   * Statuses in `allow` are returned instead of thrown.
   */
  async function api(method, path, { query, body, allow = [] } = {}) {
    let { client, token } = await session();
    let refreshed = false;
    if (!token.access_token || !(token.expires_at > now() + 60_000)) {
      token = await refresh(token, client);
      refreshed = true;
    }
    const url = `${GOOGLE.calendar}${path}${query ? `?${new URLSearchParams(query)}` : ''}`;
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await fetch(url, {
          method,
          headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch {
        throw new HttpError(502, 'google calendar unreachable');
      }
      if (res.status === 401) {
        if (refreshed) throw new ReconnectError();
        token = await refresh(token, client);
        refreshed = true;
        continue;
      }
      const data = res.status === 204 ? null : await readBody(res);
      const reason = data?.error?.errors?.[0]?.reason;
      if ((res.status === 429 || (res.status === 403 && RATE_REASONS.has(reason))) && attempt < RETRIES) {
        const after = Number(res.headers?.get?.('retry-after'));
        await sleep(Math.min(after > 0 ? after * 1000 : 1000 * 2 ** attempt, 10_000));
        continue;
      }
      if (res.ok || allow.includes(res.status)) return { status: res.status, data };
      throw new GoogleError(res.status, data?.error?.message || reason || `HTTP ${res.status}`);
    }
  }

  async function paged(path, query) {
    const items = [];
    let pageToken;
    do {
      const { data } = await api('GET', path, { query: { ...query, ...(pageToken ? { pageToken } : {}) } });
      items.push(...(data?.items ?? []));
      pageToken = data?.nextPageToken;
    } while (pageToken);
    return items;
  }

  return { api, paged, session };
}

// ---------------------------------------------------------------- handler

const enc = encodeURIComponent;

/**
 * Connect-style middleware for …/api/google/*. Calls next() for other paths.
 * Options are injectable for tests: fetch, now, sleep, tz, site.
 */
export function createGoogleHandler({
  home,
  store,
  eventsFile,
  fetch = globalThis.fetch,
  now = Date.now,
  sleep = (ms) => new Promise((ok) => setTimeout(ok, ms)),
  tz = Intl.DateTimeFormat().resolvedOptions().timeZone,
  site = process.env.PLANNER_CAL_SITE || DEFAULT_SITE,
}) {
  const secrets = createSecrets(home);
  const google = createGoogle({ secrets, fetch, sleep, now });
  const pending = new Map(); // state -> { verifier, redirectUri, expires }
  let syncing = false;

  const prune = () => {
    for (const [k, v] of pending) if (v.expires <= now()) pending.delete(k);
  };

  /** The owner's calendar list, minus deleted entries and planner.cal itself. */
  async function calendarList(settings) {
    const items = await google.paged('/users/me/calendarList', { maxResults: '250', fields: LIST_FIELDS });
    return items.filter((c) => c && typeof c.id === 'string' && !c.deleted && c.id !== settings.plannerCalendarId);
  }

  const slotOf = (settings, list) => {
    const order = list.filter((c) => settings.selected.includes(c.id)).map((c) => c.id);
    return (id) => (order.includes(id) ? order.indexOf(id) % COLOR_SLOTS : null);
  };

  async function status() {
    const client = await secrets.client();
    const settings = await secrets.settings();
    const token = await secrets.token();
    const out = {
      configured: Boolean(client?.clientId),
      connected: false,
      reconnect: false,
      email: null,
      plannerCalendar: settings.plannerCalendarId ? { id: settings.plannerCalendarId, name: PLANNER_CALENDAR } : null,
      lastSync: settings.lastSync,
      scopes: SCOPES,
      clientFile: tilde(secrets.clientFile),
    };
    if (client?.error) out.configError = client.error;
    if (!out.configured) return out;
    if (!token?.refresh_token) {
      out.reconnect = Boolean(settings.needsReconnect);
      return out;
    }
    try {
      const list = await calendarList(settings);
      const slot = slotOf(settings, list);
      out.connected = true;
      // The primary calendar's id is the account's address; it is shown locally only.
      out.email = list.find((c) => c.primary)?.id ?? null;
      out.calendars = list.map((c) => ({
        id: c.id,
        name: c.summaryOverride || c.summary || c.id,
        color: slot(c.id),
        selected: settings.selected.includes(c.id),
        primary: Boolean(c.primary),
      }));
    } catch (err) {
      if (err instanceof ReconnectError) {
        out.reconnect = true;
        return out;
      }
      out.connected = true;
      out.calendars = [];
      out.error = err.message;
    }
    return out;
  }

  async function connect(req, res, base) {
    const fail = (reason) => send(res, 302, undefined, { Location: `${base}planner/?google=error&reason=${reason}` });
    const client = await secrets.client();
    if (!client?.clientId) return fail('not_configured');
    prune();
    const { verifier, challenge } = await createPkce();
    const state = randomToken(24);
    const redirectUri = redirectUriFor(req.headers.host, base);
    pending.set(state, { verifier, redirectUri, expires: now() + STATE_TTL_MS });
    send(res, 302, undefined, { Location: buildAuthUrl({ clientId: client.clientId, redirectUri, state, challenge }) });
  }

  async function callback(req, res, base) {
    const done = (query) => send(res, 302, undefined, { Location: `${base}planner/?${query}` });
    const fail = (reason) => done(`google=error&reason=${reasonCode(reason)}`);
    const q = new URL(req.url, 'http://loopback').searchParams;
    prune();
    const state = q.get('state');
    const entry = state ? pending.get(state) : null;
    if (state) pending.delete(state);
    if (!entry) return fail('state');
    if (q.get('error')) return fail(q.get('error'));
    const code = q.get('code');
    if (!code) return fail('no_code');
    const client = await secrets.client();
    if (!client?.clientId) return fail('not_configured');

    let res2;
    try {
      res2 = await fetch(
        GOOGLE.token,
        form({
          code,
          client_id: client.clientId,
          client_secret: client.clientSecret,
          redirect_uri: entry.redirectUri,
          grant_type: 'authorization_code',
          code_verifier: entry.verifier,
        }),
      );
    } catch {
      return fail('network');
    }
    const body = await readBody(res2);
    if (!res2.ok || !body?.access_token) return fail(body?.error || 'exchange');
    if (!body.refresh_token) return fail('no_refresh_token');
    if (missingScopes(body.scope).length) {
      // Granular consent let the owner untick a box; sync cannot work half-way.
      await fetch(GOOGLE.revoke, form({ token: body.refresh_token })).catch(() => {});
      return fail('scopes');
    }
    await secrets.saveToken({
      access_token: body.access_token,
      refresh_token: body.refresh_token,
      expires_at: now() + (Number(body.expires_in) || 3600) * 1000,
      scope: body.scope,
      token_type: body.token_type ?? 'Bearer',
    });
    await secrets.saveSettings({ needsReconnect: false });
    done('google=connected');
  }

  async function disconnect() {
    const token = await secrets.token().catch(() => null);
    const t = token?.refresh_token || token?.access_token;
    if (t) {
      try {
        await fetch(GOOGLE.revoke, form({ token: t }));
      } catch {
        // Best effort: the local token is deleted either way.
      }
    }
    await secrets.deleteToken();
    await secrets.saveSettings({ needsReconnect: false });
    return { connected: false };
  }

  async function selectCalendars(body) {
    const ids = body?.selected;
    if (!Array.isArray(ids) || ids.some((x) => typeof x !== 'string' || !x || x.length > 1024) || ids.length > 100) {
      throw new HttpError(400, 'selected must be a list of calendar ids', 'selected');
    }
    const settings = await secrets.settings();
    if (settings.plannerCalendarId && ids.includes(settings.plannerCalendarId)) {
      throw new HttpError(400, 'planner.cal is where plans are pushed; it cannot be pulled from', 'selected');
    }
    const list = await calendarList(settings);
    const known = new Set(list.map((c) => c.id));
    if (ids.some((id) => !known.has(id))) throw new HttpError(400, 'unknown calendar id', 'selected');
    const selected = list.map((c) => c.id).filter((id) => ids.includes(id));
    await secrets.saveSettings({ selected });
    return { selected };
  }

  // ------------------------------------------------------------ sync

  async function pull(settings, out, errors) {
    const list = await calendarList(settings);
    const byId = new Map(list.map((c) => [c.id, c]));
    const window = pullWindow(localDateIn(new Date(now()), tz));
    const query = {
      timeMin: zonedMidnight(window.start, tz),
      timeMax: zonedMidnight(addDays(window.end, 1), tz),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '2500',
      timeZone: tz,
      fields: PULL_FIELDS,
    };
    const calendars = [];
    const events = [];
    let failed = false;
    for (const [i, id] of settings.selected.entries()) {
      const entry = byId.get(id);
      if (!entry) {
        errors.push('pull: a selected calendar is no longer in your list; untick it under "pull from"');
        failed = true;
        continue;
      }
      const name = publicCalendarName(entry, i);
      const color = i % COLOR_SLOTS;
      try {
        const items = await google.paged(`/calendars/${enc(id)}/events`, query);
        for (const ev of items) {
          const rec = await toPublicEvent(ev, { calendarId: id, calendarName: name, color, tz });
          if (rec) events.push(rec);
        }
        calendars.push({ name, color });
      } catch (err) {
        if (err instanceof ReconnectError) throw err;
        errors.push(`pull: ${name}: ${err.message}`);
        failed = true;
      }
    }
    if (failed) {
      // Never publish a half pull: the file would silently lose a calendar.
      errors.push('pull: google-events.json was not updated');
      return;
    }
    await writeAtomic(eventsFile, serializeEvents({ pulledAt: new Date(now()).toISOString(), window, calendars, events }, tz));
    out.events = events.length;
    out.calendars = calendars.length;
  }

  async function ensurePlannerCalendar(settings) {
    const id = settings.plannerCalendarId;
    if (id) {
      const got = await google.api('GET', `/calendars/${enc(id)}`, { allow: [404, 410] });
      if (got.status === 200) return id;
    }
    const made = await google.api('POST', '/calendars', {
      body: { summary: PLANNER_CALENDAR, description: `Sealed plans from ${site} · managed by planner.cal sync`, timeZone: tz },
    });
    await secrets.saveSettings({ plannerCalendarId: made.data.id });
    settings.plannerCalendarId = made.data.id;
    return made.data.id;
  }

  async function upsert(calId, desired) {
    const path = `/calendars/${enc(calId)}/events/${desired.id}`;
    const got = await google.api('GET', path, { allow: [404, 410] });
    if (got.status !== 200) {
      const ins = await google.api('POST', `/calendars/${enc(calId)}/events`, { body: desired, allow: [409] });
      if (ins.status !== 409) return 'created';
      // The id exists but was deleted earlier: bring it back.
      await google.api('PUT', path, { body: desired });
      return 'restored';
    }
    const kind = diffEvent(got.data, desired);
    if (kind !== 'unchanged') await google.api('PUT', path, { body: desired });
    return kind;
  }

  async function push(settings, read, out, errors) {
    const plans = await read();
    const calId = await ensurePlannerCalendar(settings);
    for (const plan of plans) {
      if (!isValidEventId(plan.hash)) {
        errors.push(`push: plan ${plan.id}: hash is not a valid event id`);
        continue;
      }
      try {
        out[await upsert(calId, planToEvent(plan))] += 1;
      } catch (err) {
        if (err instanceof ReconnectError) throw err;
        errors.push(`push: ${plan.title}: ${err.message}`);
      }
    }
    const existing = await google.paged(`/calendars/${enc(calId)}/events`, {
      maxResults: '2500',
      fields: 'items(id,status,extendedProperties),nextPageToken',
    });
    const { stale, foreign } = staleEvents(existing, plans);
    for (const ev of stale) {
      try {
        await google.api('DELETE', `/calendars/${enc(calId)}/events/${enc(ev.id)}`, { allow: [404, 410] });
        out.deleted += 1;
      } catch (err) {
        if (err instanceof ReconnectError) throw err;
        errors.push(`push: delete ${ev.id.slice(0, 7)}: ${err.message}`);
      }
    }
    out.foreign = foreign.length;
  }

  async function sync() {
    if (syncing) throw new HttpError(409, 'a sync is already running');
    syncing = true;
    try {
      await google.session();
      // Pull and push run inside the plans write queue: no plan write can interleave.
      return await store.exclusive(async ({ read }) => {
        const settings = await secrets.settings();
        const errors = [];
        const pulled = { events: 0, calendars: 0 };
        const pushed = { created: 0, updated: 0, deleted: 0, restored: 0, unchanged: 0, foreign: 0 };
        for (const [step, run] of [
          ['pull', () => pull(settings, pulled, errors)],
          ['push', () => push(settings, read, pushed, errors)],
        ]) {
          try {
            await run();
          } catch (err) {
            if (err instanceof ReconnectError) throw err;
            errors.push(`${step}: ${err.message}`);
          }
        }
        const lastSync = new Date(now()).toISOString();
        await secrets.saveSettings({ lastSync });
        return { pulled, pushed, errors, lastSync };
      });
    } finally {
      syncing = false;
    }
  }

  const METHODS = { status: 'GET', connect: 'GET', callback: 'GET', disconnect: 'POST', calendars: 'PUT', sync: 'POST' };

  async function route(req, res, name, base) {
    const method = req.method === 'HEAD' ? 'GET' : req.method;
    if (method !== METHODS[name]) return send(res, 405, { error: `${req.method} not allowed on /api/google/${name}` }, { Allow: METHODS[name] });
    if (name === 'status') return send(res, 200, await status());
    if (name === 'connect') return connect(req, res, base);
    if (name === 'callback') return callback(req, res, base);
    // Writes need a JSON body: a cross-site form post cannot send one.
    const body = await readJsonBody(req);
    if (name === 'disconnect') return send(res, 200, await disconnect());
    if (name === 'calendars') return send(res, 200, await selectCalendars(body));
    return send(res, 200, await sync());
  }

  return function googleSyncMiddleware(req, res, next) {
    const path = (req.url || '').split('?')[0];
    const match = ROUTE_RE.exec(path);
    if (!match) return next();
    if (!isLoopbackClient(req)) return send(res, 403, { error: 'the planner API only answers loopback clients' });
    // DNS rebinding sends loopback traffic with a foreign Host; refuse it.
    if (!isLoopbackHost(req.headers.host)) return send(res, 403, { error: 'Host must be localhost, 127.0.0.1 or [::1]' });
    const origin = req.headers.origin;
    if (origin) {
      let ok = false;
      try {
        ok = isLoopbackHost(new URL(origin).host);
      } catch {
        ok = false;
      }
      if (!ok) return send(res, 403, { error: 'cross-origin request refused' });
    }
    const base = `${path.slice(0, path.length - match[0].length)}/`;
    route(req, res, match[1], base).catch((err) => {
      if (err instanceof HttpError) {
        return send(res, err.status, err.field ? { error: err.message, field: err.field } : { error: err.message });
      }
      send(res, 500, { error: err.message || 'internal error' });
    });
  };
}
