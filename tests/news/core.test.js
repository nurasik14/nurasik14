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
  encryptBookmarks,
  encryptWeek,
  gmailLink,
  gmailQuery,
  HEADLINE_MAX,
  inWindow,
  isWeekId,
  LINK_TAGS_MAX,
  MIN_PASSPHRASE,
  parseStories,
  pendingWeeks,
  SCRIPT_MAX,
  senderName,
  serializeIndex,
  STORIES_MAX,
  STORY_SCHEMA,
  subjectOf,
  TEXT_MAX,
  truncateText,
  unwrapLink,
  weekStartOf,
  weekWindow,
  WrongPassphraseError,
  zonedIso,
} from '../../plugins/news-core.js';

const hkt = (s) => Date.parse(`${s}+08:00`);
const b64 = (text) => Buffer.from(text, 'utf8').toString('base64url');
const part = (mimeType, text, extra = {}) => ({ mimeType, filename: '', body: { data: b64(text) }, ...extra });
const PASS = 'correct horse battery staple';
const textOf = (message) => emailToText(message).text;

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
    expect(textOf({ payload })).toBe('the plain');
  });

  test('converts html-only mail: drops head, script, style and comments, keeps blocks', () => {
    const html = `<html><head><title>Secret title</title><style>p{color:red}</style></head><body>
      <!-- hidden --><script>alert("x")</script><h1>Top&nbsp;story</h1><p>Rain &amp; wind &lt;today&gt; caf&#233; &#x1F600;</p>
      <div>One</div><div>Two<br>Three</div></body></html>`;
    const text = textOf({ payload: part('text/html', html) });
    expect(text).toBe('Top story\n\nRain & wind <today> café 😀\n\nOne\n\nTwo\nThree');
  });

  test('does not double-decode entities', () => {
    expect(textOf({ payload: part('text/html', '<p>&amp;lt;b&amp;gt;</p>') })).toBe('&lt;b&gt;');
  });

  test('an unterminated script hides the rest; a missing </head> does not', () => {
    expect(textOf({ payload: part('text/html', '<p>kept</p><script>evil') })).toBe('kept');
    expect(textOf({ payload: part('text/html', '<head><meta charset="utf-8"><body><p>kept</p>') })).toBe('kept');
  });

  test('finds text in nested multipart/alternative, ignoring attachments', () => {
    const payload = multipart('multipart/mixed', [
      multipart('multipart/related', [multipart('multipart/alternative', [part('TEXT/PLAIN', 'deep plain'), part('text/html', '<p>deep html</p>')])]),
      part('text/plain', 'attached notes', { filename: 'notes.txt' }),
      { mimeType: 'application/pdf', filename: 'a.pdf', body: { attachmentId: 'att1', size: 9 } },
    ]);
    expect(textOf({ payload })).toBe('deep plain');
  });

  test('falls back to html when the plain part is only a link', () => {
    const payload = multipart('multipart/alternative', [part('text/plain', 'https://news.example.com/view?id=1\n'), part('text/html', '<p>real story</p>')]);
    expect(textOf({ payload })).toBe('real story');
  });

  test('decodes base64url UTF-8: Cyrillic and emoji across a url-safe alphabet', () => {
    const text = 'Привет, мир 🚀 ???>>>~~~';
    expect(b64(text)).toMatch(/[-_]/);
    expect(textOf({ payload: part('text/plain', text) })).toBe(text);
  });

  test('turns URLs in every common shape into tags, html hrefs included', () => {
    const plain = 'See https://a.example/x?y=1 and <http://b.example/z> or www.c.example/d, [more](https://e.example) f.example/path end';
    const { text, links } = emailToText({ payload: part('text/plain', plain) });
    expect(text).toBe('See [L1] and [L2] or [L3], [more] [L4] [L5] end');
    expect(Object.values(links).map((l) => l.url)).toEqual(['https://a.example/x?y=1', 'http://b.example/z', 'https://www.c.example/d', 'https://e.example', 'https://f.example/path']);
    const html = textOf({ payload: part('text/html', '<a href="https://t.example/track">Read this</a> https&#58;//u.example/v') });
    expect(html).toBe('Read this [L1] [L2]');
  });

  test('keeps ordinary dots and slashes', () => {
    expect(textOf({ payload: part('text/plain', 'and/or 3.14 Amazon.com rose') })).toBe('and/or 3.14 Amazon.com rose');
  });

  test('caps the text without splitting an emoji', () => {
    const long = textOf({ payload: part('text/plain', 'a'.repeat(TEXT_MAX + 500)) });
    expect(long.length).toBe(TEXT_MAX);
    const edge = textOf({ payload: part('text/plain', `${'a'.repeat(TEXT_MAX - 1)}😀`) });
    expect(edge).toBe('a'.repeat(TEXT_MAX - 1));
  });

  test('stays fast on hostile markup', () => {
    const started = Date.now();
    textOf({ payload: part('text/html', '<script>'.repeat(50_000) + '<!--'.repeat(50_000) + '<a '.repeat(50_000)) });
    textOf({ payload: part('text/plain', 'a-a.'.repeat(100_000)) });
    expect(Date.now() - started).toBeLessThan(3000);
  });

  test('a message with no text is empty, not an error', () => {
    expect(emailToText({ payload: { mimeType: 'image/png', filename: '', body: { size: 0 } } })).toEqual({ text: '', links: {} });
    expect(textOf({})).toBe('');
  });
});

describe('link tags', () => {
  const html = (markup) => ({ payload: part('text/html', markup) });
  const plain = (text) => ({ payload: part('text/plain', text) });

  test('html keeps the anchor text next to its tag; plain text gets the tag alone', () => {
    const { text, links: table } = emailToText(html('<p><a href="https://a.example/story?x=1&amp;y=2">Read <b>the</b> story</a> now</p>'));
    expect(text).toBe('Read the story [L1] now');
    expect(table).toEqual({ L1: { url: 'https://a.example/story?x=1&y=2', anchor: 'Read the story' } });
    expect(emailToText(plain('Big news https://a.example/story.'))).toEqual({ text: 'Big news [L1].', links: { L1: { url: 'https://a.example/story', anchor: '' } } });
  });

  test('the same URL gets the same tag, also through a tracking redirect', () => {
    const { text, links: table } = emailToText(html('<a href="https://a.example/1?utm_source=x">One</a> <a href="https://t.example/CL0/https:%2F%2Fa.example%2F1/1/abc=">Again</a> <a href="https://a.example/2">Two</a>'));
    expect(text).toBe('One [L1] Again [L1] Two [L2]');
    expect(Object.keys(table)).toEqual(['L1', 'L2']);
    expect(table.L1.url).toBe('https://a.example/1');
  });

  test('a link that shows its own address collapses to one tag', () => {
    expect(textOf(html('Words <a href="https://a.example/1">https://a.example/1</a> end'))).toBe('Words [L1] end');
  });

  test('other schemes and footer links get no tag and the text stays', () => {
    const dropped = [
      ['mailto:editor@example.org', 'write to us'],
      ['tel:+85212345678', 'call us'],
      ['javascript:alert(1)', 'click'],
      ['data:text/html,hi', 'click'],
      ['/relative/path', 'click'],
      ['https://a.example/unsubscribe?id=9', 'click'],
      ['https://a.example/x', 'Unsubscribe'],
      ['https://a.example/x', 'opt out'],
      ['https://a.example/opt-out', 'click'],
      ['https://a.example/preferences', 'click'],
      ['https://a.example/x', 'Email preferences'],
      ['https://a.example/x', 'Manage your subscription'],
      ['https://a.example/manage_subscription', 'click'],
      ['https://a.example/x', 'Update profile'],
      ['https://a.example/x', 'View in browser'],
      ['https://a.example/view-online', 'click'],
      ['https://a.example/x', 'view online'],
      ['https://a.example/x', 'Web version'],
      ['https://t.example/CL0/https:%2F%2Fa.example%2Funsubscribe/1/abc=', 'click'],
    ];
    for (const [href, anchor] of dropped) {
      expect(emailToText(html(`Story <a href="${href}">${anchor}</a> end`))).toEqual({ text: `Story ${anchor} end`, links: {} });
    }
    expect(emailToText(plain('Bye mailto:a@b.example and https://a.example/unsubscribe/9 now'))).toEqual({ text: 'Bye and now', links: {} });
  });

  test('at most LINK_TAGS_MAX tags; later links are dropped, repeats still get theirs', () => {
    const anchors = Array.from({ length: LINK_TAGS_MAX + 20 }, (_, i) => `<a href="https://a.example/${i}">s${i}</a>`).join(' ');
    const { text, links: table } = emailToText(html(`${anchors} <a href="https://a.example/0">again</a>`));
    expect(Object.keys(table)).toHaveLength(LINK_TAGS_MAX);
    expect(text).toContain(`s${LINK_TAGS_MAX - 1} [L${LINK_TAGS_MAX}]`);
    expect(text).toContain(`s${LINK_TAGS_MAX} s${LINK_TAGS_MAX + 1}`);
    expect(text).toContain('again [L1]');
  });

  test('no raw URL is left in the text for Claude, in any shape', () => {
    const body = 'a https://b.example/x c http://d.example e www.f.example g h.example/i j <https://k.example/l> m [n](https://o.example/p) ftp://q.example/r mailto:s@t.example';
    const markup = `<a href="https://u.example/v">https://w.example/x</a> www.y.example/z https&#58;//aa.example/b <a href="ftp://cc.example/d">ftp</a>`;
    for (const message of [plain(body), html(markup)]) {
      const { text } = emailToText(message);
      expect(text).toContain('[L1]');
      expect(text).not.toMatch(/https?:|:\/\/|www\.|\.example|mailto|ftp:/);
    }
  });

  test('a body that is only links has no text, so it costs no Claude call', () => {
    expect(emailToText(plain('https://cdn.example.org/banner.png https://a.example/b'))).toEqual({ text: '', links: {} });
    expect(emailToText(html('<a href="https://a.example/b"><img src="https://a.example/i.png"></a>'))).toEqual({ text: '', links: {} });
  });

  test('a plain part that is only a link falls through to the html links', () => {
    const payload = { mimeType: 'multipart/alternative', filename: '', parts: [part('text/plain', 'https://a.example/web\n'), part('text/html', '<a href="https://a.example/real">Real</a> story')] };
    expect(emailToText({ payload })).toEqual({ text: 'Real [L1] story', links: { L1: { url: 'https://a.example/real', anchor: 'Real' } } });
  });

  test('the table holds only what survived the cap, and a cut tag leaves no half', () => {
    const filler = 'a'.repeat(TEXT_MAX - 2);
    const { text, links: table } = emailToText(plain(`${filler} https://a.example/1 tail https://a.example/2`));
    expect(text).toBe(filler);
    expect(table).toEqual({});
  });

  test('an anchor without its closing tag still counts, and stays linear', () => {
    expect(emailToText(html('Story <a href="https://a.example/1">open text')).text).toBe('Story [L1] open text');
    const started = Date.now();
    emailToText(html('<a href="https://a.example/1">'.repeat(60_000)));
    emailToText(html(`${'<a href="https://a.example/1">x'.repeat(30_000)}</a>`));
    emailToText(plain('https://a.example/x '.repeat(100_000)));
    expect(Date.now() - started).toBeLessThan(3000);
  });

  test('the subject carries no URL either', () => {
    expect(subjectOf({ payload: { headers: [{ name: 'Subject', value: 'Read https://a.example/x today' }] } })).toBe('Read today');
  });
});

describe('unwrapLink', () => {
  test('a tracking path segment holding the percent-encoded target', () => {
    expect(unwrapLink('https://tracking.tldrnewsletter.com/CL0/https:%2F%2Fexample.com%2Fa%3Fb=1/1/0100018f/abc=')).toBe('https://example.com/a?b=1');
    expect(unwrapLink('https://t.example/c/https%3A%2F%2Fexample.com%2Fa/9')).toBe('https://example.com/a');
    expect(unwrapLink('https://t.example/c/https%253A%252F%252Fexample.com%252Fa/9')).toBe('https://example.com/a');
  });

  test('query parameters that hold the target', () => {
    for (const name of ['url', 'u', 'target', 'redirect', 'redirect_url', 'dest', 'destination', 'link']) {
      expect(unwrapLink(`https://t.example/r?${name}=https%3A%2F%2Fexample.com%2Fa%3Fb%3D1&id=9`)).toBe('https://example.com/a?b=1');
    }
    expect(unwrapLink('https://www.google.com/url?q=https://example.com/a&sa=D')).toBe('https://example.com/a');
    expect(unwrapLink('https://google.co.uk/url?q=https%3A%2F%2Fexample.com%2Fa')).toBe('https://example.com/a');
  });

  test('q only counts on a Google redirect: elsewhere it is a search', () => {
    expect(unwrapLink('https://search.example/find?q=https://example.com/a')).toBe('https://search.example/find?q=https://example.com/a');
    expect(unwrapLink('https://www.google.com/search?q=https://example.com/a')).toBe('https://www.google.com/search?q=https://example.com/a');
  });

  test('nested redirects unwrap up to three levels', () => {
    const one = 'https://a.example/r?url=https://example.com/final';
    const two = `https://b.example/r?u=${encodeURIComponent(one)}`;
    const three = `https://c.example/CL0/${encodeURIComponent(two)}/1`;
    expect(unwrapLink(three)).toBe('https://example.com/final');
    const four = `https://d.example/r?target=${encodeURIComponent(three)}`;
    expect(unwrapLink(four)).toBe(one);
  });

  test('a target that is not http(s) keeps the original', () => {
    for (const link of ['https://t.example/r?url=javascript:alert(1)', 'https://t.example/r?u=ftp://example.com/a', 'https://t.example/r?url=not-a-url', 'https://t.example/c/ftp:%2F%2Fexample.com/1']) {
      expect(unwrapLink(link)).toBe(link);
    }
  });

  test('tracking parameters leave the final URL; the rest stays', () => {
    expect(unwrapLink('https://example.com/a?utm_source=x&b=1&UTM_Medium=y&mc_cid=1&mc_eid=2&ref_src=z')).toBe('https://example.com/a?b=1');
    expect(unwrapLink('https://t.example/r?url=https%3A%2F%2Fexample.com%2Fa%3Futm_campaign%3Dq')).toBe('https://example.com/a');
    expect(unwrapLink('https://example.com/a?utm_source=x#part')).toBe('https://example.com/a#part');
  });

  test('a plain URL is unchanged to the byte, and junk is returned as it came', () => {
    for (const link of ['https://example.com', 'http://example.com/a/b?c=d&e=f#g', 'mailto:a@b.example', 'not a url', '']) {
      expect(unwrapLink(link)).toBe(link);
    }
  });
});

test('the schema requires link, so it stays strict', () => {
  const item = STORY_SCHEMA.properties.stories.items;
  expect(item.required).toEqual(['headline', 'script', 'link']);
  expect(item.properties.link).toEqual({ type: 'string' });
  expect(item.additionalProperties).toBe(false);
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
    expect(parseStories({ stories: [{ headline: '  Hi ', script: ' There.\n Now. ' }] })).toEqual([{ headline: 'Hi', script: 'There. Now.', link: null }]);
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
    expect(stories).toEqual([{ headline: 'ok', script: 'ok', link: null }]);
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

  describe('link tags', () => {
    const table = { L1: { url: 'https://a.example/1', anchor: 'one' }, L12: { url: 'https://a.example/12', anchor: '' } };
    const linkOf = (link) => parseStories({ stories: [{ headline: 'h', script: 's', link }] }, table)[0].link;

    test('a tag in this email resolves to its URL', () => {
      expect(linkOf('L1')).toBe('https://a.example/1');
      expect(linkOf('L12')).toBe('https://a.example/12');
      expect(linkOf('[L1]')).toBe('https://a.example/1');
    });

    test('an empty string, an unknown tag or anything else is null', () => {
      for (const bad of ['', 'L2', 'L', 'l1', 'L1 L12', 'https://evil.example/x', '__proto__', 'constructor', 7, null, undefined]) expect(linkOf(bad)).toBeNull();
    });

    test('without a table no tag exists', () => {
      expect(parseStories({ stories: [{ headline: 'h', script: 's', link: 'L1' }] })[0].link).toBeNull();
    });

    test('tags never reach the text that is spoken', () => {
      const [story] = parseStories({ stories: [{ headline: 'Big [L1] news', script: 'First [L12]. Then [ l3 ] more.', link: 'L1' }] }, table);
      expect(story).toEqual({ headline: 'Big news', script: 'First. Then more.', link: 'https://a.example/1' });
    });
  });
});

describe('crypto', () => {
  const WEEK = '2026-10-30';
  const payload = { version: 1, week: WEEK, generatedAt: '2026-11-06T00:00:00.000Z', stories: [{ id: 'a', headline: 'Секретный заголовок 🚀', script: 'x', newsletter: 'n', receivedAt: 'r' }] };
  const seal = (extra = {}) => encryptWeek({ weekId: WEEK, payload, passphrase: PASS, iterations: 1000, ...extra });

  test('round trip with the documented file shape', async () => {
    const file = await seal();
    expect(file).toMatchObject({
      version: 2,
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

  test('a version 1 file still decrypts, and a future version is refused', async () => {
    const file = await seal();
    expect(await decryptWeek({ ...file, version: 1 }, PASS)).toEqual(payload);
    await expect(decryptWeek({ ...file, version: 3 }, PASS)).rejects.toThrow('not a news.fm week file');
  });

  test('the bookmarks file is bound to its id: a week file renamed to it, or the reverse, does not open', async () => {
    const bookmarks = [{ id: 'a', headline: 'Секретный заголовок' }];
    const file = await encryptBookmarks({ bookmarks, passphrase: PASS, iterations: 1000 });
    expect(file).toMatchObject({ version: 2, week: 'bookmarks', start: null, end: null });
    expect(JSON.stringify(file)).not.toContain('Секретный');
    expect(await decryptWeek(file, PASS, { week: 'bookmarks' })).toEqual({ version: 1, bookmarks });
    await expect(decryptWeek(file, PASS, { week: WEEK })).rejects.toBeInstanceOf(WrongPassphraseError);
    await expect(decryptWeek(await seal(), PASS, { week: 'bookmarks' })).rejects.toBeInstanceOf(WrongPassphraseError);
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
    expect(Object.keys(payload.stories[0]).sort()).toEqual(['headline', 'id', 'links', 'newsletter', 'receivedAt', 'script']);
    expect(payload.stories[0].id).toMatch(/^[0-9a-f]{12}$/);
    expect(payload.stories[0].id).not.toBe(payload.stories[1].id);
    const expected = new Bun.CryptoHasher('sha256').update('early:0').digest('hex').slice(0, 12);
    expect(payload.stories[0].id).toBe(expected);
  });

  describe('links', () => {
    const MESSAGE = '18f2a3b4c5d6e7f8';
    const ACCOUNT = 'digest.account@example.com';
    const build = (email) => buildPayload({ weekId: '2026-10-30', generatedAt: 'g', account: ACCOUNT, emails: [{ messageId: MESSAGE, internalDate: String(hkt('2026-10-31T09:00:00')), newsletter: 'A', stories: [{ headline: 'h', script: 's', link: 'https://a.example/1' }], ...email }] });

    test('every story gets the email and its article', async () => {
      const { stories, version } = await build();
      expect(version).toBe(2);
      expect(stories[0].links).toEqual({ email: `https://mail.google.com/mail/u/${ACCOUNT}/#all/${MESSAGE}`, article: 'https://a.example/1' });
    });

    test('a bad message id, or none of the account, leaves the email link null', async () => {
      expect((await build({ messageId: 'not-hex-id' })).stories[0].links.email).toBeNull();
      expect((await build({ messageId: 'abc' })).stories[0].links.email).toBeNull();
      expect((await build({ messageId: 'a'.repeat(25) })).stories[0].links.email).toBeNull();
      expect(gmailLink(null, MESSAGE)).toBeNull();
      expect(gmailLink('no-at-sign', MESSAGE)).toBeNull();
      expect(gmailLink('a@b.example/../x', MESSAGE)).toBeNull();
    });

    test('a story without a usable article has null, also from a tampered cache', async () => {
      for (const link of [null, undefined, '', 'javascript:alert(1)', 'mailto:a@b.example']) {
        expect((await build({ stories: [{ headline: 'h', script: 's', link }] })).stories[0].links.article).toBeNull();
      }
    });

    test('the address and URLs appear only inside links', async () => {
      const { stories } = await build();
      expect(JSON.stringify({ ...stories[0], links: null })).not.toMatch(/@|http/);
      expect(stories[0].links.email).toContain('@');
    });
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
    expect(file).toMatchObject({ version: 2, week: 'backlog', start: null, end: '2026-10-30T00:00:00+08:00', until: '2026-10-30' });
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
