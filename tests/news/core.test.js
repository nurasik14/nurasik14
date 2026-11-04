import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';
import {
  BACKLOG_ID,
  backlogWindow,
  buildPayload,
  checkPassphrase,
  completeWeeksBetween,
  decryptWeek,
  emailToText,
  encryptBacklog,
  encryptWeek,
  gmailQuery,
  HEADLINE_MAX,
  inWindow,
  isWeekId,
  MIN_PASSPHRASE,
  parseStories,
  pendingWeeks,
  SCRIPT_MAX,
  senderName,
  serializeIndex,
  STORIES_MAX,
  subjectOf,
  TEXT_MAX,
  truncateText,
  weekStartOf,
  weekWindow,
  WrongPassphraseError,
  zonedIso,
} from '../../plugins/news-core.js';

const hkt = (s) => Date.parse(`${s}+08:00`);
const b64 = (text) => Buffer.from(text, 'utf8').toString('base64url');
const part = (mimeType, text, extra = {}) => ({ mimeType, filename: '', body: { data: b64(text) }, ...extra });
const PASS = 'correct horse battery staple';

describe('weeks', () => {
  test('Thursday 23:59:59.999 and Friday 00:00 HKT land in different weeks', () => {
    expect(weekStartOf(hkt('2026-11-05T23:59:59.999'))).toBe('2026-10-30');
    expect(weekStartOf(hkt('2026-11-06T00:00:00.000'))).toBe('2026-11-06');
  });

  test('Friday 00:00 exactly is the start of its own week, whatever the UTC date says', () => {
    // 16:00Z on Thursday is already Friday in Hong Kong.
    expect(weekStartOf(Date.parse('2026-11-05T16:00:00Z'))).toBe('2026-11-06');
    expect(weekStartOf(Date.parse('2026-11-05T15:59:59.999Z'))).toBe('2026-10-30');
  });

  test('weekStartOf takes a Date or ms and rejects garbage', () => {
    expect(weekStartOf(new Date(hkt('2026-11-04T12:00:00')))).toBe('2026-10-30');
    expect(() => weekStartOf('nope')).toThrow(RangeError);
  });

  test('weekWindow gives half-open bounds and +08:00 ISO strings', () => {
    expect(weekWindow('2026-10-30')).toEqual({
      id: '2026-10-30',
      startMs: Date.parse('2026-10-29T16:00:00Z'),
      endMs: Date.parse('2026-11-05T16:00:00Z'),
      startIso: '2026-10-30T00:00:00+08:00',
      endIso: '2026-11-06T00:00:00+08:00',
    });
  });

  test('weekWindow refuses anything but a real Friday', () => {
    for (const bad of ['2026-10-29', '2026-02-30', 'x', '', undefined]) expect(() => weekWindow(bad)).toThrow(RangeError);
    expect(isWeekId('2026-10-30')).toBe(true);
    expect(isWeekId('../../etc')).toBe(false);
  });

  test('offsets come from Intl, not a hard-coded +8', () => {
    // Hong Kong observed summer time (UTC+9) until 1979.
    expect(weekWindow('1975-07-04').startIso).toBe('1975-07-04T00:00:00+09:00');
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Hong_Kong', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    for (const id of ['1975-07-04', '2026-01-02', '2026-06-26', '2030-12-27']) {
      expect(fmt.format(weekWindow(id).startMs)).toBe('Fri 00:00');
      expect(fmt.format(weekWindow(id).endMs - 1)).toBe('Thu 23:59');
    }
  });

  test('zonedIso keeps seconds', () => {
    expect(zonedIso(Date.parse('2026-11-01T04:05:06.700Z'))).toBe('2026-11-01T12:05:06+08:00');
  });

  test('completeWeeksBetween includes a week the instant it ends', () => {
    expect(completeWeeksBetween('2026-10-23', hkt('2026-11-06T00:00:00'))).toEqual(['2026-10-23', '2026-10-30']);
    expect(completeWeeksBetween('2026-10-23', hkt('2026-11-05T23:59:59.999'))).toEqual(['2026-10-23']);
  });

  describe('pendingWeeks', () => {
    const nowMs = hkt('2026-11-04T12:00:00'); // inside the week of 2026-10-30

    test('first run takes only the last complete week', () => {
      expect(pendingWeeks({ published: [], nowMs })).toEqual(['2026-10-23']);
    });

    test('firstWeek is honoured on a first run', () => {
      expect(pendingWeeks({ published: [], nowMs, firstWeek: '2026-10-09' })).toEqual(['2026-10-09', '2026-10-16', '2026-10-23']);
    });

    test('firstWeek does not apply once something is published', () => {
      expect(pendingWeeks({ published: ['2026-10-16'], nowMs, firstWeek: '2026-01-02' })).toEqual(['2026-10-23']);
    });

    test('three missed weeks come back ascending, whatever order the index has', () => {
      const missed = pendingWeeks({ published: ['2026-09-25', '2026-10-02', '2026-09-18'], nowMs });
      expect(missed).toEqual(['2026-10-09', '2026-10-16', '2026-10-23']);
    });

    test('the current incomplete week is never included', () => {
      expect(pendingWeeks({ published: ['2026-10-23'], nowMs })).toEqual([]);
      const friday = pendingWeeks({ published: ['2026-10-23'], nowMs: hkt('2026-11-05T23:59:59.999') });
      expect(friday).toEqual([]);
      expect(pendingWeeks({ published: ['2026-10-23'], nowMs: hkt('2026-11-06T00:00:00') })).toEqual(['2026-10-30']);
    });
  });

  test('inWindow is half-open and takes Gmail string dates', () => {
    const w = weekWindow('2026-10-30');
    expect(inWindow(w.startMs, w)).toBe(true);
    expect(inWindow(String(w.startMs), w)).toBe(true);
    expect(inWindow(w.startMs - 1, w)).toBe(false);
    expect(inWindow(w.endMs - 1, w)).toBe(true);
    expect(inWindow(w.endMs, w)).toBe(false);
    expect(inWindow('garbage', w)).toBe(false);
    expect(inWindow(undefined, w)).toBe(false);
  });

  test('gmailQuery widens by a day in epoch seconds', () => {
    const w = weekWindow('2026-10-30');
    expect(gmailQuery(w)).toBe(`after:${w.startMs / 1000 - 86400} before:${w.endMs / 1000 + 86400} -in:sent -in:drafts -in:chats`);
    // `date -u -d '2026-10-28 16:00:00' +%s` and `date -u -d '2026-11-06 16:00:00' +%s`
    expect(gmailQuery(w)).toBe('after:1793203200 before:1793980800 -in:sent -in:drafts -in:chats');
  });
});

describe('emailToText', () => {
  const multipart = (mimeType, parts) => ({ mimeType, filename: '', body: { size: 0 }, parts });

  test('prefers text/plain over html', () => {
    const payload = multipart('multipart/alternative', [part('text/html', '<p>the html</p>'), part('text/plain', 'the plain')]);
    expect(emailToText({ payload })).toBe('the plain');
  });

  test('converts html-only mail: drops head, script, style and comments, keeps blocks', () => {
    const html = `<html><head><title>Secret title</title><style>p{color:red}</style></head><body>
      <!-- hidden --><script>alert("x")</script><h1>Top&nbsp;story</h1><p>Rain &amp; wind &lt;today&gt; caf&#233; &#x1F600;</p>
      <div>One</div><div>Two<br>Three</div></body></html>`;
    const text = emailToText({ payload: part('text/html', html) });
    expect(text).toBe('Top story\n\nRain & wind <today> café 😀\n\nOne\n\nTwo\nThree');
  });

  test('does not double-decode entities', () => {
    expect(emailToText({ payload: part('text/html', '<p>&amp;lt;b&amp;gt;</p>') })).toBe('&lt;b&gt;');
  });

  test('an unterminated script hides the rest; a missing </head> does not', () => {
    expect(emailToText({ payload: part('text/html', '<p>kept</p><script>evil') })).toBe('kept');
    expect(emailToText({ payload: part('text/html', '<head><meta charset="utf-8"><body><p>kept</p>') })).toBe('kept');
  });

  test('finds text in nested multipart/alternative, ignoring attachments', () => {
    const payload = multipart('multipart/mixed', [
      multipart('multipart/related', [multipart('multipart/alternative', [part('TEXT/PLAIN', 'deep plain'), part('text/html', '<p>deep html</p>')])]),
      part('text/plain', 'attached notes', { filename: 'notes.txt' }),
      { mimeType: 'application/pdf', filename: 'a.pdf', body: { attachmentId: 'att1', size: 9 } },
    ]);
    expect(emailToText({ payload })).toBe('deep plain');
  });

  test('falls back to html when the plain part is only a link', () => {
    const payload = multipart('multipart/alternative', [part('text/plain', 'https://news.example.com/view?id=1\n'), part('text/html', '<p>real story</p>')]);
    expect(emailToText({ payload })).toBe('real story');
  });

  test('decodes base64url UTF-8: Cyrillic and emoji across a url-safe alphabet', () => {
    const text = 'Привет, мир 🚀 ???>>>~~~';
    expect(b64(text)).toMatch(/[-_]/);
    expect(emailToText({ payload: part('text/plain', text) })).toBe(text);
  });

  test('removes URLs in every common shape, html hrefs included', () => {
    const plain = 'See https://a.example/x?y=1 and <http://b.example/z> or www.c.example/d, [more](https://e.example) f.example/path end';
    const text = emailToText({ payload: part('text/plain', plain) });
    expect(text).toBe('See and or [more] end');
    const html = emailToText({ payload: part('text/html', '<a href="https://t.example/track">Read this</a> https&#58;//u.example/v') });
    expect(html).toBe('Read this');
  });

  test('keeps ordinary dots and slashes', () => {
    expect(emailToText({ payload: part('text/plain', 'and/or 3.14 Amazon.com rose') })).toBe('and/or 3.14 Amazon.com rose');
  });

  test('caps the text without splitting an emoji', () => {
    const long = emailToText({ payload: part('text/plain', 'a'.repeat(TEXT_MAX + 500)) });
    expect(long.length).toBe(TEXT_MAX);
    const edge = emailToText({ payload: part('text/plain', `${'a'.repeat(TEXT_MAX - 1)}😀`) });
    expect(edge).toBe('a'.repeat(TEXT_MAX - 1));
  });

  test('stays fast on hostile markup', () => {
    const started = Date.now();
    emailToText({ payload: part('text/html', '<script>'.repeat(50_000) + '<!--'.repeat(50_000) + '<a '.repeat(50_000)) });
    emailToText({ payload: part('text/plain', 'a-a.'.repeat(100_000)) });
    expect(Date.now() - started).toBeLessThan(3000);
  });

  test('a message with no text is empty, not an error', () => {
    expect(emailToText({ payload: { mimeType: 'image/png', filename: '', body: { size: 0 } } })).toBe('');
    expect(emailToText({})).toBe('');
  });
});

describe('senderName', () => {
  test.each([
    ['BBC News <newsletters@bbc.com>', 'BBC News'],
    ['"The Economist" <noreply@economist.com>', 'The Economist'],
    ['"Doe, \\"JD\\" John" <jd@example.com>', 'Doe, "JD" John'],
    ["'Morning Brew' <crew@morningbrew.com>", 'Morning Brew'],
    ['=?UTF-8?B?0J3QvtCy0L7RgdGC0Lg=?= <news@example.ru>', 'Новости'],
    ['=?UTF-8?Q?Caf=C3=A9_Daily?= <news@example.com>', 'Café Daily'],
    ['newsletters@bbc.com', 'bbc'],
    ['<newsletters@bbc.com>', 'bbc'],
    ['news@mail.bbc.co.uk', 'bbc'],
    ['news@sub.mail.example.com', 'example'],
    ['"news@bbc.com" <news@bbc.com>', 'bbc'],
    ['=?UTF-8?Q?leak=40private.example?= <x@list.example.org>', 'example'],
    ['https://spam.example/x <x@example.net>', 'example'],
    ['"  " <x@example.net>', 'example'],
    ['legacy@example.org (Legacy Name)', 'example'],
    ['Just A Name', 'Just A Name'],
    ['', 'unknown'],
    [undefined, 'unknown'],
  ])('%s -> %s', (from, want) => {
    expect(senderName(from)).toBe(want);
  });

  test('never contains an address and is capped', () => {
    expect(senderName(`${'Long Name '.repeat(20)}<x@example.com>`).length).toBeLessThanOrEqual(60);
  });
});

test('subjectOf decodes, flattens and tolerates a missing header', () => {
  const msg = (value) => ({ payload: { headers: [{ name: 'SUBJECT', value }] } });
  expect(subjectOf(msg('=?UTF-8?B?0J3QvtCy0L7RgdGC0Lg=?= of\r\n the week'))).toBe('Новости of the week');
  expect(subjectOf({ payload: { headers: [] } })).toBe('');
  expect(subjectOf({})).toBe('');
});

describe('parseStories', () => {
  test('valid stories are trimmed', () => {
    expect(parseStories({ stories: [{ headline: '  Hi ', script: ' There.\n Now. ' }] })).toEqual([{ headline: 'Hi', script: 'There. Now.' }]);
  });

  test('zero stories is valid', () => {
    expect(parseStories({ stories: [] })).toEqual([]);
  });

  test('too-long text is cut at a sentence, else a word', () => {
    const sentence = 'Short one. ';
    const stories = parseStories({ stories: [{ headline: 'word '.repeat(60), script: sentence.repeat(200) }] });
    expect(stories[0].headline.length).toBeLessThanOrEqual(HEADLINE_MAX);
    expect(stories[0].headline.endsWith('word')).toBe(true);
    expect(stories[0].script.length).toBeLessThanOrEqual(SCRIPT_MAX);
    expect(stories[0].script.endsWith('Short one.')).toBe(true);
  });

  test('truncateText handles decimals, mid-word cuts and one long token', () => {
    expect(truncateText('Up by 3.14 percent', 8)).toBe('Up by');
    expect(truncateText('Hello there world', 13)).toBe('Hello there');
    expect(truncateText('Hello there world', 11)).toBe('Hello there');
    expect(truncateText('aaaaaaaaaa', 4)).toBe('aaaa');
    expect(truncateText('short', 10)).toBe('short');
  });

  test('empty items are dropped', () => {
    const stories = parseStories({ stories: [{ headline: ' ', script: 'x' }, { headline: 'x', script: '\n' }, { headline: 'ok', script: 'ok' }] });
    expect(stories).toEqual([{ headline: 'ok', script: 'ok' }]);
  });

  test('garbage is rejected', () => {
    for (const bad of [null, undefined, 'text', {}, { stories: 'x' }, { stories: [null] }, { stories: [{ headline: 'x' }] }, { stories: [{ headline: 1, script: 'x' }] }]) {
      expect(() => parseStories(bad)).toThrow();
    }
  });

  test('more than the maximum is capped', () => {
    const many = Array.from({ length: STORIES_MAX + 5 }, (_, i) => ({ headline: `h${i}`, script: `s${i}` }));
    expect(parseStories({ stories: many })).toHaveLength(STORIES_MAX);
  });

  test('a link or address the model repeated does not survive', () => {
    const [story] = parseStories({ stories: [{ headline: 'Mail boss@corp.example now', script: 'Go to https://evil.example/x or www.evil.example today. Ping a.b+c@d.example.org!' }] });
    expect(story.headline).toBe('Mail now');
    expect(JSON.stringify(story)).not.toMatch(/evil|@|https/);
  });
});

describe('crypto', () => {
  const WEEK = '2026-10-30';
  const payload = { version: 1, week: WEEK, generatedAt: '2026-11-06T00:00:00.000Z', stories: [{ id: 'a', headline: 'Секретный заголовок 🚀', script: 'x', newsletter: 'n', receivedAt: 'r' }] };
  const seal = (extra = {}) => encryptWeek({ weekId: WEEK, payload, passphrase: PASS, iterations: 1000, ...extra });

  test('round trip with the documented file shape', async () => {
    const file = await seal();
    expect(file).toMatchObject({
      version: 1,
      week: WEEK,
      start: '2026-10-30T00:00:00+08:00',
      end: '2026-11-06T00:00:00+08:00',
      kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 1000 },
      cipher: { name: 'AES-GCM' },
    });
    expect(Buffer.from(file.kdf.salt, 'base64')).toHaveLength(16);
    expect(Buffer.from(file.cipher.iv, 'base64')).toHaveLength(12);
    expect(await decryptWeek(file, PASS)).toEqual(payload);
  });

  test('the passphrase file trailing newline is not part of the key', async () => {
    expect(await decryptWeek(await seal({ passphrase: `${PASS}\n` }), PASS)).toEqual(payload);
    expect(await decryptWeek(await seal(), `${PASS}\r\n`)).toEqual(payload);
  });

  test('a wrong passphrase is a WrongPassphraseError', async () => {
    const file = await seal();
    await expect(decryptWeek(file, 'another long passphrase!')).rejects.toBeInstanceOf(WrongPassphraseError);
    await expect(decryptWeek(file, '')).rejects.toBeInstanceOf(WrongPassphraseError);
  });

  test('a file moved to another week fails, by field or by fetched name', async () => {
    const file = await seal();
    await expect(decryptWeek({ ...file, week: '2026-11-06' }, PASS)).rejects.toBeInstanceOf(WrongPassphraseError);
    await expect(decryptWeek(file, PASS, { week: '2026-11-06' })).rejects.toBeInstanceOf(WrongPassphraseError);
    expect(await decryptWeek(file, PASS, { week: WEEK })).toEqual(payload);
  });

  test('tampered ciphertext fails', async () => {
    const file = await seal();
    const bytes = Buffer.from(file.data, 'base64');
    bytes[0] ^= 1;
    await expect(decryptWeek({ ...file, data: bytes.toString('base64') }, PASS)).rejects.toBeInstanceOf(WrongPassphraseError);
  });

  test('the file holds no plaintext, in its text or its decoded data', async () => {
    const file = await seal();
    const raw = JSON.stringify(file);
    expect(raw).not.toContain('Секретный');
    expect(Buffer.from(file.data, 'base64').toString('utf8')).not.toContain('Секретный');
    expect(Buffer.from(file.data, 'base64').toString('latin1')).not.toContain('generatedAt');
  });

  test('salt and iv are fresh on every call', async () => {
    const [a, b] = [await seal(), await seal()];
    expect(a.kdf.salt).not.toBe(b.kdf.salt);
    expect(a.cipher.iv).not.toBe(b.cipher.iv);
    expect(a.data).not.toBe(b.data);
  });

  test('the default is 600000 iterations', async () => {
    const file = await encryptWeek({ weekId: WEEK, payload, passphrase: PASS });
    expect(file.kdf.iterations).toBe(600000);
    expect(await decryptWeek(file, PASS)).toEqual(payload);
  });

  test('encryption refuses a weak passphrase, decryption refuses a non-file', async () => {
    await expect(seal({ passphrase: 'short' })).rejects.toThrow('too-short');
    await expect(decryptWeek({ version: 1 }, PASS)).rejects.toThrow('not a news.fm week file');
    await expect(decryptWeek(null, PASS)).rejects.toThrow('not a news.fm week file');
  });

  test('checkPassphrase measures after the trailing newline', () => {
    const exact = 'x'.repeat(MIN_PASSPHRASE);
    expect(checkPassphrase(exact)).toBe('ok');
    expect(checkPassphrase(`${exact}\n`)).toBe('ok');
    expect(checkPassphrase(`${exact.slice(1)}\n`)).toBe('too-short');
    expect(checkPassphrase('')).toBe('missing');
    expect(checkPassphrase('\n')).toBe('missing');
    expect(checkPassphrase(undefined)).toBe('missing');
  });
});

describe('payload and files', () => {
  test('stories sort by receivedAt, then order in the email; ids hide the message id', async () => {
    const stories = (...names) => names.map((n) => ({ headline: n, script: `${n} script`, extra: 'dropped' }));
    const payload = await buildPayload({
      weekId: '2026-10-30',
      generatedAt: 'g',
      emails: [
        { messageId: 'later', internalDate: String(hkt('2026-10-31T09:00:00')), newsletter: 'B', stories: stories('b1') },
        { messageId: 'early', internalDate: String(hkt('2026-10-30T09:00:00')), newsletter: 'A', stories: stories('a1', 'a2') },
      ],
    });
    expect(payload.stories.map((s) => s.headline)).toEqual(['a1', 'a2', 'b1']);
    expect(payload.stories[0].receivedAt).toBe('2026-10-30T09:00:00+08:00');
    expect(Object.keys(payload.stories[0]).sort()).toEqual(['headline', 'id', 'newsletter', 'receivedAt', 'script']);
    expect(payload.stories[0].id).toMatch(/^[0-9a-f]{12}$/);
    expect(payload.stories[0].id).not.toBe(payload.stories[1].id);
    const expected = new Bun.CryptoHasher('sha256').update('early:0').digest('hex').slice(0, 12);
    expect(payload.stories[0].id).toBe(expected);
  });

  test('serializeIndex is newest first, deduped, 2-space with a trailing newline', () => {
    expect(serializeIndex(['2026-10-23', '2026-10-30', '2026-10-23'])).toBe('{\n  "version": 1,\n  "weeks": [\n    "2026-10-30",\n    "2026-10-23"\n  ]\n}\n');
  });
});

test('news-core and everything it imports stay free of node: imports', () => {
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = readFileSync(file, 'utf8');
    for (const [, spec] of text.matchAll(/^import [^;]*? from '([^']+)'/gm)) {
      expect(spec.startsWith('.')).toBe(true);
      walk(resolve(file, '..', spec));
    }
  };
  walk(resolve(import.meta.dirname, '../../plugins/news-core.js'));
  expect(seen.size).toBeGreaterThan(1);
});

describe('backlog', () => {
  test('backlogWindow has no start and ends where the first weekly week starts', () => {
    const w = backlogWindow('2026-10-30');
    expect(w).toMatchObject({ id: BACKLOG_ID, until: '2026-10-30', startIso: null, endIso: '2026-10-30T00:00:00+08:00' });
    expect(w.startMs).toBe(Number.NEGATIVE_INFINITY);
    expect(w.endMs).toBe(hkt('2026-10-30T00:00:00'));
    expect(inWindow(String(hkt('2001-01-01T00:00:00')), w)).toBe(true);
    expect(inWindow(String(hkt('2026-10-29T23:59:59.999')), w)).toBe(true);
    expect(inWindow(String(hkt('2026-10-30T00:00:00')), w)).toBe(false);
    expect(() => backlogWindow('2026-10-29')).toThrow('not a week id');
  });

  test('gmailQuery drops the after: term for a window without a start', () => {
    const end = hkt('2026-10-30T00:00:00') / 1000;
    expect(gmailQuery(backlogWindow('2026-10-30'))).toBe(`before:${end + 86400} -in:sent -in:drafts -in:chats`);
    expect(gmailQuery(weekWindow('2026-10-23'))).toMatch(/^after:\d+ before:\d+ /);
  });

  test('buildPayload newestFirst reverses emails but keeps stories in email order', async () => {
    const emails = [
      { messageId: 'a', internalDate: String(hkt('2026-10-01T09:00:00')), newsletter: 'A', stories: [{ headline: 'a1', script: 's' }, { headline: 'a2', script: 's' }] },
      { messageId: 'b', internalDate: String(hkt('2026-10-02T09:00:00')), newsletter: 'B', stories: [{ headline: 'b1', script: 's' }] },
    ];
    const p = await buildPayload({ weekId: BACKLOG_ID, generatedAt: 'x', emails, newestFirst: true });
    expect(p.week).toBe('backlog');
    expect(p.stories.map((s) => s.headline)).toEqual(['b1', 'a1', 'a2']);
  });

  test('encryptBacklog round-trips, names its cutoff, and cannot pass as a week', async () => {
    const payload = { version: 1, week: BACKLOG_ID, generatedAt: 'x', stories: [{ headline: 'Secret headline' }] };
    const file = await encryptBacklog({ until: '2026-10-30', payload, passphrase: PASS, iterations: 1000 });
    expect(file).toMatchObject({ version: 1, week: 'backlog', start: null, end: '2026-10-30T00:00:00+08:00', until: '2026-10-30' });
    expect(JSON.stringify(file)).not.toContain('Secret headline');
    expect(await decryptWeek(file, PASS)).toEqual(payload);
    await expect(decryptWeek({ ...file, week: '2026-10-23' }, PASS)).rejects.toBeInstanceOf(WrongPassphraseError);
    await expect(encryptBacklog({ until: '2026-10-30', payload, passphrase: 'short', iterations: 1000 })).rejects.toThrow('too-short');
  });

  test('serializeIndex lists the backlog before the weeks', () => {
    expect(serializeIndex(['2026-10-30'], { until: '2026-10-30' })).toBe('{\n  "version": 1,\n  "backlog": {\n    "until": "2026-10-30"\n  },\n  "weeks": [\n    "2026-10-30"\n  ]\n}\n');
    expect(serializeIndex([])).toBe('{\n  "version": 1,\n  "weeks": []\n}\n');
  });
});
