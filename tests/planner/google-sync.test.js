import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { base64url, SCOPES } from '../../plugins/google-core.js';
import { createGoogleHandler, createSecrets, resolveHome } from '../../plugins/google-sync.js';
import { createStore } from '../../plugins/planner-api.js';
import { sealPlan, serializeStore } from '../../plugins/planner-core.js';

const TZ = 'Asia/Hong_Kong';
const NOW = Date.parse('2026-10-31T15:00:00Z'); // 23:00 in Hong Kong
const ROOT = resolve(import.meta.dirname, '../..');
const PRIMARY = 'me@example.com';
const TEAM = 'team123@group.calendar.google.com';
const SECRET = { installed: { client_id: 'cid.apps.googleusercontent.com', client_secret: 'csecret', redirect_uris: ['http://localhost'] } };

const json = (status, body, headers = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

/** An in-memory Google: OAuth token endpoint, revoke, and the Calendar API subset sync uses. */
function fakeGoogle() {
  const g = {
    calls: [],
    tokens: 0,
    valid: new Set(),
    refreshFails: false,
    rateLimitOnce: false,
    list: [
      { id: PRIMARY, summary: PRIMARY, primary: true },
      { id: TEAM, summary: 'Team' },
    ],
    source: {
      [PRIMARY]: [
        {
          id: 'lec1',
          summary: 'CS1102 lecture',
          description: 'bring laptop',
          location: 'Room 4-301',
          hangoutLink: 'https://meet.google.com/abc',
          htmlLink: 'https://calendar.google.com/event?eid=1',
          organizer: { email: 'prof@cityu.example' },
          attendees: [{ email: 'prof@cityu.example' }, { email: PRIMARY, self: true, responseStatus: 'accepted' }],
          start: { dateTime: '2026-11-02T10:00:00+08:00' },
          end: { dateTime: '2026-11-02T11:00:00+08:00' },
        },
        { id: 'doc', summary: 'Dentist', visibility: 'private', start: { dateTime: '2026-11-03T09:00:00+08:00' }, end: { dateTime: '2026-11-03T10:00:00+08:00' } },
        { id: 'no', summary: 'Declined thing', attendees: [{ self: true, responseStatus: 'declined' }], start: { dateTime: '2026-11-04T09:00:00+08:00' }, end: { dateTime: '2026-11-04T10:00:00+08:00' } },
        { id: 'gone', status: 'cancelled', summary: 'Cancelled', start: { date: '2026-11-04' }, end: { date: '2026-11-05' } },
        { id: 'trip', summary: 'Reading week', start: { date: '2026-11-05' }, end: { date: '2026-11-08' } },
      ],
      [TEAM]: [{ id: 'standup', summary: 'Standup', start: { dateTime: '2026-11-02T23:30:00+08:00' }, end: { dateTime: '2026-11-03T00:30:00+08:00' } }],
    },
    calendars: new Map(), // id -> { summary, events: Map }
    tombstones: new Set(),
  };

  g.fetch = async (input, init = {}) => {
    const url = new URL(input);
    const method = init.method ?? 'GET';
    g.calls.push({ method, url: url.toString(), body: init.body });
    if (url.href === 'https://oauth2.googleapis.com/token') {
      const p = new URLSearchParams(init.body);
      if (p.get('grant_type') === 'authorization_code') {
        if (p.get('code') !== 'good-code') return json(400, { error: 'invalid_grant' });
        g.exchange = Object.fromEntries(p);
        g.valid.add('at-0');
        return json(200, { access_token: 'at-0', refresh_token: 'rt-secret', expires_in: 3599, scope: g.grantScope ?? SCOPES.join(' '), token_type: 'Bearer' });
      }
      if (g.refreshFails) return json(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' });
      const at = `at-${++g.tokens}`;
      g.valid.add(at);
      return json(200, { access_token: at, expires_in: 3599, scope: SCOPES.join(' '), token_type: 'Bearer' });
    }
    if (url.href.startsWith('https://oauth2.googleapis.com/revoke')) {
      g.revoked = new URLSearchParams(init.body).get('token');
      return json(200, {});
    }
    if (!url.href.startsWith('https://www.googleapis.com/calendar/v3/')) throw new Error(`unexpected fetch ${url}`);
    const auth = init.headers?.Authorization?.replace('Bearer ', '');
    if (!g.valid.has(auth)) return json(401, { error: { code: 401, message: 'Invalid Credentials' } });
    if (g.rateLimitOnce) {
      g.rateLimitOnce = false;
      return json(403, { error: { code: 403, message: 'Rate Limit Exceeded', errors: [{ reason: 'rateLimitExceeded' }] } });
    }
    const parts = url.pathname.replace('/calendar/v3/', '').split('/').map(decodeURIComponent);
    const body = init.body ? JSON.parse(init.body) : null;
    if (parts[0] === 'users') return json(200, { items: [...g.list, ...[...g.calendars].map(([id, c]) => ({ id, summary: c.summary }))] });
    const [, calId, sub, evId] = parts;
    if (parts.length === 1 && method === 'POST') {
      const id = `planner${g.calendars.size}@group.calendar.google.com`;
      g.calendars.set(id, { summary: body.summary, description: body.description, events: new Map() });
      return json(200, { id, summary: body.summary });
    }
    const own = g.calendars.get(calId);
    if (!sub) return own ? json(200, { id: calId, summary: own.summary }) : json(404, { error: { code: 404, message: 'Not Found' } });
    if (!own) {
      // A source calendar: events.list only.
      expect(url.searchParams.get('singleEvents')).toBe('true');
      expect(url.searchParams.get('orderBy')).toBe('startTime');
      expect(url.searchParams.get('maxResults')).toBe('2500');
      expect(url.searchParams.get('timeZone')).toBe(TZ);
      expect(url.searchParams.get('timeMin')).toBe('2026-08-31T16:00:00.000Z'); // 2026-09-01 00:00 HKT
      const items = g.source[calId] ?? [];
      // Two pages, to exercise pageToken.
      if (!url.searchParams.get('pageToken') && items.length > 1) return json(200, { items: items.slice(0, 1), nextPageToken: 'p2' });
      return json(200, { items: url.searchParams.get('pageToken') ? items.slice(1) : items });
    }
    if (!evId && method === 'GET') return json(200, { items: [...own.events.values()].filter((e) => e.status !== 'cancelled') });
    if (!evId && method === 'POST') {
      if (own.events.has(body.id) || g.tombstones.has(body.id)) return json(409, { error: { code: 409, message: 'The requested identifier already exists.' } });
      own.events.set(body.id, { ...body, etag: '"1"' });
      return json(200, own.events.get(body.id));
    }
    if (method === 'GET') return own.events.has(evId) ? json(200, own.events.get(evId)) : json(404, { error: { code: 404, message: 'Not Found' } });
    if (method === 'PUT') {
      g.tombstones.delete(evId);
      own.events.set(evId, { ...body, etag: '"2"' });
      return json(200, own.events.get(evId));
    }
    if (method === 'DELETE') {
      if (!own.events.delete(evId)) return json(410, { error: { code: 410, message: 'Resource has been deleted' } });
      return new Response(null, { status: 204 });
    }
    throw new Error(`unhandled ${method} ${url}`);
  };
  return g;
}

/** Drive a Connect-style handler without a socket. */
function invoke(handler, { method = 'GET', url, headers = {}, body, remote = '::1' }) {
  return new Promise((ok) => {
    const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    req.method = method;
    req.url = url;
    req.headers = { host: 'localhost:5184', ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers };
    req.socket = { remoteAddress: remote };
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(k, v) {
        this.headers[k.toLowerCase()] = v;
      },
      end(text) {
        ok({ status: this.statusCode, headers: this.headers, body: text ? JSON.parse(text) : undefined });
      },
    };
    handler(req, res, () => ok({ status: 'next' }));
  });
}

let dir;
let home;
let plansFile;
let eventsFile;
let g;
let handler;
let sleeps;

async function plansFixture() {
  const a = await sealPlan({ title: 'Ship planner', notes: '', tag: 'web', tasks: ['api', 'ui'], start: '2026-11-03', end: '2026-11-09' }, '2026-11-01T10:00:00.000Z');
  const b = await sealPlan({ title: 'Read paper', notes: 'DQN', tag: '', tasks: ['read'], start: '2026-11-10', end: '2026-11-10' }, '2026-11-01T11:00:00.000Z');
  return [a, b];
}

const API = '/repo/api/google';
const call = (name, opts = {}) => invoke(handler, { url: `${API}/${name}`, ...opts });

async function connectFlow() {
  const res = await call('connect');
  const auth = new URL(res.headers.location);
  const back = await call(`callback?state=${auth.searchParams.get('state')}&code=good-code&scope=x`);
  return { auth, back };
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'planner-google-'));
  home = join(dir, 'secrets');
  plansFile = join(dir, 'data', 'plans.json');
  eventsFile = join(dir, 'data', 'google-events.json');
  await mkdir(join(dir, 'data'));
  await writeFile(plansFile, serializeStore(await plansFixture()));
  g = fakeGoogle();
  sleeps = [];
  handler = createGoogleHandler({
    home,
    store: createStore(plansFile),
    eventsFile,
    fetch: g.fetch,
    now: () => NOW,
    sleep: async (ms) => sleeps.push(ms),
    tz: TZ,
    site: 'example.test/planner/',
  });
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const configure = async () => {
  await mkdir(home, { recursive: true });
  await writeFile(join(home, 'client_secret.json'), JSON.stringify(SECRET));
};
const mode = async (p) => (await stat(p)).mode & 0o777;

describe('secrets directory', () => {
  test('defaults to ~/.config/planner-cal and honours PLANNER_CAL_HOME', () => {
    expect(resolveHome({ root: ROOT, env: {} })).toBe(join(homedir(), '.config', 'planner-cal'));
    expect(resolveHome({ root: ROOT, env: { PLANNER_CAL_HOME: join(tmpdir(), 'pc') } })).toBe(join(tmpdir(), 'pc'));
  });

  test('refuses a home inside the project root', () => {
    expect(() => resolveHome({ root: ROOT, env: { PLANNER_CAL_HOME: join(ROOT, 'secrets') } })).toThrow(/inside the project/);
    expect(() => resolveHome({ root: ROOT, env: { PLANNER_CAL_HOME: ROOT } })).toThrow(/inside the project/);
    expect(() => resolveHome({ root: ROOT, env: { PLANNER_CAL_HOME: join(ROOT, 'public', '..', 'x') } })).toThrow(/inside the project/);
    // A sibling whose name merely starts with the root's name is outside.
    expect(resolveHome({ root: ROOT, env: { PLANNER_CAL_HOME: `${ROOT}-secrets` } })).toBe(`${ROOT}-secrets`);
  });

  test('dir is 0700 and token/settings files are 0600', async () => {
    await mkdir(home, { mode: 0o755 });
    const secrets = createSecrets(home);
    await secrets.saveToken({ refresh_token: 'x' });
    await secrets.saveSettings({ selected: ['a'] });
    expect(await mode(home)).toBe(0o700);
    expect(await mode(join(home, 'token.json'))).toBe(0o600);
    expect(await mode(join(home, 'settings.json'))).toBe(0o600);
    expect((await secrets.settings()).selected).toEqual(['a']);
  });
});

describe('google routes', () => {
  test('status when not configured', async () => {
    const res = await call('status');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ configured: false, connected: false, email: null, plannerCalendar: null, lastSync: null, scopes: SCOPES });
    expect(res.body.clientFile).toMatch(/client_secret\.json$/);
    expect(res.body.calendars).toBeUndefined();
    expect(g.calls).toHaveLength(0);
  });

  test('a Web client is reported as a configuration error', async () => {
    await mkdir(home, { recursive: true });
    await writeFile(join(home, 'client_secret.json'), JSON.stringify({ web: { client_id: 'x' } }));
    const res = await call('status');
    expect(res.body.configured).toBe(false);
    expect(res.body.configError).toMatch(/Desktop app/);
  });

  test('connect redirects to Google with PKCE; callback saves the token', async () => {
    await configure();
    expect((await call('status')).body).toMatchObject({ configured: true, connected: false });
    const { auth, back } = await connectFlow();
    expect(auth.origin + auth.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    const q = Object.fromEntries(auth.searchParams);
    expect(q).toMatchObject({
      client_id: SECRET.installed.client_id,
      redirect_uri: 'http://localhost:5184/repo/api/google/callback',
      code_challenge_method: 'S256',
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      scope: SCOPES.join(' '),
    });
    // The verifier sent to the token endpoint hashes to the challenge sent to Google.
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(g.exchange.code_verifier)));
    expect(base64url(digest)).toBe(q.code_challenge);
    expect(g.exchange).toMatchObject({ grant_type: 'authorization_code', redirect_uri: q.redirect_uri, client_secret: 'csecret' });

    expect(back.status).toBe(302);
    expect(back.headers.location).toBe('/repo/planner/?google=connected');
    expect(back.headers.location).not.toContain('at-0');
    expect(await mode(home)).toBe(0o700);
    expect(await mode(join(home, 'token.json'))).toBe(0o600);
    expect(JSON.parse(await readFile(join(home, 'token.json'), 'utf8'))).toMatchObject({ refresh_token: 'rt-secret', expires_at: NOW + 3599000 });

    // State is single-use.
    const again = await call(`callback?state=${q.state}&code=good-code`);
    expect(again.headers.location).toBe('/repo/planner/?google=error&reason=state');
  });

  test('connect uses the Host header, and rejects non-loopback hosts', async () => {
    await configure();
    const v6 = await call('connect', { headers: { host: '[::1]:5173' } });
    expect(new URL(v6.headers.location).searchParams.get('redirect_uri')).toBe('http://[::1]:5173/repo/api/google/callback');
    const bad = await call('connect', { headers: { host: 'evil.example:5173' } });
    expect(bad.status).toBe(403);
    expect((await call('status', { headers: { host: 'localhost.evil.example' } })).status).toBe(403);
  });

  test('callback errors redirect with a short reason and save nothing', async () => {
    await configure();
    expect((await call('callback?state=nope&code=x')).headers.location).toBe('/repo/planner/?google=error&reason=state');
    let auth = new URL((await call('connect')).headers.location);
    const denied = await call(`callback?state=${auth.searchParams.get('state')}&error=access_denied`);
    expect(denied.headers.location).toBe('/repo/planner/?google=error&reason=access_denied');
    auth = new URL((await call('connect')).headers.location);
    const badCode = await call(`callback?state=${auth.searchParams.get('state')}&code=bad`);
    expect(badCode.headers.location).toBe('/repo/planner/?google=error&reason=invalid_grant');
    g.grantScope = SCOPES[0];
    auth = new URL((await call('connect')).headers.location);
    const partial = await call(`callback?state=${auth.searchParams.get('state')}&code=good-code`);
    expect(partial.headers.location).toBe('/repo/planner/?google=error&reason=scopes');
    expect(g.revoked).toBe('rt-secret');
    await expect(stat(join(home, 'token.json'))).rejects.toThrow();
  });

  test('connect without a client file redirects with not_configured', async () => {
    const res = await call('connect');
    expect(res.headers.location).toBe('/repo/planner/?google=error&reason=not_configured');
  });

  test('status when connected lists calendars live; PUT validates against the list', async () => {
    await configure();
    await connectFlow();
    const s = (await call('status')).body;
    expect(s).toMatchObject({ configured: true, connected: true, email: PRIMARY });
    expect(s.calendars).toEqual([
      { id: PRIMARY, name: PRIMARY, color: null, selected: false, primary: true },
      { id: TEAM, name: 'Team', color: null, selected: false, primary: false },
    ]);
    expect((await call('calendars', { method: 'PUT', body: { selected: ['nope@x'] } })).status).toBe(400);
    expect((await call('calendars', { method: 'PUT', body: { selected: 'x' } })).status).toBe(400);
    expect((await call('calendars', { method: 'PUT', body: undefined, headers: { 'content-type': 'text/plain' } })).status).toBe(415);
    const ok = await call('calendars', { method: 'PUT', body: { selected: [TEAM, PRIMARY] } });
    expect(ok.body).toEqual({ selected: [PRIMARY, TEAM] });
    const after = (await call('status')).body.calendars;
    expect(after.map((c) => [c.selected, c.color])).toEqual([
      [true, 0],
      [true, 1],
    ]);
  });

  test('sync pulls privately, pushes plans and is idempotent', async () => {
    await configure();
    await connectFlow();
    await call('calendars', { method: 'PUT', body: { selected: [PRIMARY, TEAM] } });

    const first = await call('sync', { method: 'POST', body: {} });
    expect(first.status).toBe(200);
    expect(first.body).toEqual({
      pulled: { events: 4, calendars: 2 },
      pushed: { created: 2, updated: 0, deleted: 0, restored: 0, unchanged: 0, foreign: 0 },
      errors: [],
      lastSync: new Date(NOW).toISOString(),
    });

    const text = await readFile(eventsFile, 'utf8');
    const file = JSON.parse(text);
    expect(file.pulledAt).toBe(new Date(NOW).toISOString());
    expect(file.window).toEqual({ start: '2026-09-01', end: '2027-10-31' });
    expect(file.calendars).toEqual([
      { name: 'primary', color: 0 },
      { name: 'Team', color: 1 },
    ]);
    expect(file.events.map((e) => [e.title, e.calendar, e.allDay])).toEqual([
      ['CS1102 lecture', 'primary', false],
      ['Standup', 'Team', false],
      ['busy', 'primary', false],
      ['Reading week', 'primary', true],
    ]);
    expect(file.events[1].days).toEqual(['2026-11-02', '2026-11-03']);
    expect(file.events[3]).toMatchObject({ start: '2026-11-05', end: '2026-11-07' });
    for (const leak of [PRIMARY, TEAM, 'Room 4-301', 'meet.google', 'bring laptop', 'prof@', 'Dentist', 'Declined', 'Cancelled', 'eid=', 'lec1']) {
      expect(text).not.toContain(leak);
    }

    // planner.cal was created once, with the site in its description.
    expect(g.calendars.size).toBe(1);
    const [[calId, cal]] = [...g.calendars];
    expect(cal).toMatchObject({ summary: 'planner.cal', description: 'Sealed plans from example.test/planner/ · managed by planner.cal sync' });
    const status = (await call('status')).body;
    expect(status.plannerCalendar).toEqual({ id: calId, name: 'planner.cal' });
    expect(status.calendars.map((c) => c.id)).not.toContain(calId);
    expect((await call('calendars', { method: 'PUT', body: { selected: [calId] } })).status).toBe(400);

    const second = await call('sync', { method: 'POST', body: {} });
    expect(second.body.pushed).toEqual({ created: 0, updated: 0, deleted: 0, restored: 0, unchanged: 2, foreign: 0 });
    expect(g.calendars.size).toBe(1);
  });

  test('sync diff: updated, restored, deleted, 409 tombstone, foreign events', async () => {
    await configure();
    await connectFlow();
    await call('sync', { method: 'POST', body: {} });
    const [[, cal]] = [...g.calendars];
    const [a, b] = await plansFixture();

    // Tick a task on plan a (done count changes) and break plan b's seal.
    a.tasks[0] = { text: 'api', done: true, doneAt: '2026-11-04T00:00:00.000Z' };
    await writeFile(plansFile, serializeStore([a]));
    // Owner edits a's title in Google, and a stray manual event exists.
    cal.events.get(a.hash).summary = 'renamed in google';
    cal.events.set('manual1', { id: 'manual1', summary: 'by hand' });
    let res = await call('sync', { method: 'POST', body: {} });
    expect(res.body.pushed).toEqual({ created: 0, updated: 0, deleted: 1, restored: 1, unchanged: 0, foreign: 1 });
    expect(cal.events.get(a.hash).summary).toBe('Ship planner');
    expect(cal.events.get(a.hash).description).toContain('1/2 done');
    expect(cal.events.has(b.hash)).toBe(false);
    expect(cal.events.has('manual1')).toBe(true);

    // Only the done count changes -> updated.
    a.tasks[1] = { text: 'ui', done: true, doneAt: '2026-11-05T00:00:00.000Z' };
    await writeFile(plansFile, serializeStore([a, b]));
    // b was deleted in Google: GET 404, insert 409 -> update back to confirmed.
    g.tombstones.add(b.hash);
    res = await call('sync', { method: 'POST', body: {} });
    expect(res.body.pushed).toMatchObject({ created: 0, updated: 1, restored: 1, deleted: 0 });
    expect(cal.events.get(b.hash).status).toBe('confirmed');

    // Cancelled in Google -> restored via update.
    cal.events.get(b.hash).status = 'cancelled';
    res = await call('sync', { method: 'POST', body: {} });
    expect(res.body.pushed).toMatchObject({ restored: 1, unchanged: 1 });
    expect(cal.events.get(b.hash).status).toBe('confirmed');
  });

  test('a recreated planner.cal: a stale stored id is replaced', async () => {
    await configure();
    await connectFlow();
    await createSecrets(home).saveSettings({ plannerCalendarId: 'deleted@group.calendar.google.com' });
    const res = await call('sync', { method: 'POST', body: {} });
    expect(res.body.pushed.created).toBe(2);
    expect((await createSecrets(home).settings()).plannerCalendarId).toBe('planner0@group.calendar.google.com');
  });

  test('401 triggers one refresh and a retry', async () => {
    await configure();
    await connectFlow();
    g.valid.clear(); // Google revoked the access token, not the refresh token.
    const res = await call('status');
    expect(res.body.connected).toBe(true);
    expect(g.tokens).toBe(1);
    expect(JSON.parse(await readFile(join(home, 'token.json'), 'utf8')).access_token).toBe('at-1');
  });

  test('rate limits back off and retry', async () => {
    await configure();
    await connectFlow();
    g.rateLimitOnce = true;
    expect((await call('status')).body.connected).toBe(true);
    expect(sleeps).toEqual([1000]);
  });

  test('a failed refresh returns 409 reconnect and status drops to connected:false', async () => {
    await configure();
    await connectFlow();
    g.valid.clear();
    g.refreshFails = true;
    const res = await call('sync', { method: 'POST', body: {} });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'reconnect' });
    const s = (await call('status')).body;
    expect(s).toMatchObject({ configured: true, connected: false, reconnect: true });
    await expect(stat(join(home, 'token.json'))).rejects.toThrow();
  });

  test('partial failure still returns 200 and does not publish a half pull', async () => {
    await configure();
    await connectFlow();
    await call('calendars', { method: 'PUT', body: { selected: [PRIMARY, TEAM] } });
    g.list = g.list.filter((c) => c.id !== TEAM); // TEAM was removed in Google
    const res = await call('sync', { method: 'POST', body: {} });
    expect(res.status).toBe(200);
    expect(res.body.errors.join('\n')).toMatch(/no longer in your list[\s\S]*not updated/);
    expect(res.body.pushed.created).toBe(2);
    await expect(stat(eventsFile)).rejects.toThrow();
  });

  test('sync without a connection is 409', async () => {
    await configure();
    expect((await call('sync', { method: 'POST', body: {} })).body).toEqual({ error: 'not connected' });
  });

  test('disconnect revokes, deletes the token and keeps settings', async () => {
    await configure();
    await connectFlow();
    await call('calendars', { method: 'PUT', body: { selected: [TEAM] } });
    const res = await call('disconnect', { method: 'POST', body: {} });
    expect(res.body).toEqual({ connected: false });
    expect(g.revoked).toBe('rt-secret');
    await expect(stat(join(home, 'token.json'))).rejects.toThrow();
    expect((await createSecrets(home).settings()).selected).toEqual([TEAM]);
    expect((await call('status')).body).toMatchObject({ connected: false, reconnect: false });
  });

  test('guards: loopback clients, methods, cross-origin, other paths', async () => {
    expect((await call('status', { remote: '192.168.1.20' })).status).toBe(403);
    expect((await call('sync')).status).toBe(405);
    expect((await call('sync', { method: 'POST', body: {}, headers: { origin: 'https://evil.example' } })).status).toBe(403);
    expect((await call('sync', { method: 'POST', body: {}, headers: { origin: 'http://localhost:5184' } })).body).toEqual({ error: 'not configured' });
    expect((await invoke(handler, { url: '/api/googlex/status' })).status).toBe('next');
    expect((await invoke(handler, { url: '/api/plans' })).status).toBe('next');
  });
});
