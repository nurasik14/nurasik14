import { describe, expect, test } from 'bun:test';
import {
  base64url,
  buildAuthUrl,
  createPkce,
  diffEvent,
  eventDays,
  isLoopbackHost,
  isValidEventId,
  missingScopes,
  planDescription,
  planToEvent,
  publicCalendarName,
  pullWindow,
  reasonCode,
  redirectUriFor,
  SCOPES,
  serializeEvents,
  sha256Hex,
  staleEvents,
  toPublicEvent,
  zonedMidnight,
} from '../../plugins/google-core.js';
import { sealPlan } from '../../plugins/planner-core.js';

const TZ = 'Asia/Hong_Kong';
const ctx = { calendarId: 'me@example.com', calendarName: 'primary', color: 0, tz: TZ };

async function samplePlan(overrides = {}) {
  const plan = await sealPlan(
    { title: 'Ship planner', notes: 'keep it small', tag: 'web', tasks: ['api', 'ui'], start: '2026-11-03', end: '2026-11-09', ...overrides },
    '2026-11-01T10:00:00.000Z',
  );
  plan.tasks[0] = { text: 'api', done: true, doneAt: '2026-11-04T09:00:00.000Z' };
  return plan;
}

describe('Google event -> public record', () => {
  const full = {
    id: 'evt1',
    status: 'confirmed',
    summary: 'CS1102 lecture',
    description: 'secret description',
    location: 'Room 4-301',
    htmlLink: 'https://www.google.com/calendar/event?eid=xyz',
    hangoutLink: 'https://meet.google.com/abc-defg-hij',
    conferenceData: { entryPoints: [{ uri: 'https://meet.google.com/abc-defg-hij' }] },
    organizer: { email: 'prof@cityu.example' },
    creator: { email: 'prof@cityu.example' },
    attendees: [{ email: 'prof@cityu.example' }, { email: 'me@example.com', self: true, responseStatus: 'accepted' }],
    start: { dateTime: '2026-11-02T10:00:00+08:00' },
    end: { dateTime: '2026-11-02T11:00:00+08:00' },
  };

  test('publishes only the minimal whitelist', async () => {
    const rec = await toPublicEvent(full, ctx);
    expect(Object.keys(rec).sort()).toEqual(['allDay', 'calendar', 'color', 'days', 'end', 'id', 'start', 'title']);
    expect(rec).toMatchObject({ title: 'CS1102 lecture', allDay: false, start: full.start.dateTime, end: full.end.dateTime, days: ['2026-11-02'] });
    const text = JSON.stringify(rec);
    for (const leak of ['secret', 'Room', 'meet.google', 'eid=', 'prof@', 'me@example.com', 'evt1']) expect(text).not.toContain(leak);
  });

  test('opaque id is the first 12 hex of sha256(calendarId + eventId)', async () => {
    const rec = await toPublicEvent(full, ctx);
    expect(rec.id).toBe((await sha256Hex('me@example.comevt1')).slice(0, 12));
    expect(rec.id).toMatch(/^[0-9a-f]{12}$/);
  });

  test('private and confidential events are published as "busy"', async () => {
    expect((await toPublicEvent({ ...full, visibility: 'private' }, ctx)).title).toBe('busy');
    expect((await toPublicEvent({ ...full, visibility: 'confidential' }, ctx)).title).toBe('busy');
    expect((await toPublicEvent({ ...full, visibility: 'public' }, ctx)).title).toBe('CS1102 lecture');
  });

  test('cancelled, declined and working-location events are skipped', async () => {
    expect(await toPublicEvent({ ...full, status: 'cancelled' }, ctx)).toBeNull();
    const declined = { ...full, attendees: [{ email: 'x@y', responseStatus: 'declined' }, { self: true, responseStatus: 'declined' }] };
    expect(await toPublicEvent(declined, ctx)).toBeNull();
    // Someone else declining does not hide the event.
    expect(await toPublicEvent({ ...full, attendees: [{ responseStatus: 'declined' }, { self: true, responseStatus: 'tentative' }] }, ctx)).not.toBeNull();
    expect(await toPublicEvent({ ...full, eventType: 'workingLocation' }, ctx)).toBeNull();
  });

  test('all-day: Google end.date is exclusive, published end is inclusive', async () => {
    const rec = await toPublicEvent({ id: 'a', summary: 'Reading week', start: { date: '2026-11-05' }, end: { date: '2026-11-08' } }, ctx);
    expect(rec).toMatchObject({ start: '2026-11-05', end: '2026-11-07', allDay: true });
    expect(rec.days).toBeUndefined();
    const one = await toPublicEvent({ id: 'b', summary: 'Holiday', start: { date: '2026-12-25' }, end: { date: '2026-12-26' } }, ctx);
    expect(one).toMatchObject({ start: '2026-12-25', end: '2026-12-25' });
    // Across a month and year boundary.
    const nye = await toPublicEvent({ id: 'c', summary: 'Trip', start: { date: '2026-12-31' }, end: { date: '2027-01-02' } }, ctx);
    expect(nye).toMatchObject({ start: '2026-12-31', end: '2027-01-01' });
  });

  test('timed days are computed in Asia/Hong_Kong across midnight', async () => {
    const late = await toPublicEvent({ id: 'n', summary: 'Night shift', start: { dateTime: '2026-11-02T23:00:00+08:00' }, end: { dateTime: '2026-11-03T01:00:00+08:00' } }, ctx);
    expect(late.days).toEqual(['2026-11-02', '2026-11-03']);
    // 15:30Z is 23:30 in Hong Kong: still the 2nd there, whatever the server's offset.
    expect(eventDays('2026-11-02T15:30:00Z', '2026-11-02T15:45:00Z', TZ)).toEqual(['2026-11-02']);
    // 16:30Z is 00:30 on the 3rd in Hong Kong.
    expect(eventDays('2026-11-02T16:30:00Z', '2026-11-02T17:00:00Z', TZ)).toEqual(['2026-11-03']);
    // Ending exactly at midnight does not spill into the next day.
    expect(eventDays('2026-11-02T22:00:00+08:00', '2026-11-03T00:00:00+08:00', TZ)).toEqual(['2026-11-02']);
    // Capped.
    expect(eventDays('2026-01-01T00:00:00+08:00', '2026-12-31T00:00:00+08:00', TZ, 5)).toHaveLength(5);
  });

  test('untitled events and email-like calendar names', async () => {
    expect((await toPublicEvent({ id: 'x', start: { date: '2026-11-01' }, end: { date: '2026-11-02' } }, ctx)).title).toBe('(no title)');
    expect(publicCalendarName({ summary: 'me@example.com', primary: true })).toBe('primary');
    expect(publicCalendarName({ summary: 'someone@group.calendar.google.com' }, 2)).toBe('calendar 3');
    expect(publicCalendarName({ summary: 'Team', summaryOverride: 'Lab' })).toBe('Lab');
  });

  test('serialized file is sorted by start then title', async () => {
    const events = await Promise.all([
      toPublicEvent({ id: '1', summary: 'b lecture', start: { dateTime: '2026-11-02T10:00:00+08:00' }, end: { dateTime: '2026-11-02T11:00:00+08:00' } }, ctx),
      toPublicEvent({ id: '2', summary: 'a lecture', start: { dateTime: '2026-11-02T10:00:00+08:00' }, end: { dateTime: '2026-11-02T11:00:00+08:00' } }, ctx),
      toPublicEvent({ id: '3', summary: 'early', start: { dateTime: '2026-11-02T01:00:00Z' }, end: { dateTime: '2026-11-02T02:00:00Z' } }, ctx),
      toPublicEvent({ id: '4', summary: 'all day', start: { date: '2026-11-02' }, end: { date: '2026-11-03' } }, ctx),
      toPublicEvent({ id: '5', summary: 'before', start: { date: '2026-11-01' }, end: { date: '2026-11-02' } }, ctx),
    ]);
    const text = serializeEvents({ pulledAt: '2026-10-31T15:00:00.000Z', window: pullWindow('2026-10-31'), calendars: [{ name: 'primary', color: 0 }], events }, TZ);
    expect(text.endsWith('}\n')).toBe(true);
    const data = JSON.parse(text);
    expect(data.version).toBe(1);
    expect(data.window).toEqual({ start: '2026-09-01', end: '2027-10-31' });
    expect(data.events.map((e) => e.title)).toEqual(['before', 'all day', 'early', 'a lecture', 'b lecture']);
  });

  test('zonedMidnight gives local midnight as a UTC instant', () => {
    expect(zonedMidnight('2026-11-02', TZ)).toBe('2026-11-01T16:00:00.000Z');
    expect(zonedMidnight('2026-07-01', 'America/New_York')).toBe('2026-07-01T04:00:00.000Z');
    expect(zonedMidnight('2026-07-01', 'UTC')).toBe('2026-07-01T00:00:00.000Z');
  });
});

describe('plan -> planner.cal event', () => {
  test('hash is a valid client-specified event id (64 hex is base32hex)', async () => {
    const plan = await samplePlan();
    expect(plan.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(isValidEventId(plan.hash)).toBe(true);
    expect(isValidEventId('abc')).toBe(false);
    expect(isValidEventId('w'.repeat(10))).toBe(false); // w is outside base32hex
  });

  test('all-day, inclusive end + 1, transparent, private extended properties', async () => {
    const plan = await samplePlan();
    const ev = planToEvent(plan);
    expect(ev).toEqual({
      id: plan.hash,
      status: 'confirmed',
      summary: 'Ship planner',
      description: `[x] api\n[ ] ui\n\nkeep it small\n\nsealed ${plan.hash.slice(0, 7)} · 1/2 done`,
      start: { date: '2026-11-03' },
      end: { date: '2026-11-10' },
      transparency: 'transparent',
      extendedProperties: { private: { plannerId: plan.id, plannerHash: plan.hash } },
    });
    // Month boundary goes through the local-date helpers.
    expect(planToEvent(await samplePlan({ start: '2026-11-30', end: '2026-11-30' })).end).toEqual({ date: '2026-12-01' });
  });

  test('description omits empty notes', async () => {
    const plan = await samplePlan({ notes: '' });
    expect(planDescription(plan)).toBe(`[x] api\n[ ] ui\n\nsealed ${plan.hash.slice(0, 7)} · 1/2 done`);
  });
});

describe('sync diff', () => {
  test('unchanged, updated, restored', async () => {
    const plan = await samplePlan();
    const desired = planToEvent(plan);
    const existing = { ...structuredClone(desired), etag: '"1"', htmlLink: 'x' };
    expect(diffEvent(existing, desired)).toBe('unchanged');
    // Done count changed: the description differs.
    expect(diffEvent({ ...existing, description: desired.description.replace('1/2', '0/2') }, desired)).toBe('updated');
    expect(diffEvent({ ...existing, transparency: undefined }, desired)).toBe('updated');
    // Edited in Google: the seal wins.
    expect(diffEvent({ ...existing, summary: 'renamed' }, desired)).toBe('restored');
    expect(diffEvent({ ...existing, end: { date: '2026-11-12' } }, desired)).toBe('restored');
    expect(diffEvent({ ...existing, start: { dateTime: '2026-11-03T09:00:00+08:00' } }, desired)).toBe('restored');
    // Deleted in Google: comes back through an update.
    expect(diffEvent({ ...existing, status: 'cancelled' }, desired)).toBe('restored');
  });

  test('stale events are deleted, foreign ones only counted', async () => {
    const keep = await samplePlan();
    const gone = await samplePlan({ title: 'broken seal' });
    const events = [
      { id: keep.hash, extendedProperties: { private: { plannerId: keep.id, plannerHash: keep.hash } } },
      { id: gone.hash, extendedProperties: { private: { plannerId: gone.id, plannerHash: gone.hash } } },
      { id: 'manual1' },
    ];
    const { stale, foreign } = staleEvents(events, [keep]);
    expect(stale.map((e) => e.id)).toEqual([gone.hash]);
    expect(foreign.map((e) => e.id)).toEqual(['manual1']);
  });
});

describe('OAuth helpers', () => {
  test('PKCE S256: challenge = base64url(sha256(verifier))', async () => {
    const { verifier, challenge, method } = await createPkce();
    expect(method).toBe('S256');
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    expect(challenge).toBe(base64url(digest));
    expect((await createPkce()).verifier).not.toBe(verifier);
  });

  test('auth URL carries PKCE, offline access and the scope constant', () => {
    const url = new URL(buildAuthUrl({ clientId: 'cid.apps.googleusercontent.com', redirectUri: 'http://localhost:5184/api/google/callback', state: 'st', challenge: 'ch' }));
    expect(`${url.origin}${url.pathname}`).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'cid.apps.googleusercontent.com',
      redirect_uri: 'http://localhost:5184/api/google/callback',
      response_type: 'code',
      scope: SCOPES.join(' '),
      state: 'st',
      code_challenge: 'ch',
      code_challenge_method: 'S256',
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
    });
  });

  test('scopes are least privilege', () => {
    expect(SCOPES).toEqual([
      'https://www.googleapis.com/auth/calendar.app.created',
      'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
      'https://www.googleapis.com/auth/calendar.events.readonly',
    ]);
    expect(missingScopes(SCOPES.join(' '))).toEqual([]);
    expect(missingScopes(`${SCOPES[0]} openid`)).toEqual(SCOPES.slice(1));
  });

  test('loopback Host values only', () => {
    for (const ok of ['localhost', 'localhost:5173', '127.0.0.1:5184', '[::1]:5173', 'LOCALHOST:80']) expect(isLoopbackHost(ok)).toBe(true);
    for (const bad of ['evil.com', 'localhost.evil.com', '127.0.0.2', '[::2]:5173', 'localhost:99999', 'localhost:5173/x', '', null, undefined]) {
      expect(isLoopbackHost(bad)).toBe(false);
    }
    expect(redirectUriFor('[::1]:5173', '/')).toBe('http://[::1]:5173/api/google/callback');
    expect(redirectUriFor('localhost:5184', '/repo/')).toBe('http://localhost:5184/repo/api/google/callback');
    expect(() => redirectUriFor('evil.com', '/')).toThrow();
  });

  test('redirect reasons are short codes', () => {
    expect(reasonCode('access_denied')).toBe('access_denied');
    expect(reasonCode('ya29.token-looking value')).toBe('unknown');
  });
});
