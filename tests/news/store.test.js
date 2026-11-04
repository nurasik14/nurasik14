import { describe, expect, test } from 'bun:test';
import { BACKLOG_ID, encryptBacklog, encryptWeek, WrongPassphraseError } from '../../plugins/news-core.js';
import {
  chooseWrapUp,
  connectMessage,
  findClip,
  forgetPassphrase,
  formatReceived,
  heardCount,
  loadIndex,
  markHeard,
  newsUrl,
  nextUnheardWrapUp,
  openWrapUp,
  parseIndex,
  readNewsUrl,
  readProgress,
  readRemembered,
  readSettings,
  rememberPassphrase,
  resumeIndex,
  setLastClip,
  swipeAction,
  syncSummary,
  writeProgress,
  writeSettings,
} from '../../src/news/store.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

const respond = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => {
    if (typeof body === 'string') throw new SyntaxError('bad json');
    return body;
  },
});

const stories = (...ids) => ids.map((id) => ({ id }));
const ready = (...ids) => ({ status: 'ready', stories: stories(...ids) });

describe('index', () => {
  test('weeks newest first, backlog last', () => {
    const entries = parseIndex({ version: 1, backlog: { until: '2026-10-30' }, weeks: ['2026-10-30', '2026-11-06'] });
    expect(entries.map((e) => e.id)).toEqual(['2026-11-06', '2026-10-30', BACKLOG_ID]);
    expect(entries.at(-1).label).toBe('first wrap-up · everything before 2026-10-30');
    expect(entries[0].label).toBe('week of 2026-11-06');
  });

  test('no backlog and an empty index', () => {
    expect(parseIndex({ version: 1, weeks: ['2026-10-30'] }).map((e) => e.id)).toEqual(['2026-10-30']);
    expect(parseIndex({ version: 1, weeks: [] })).toEqual([]);
    expect(parseIndex({ version: 1, backlog: { until: '2026-10-30' }, weeks: [] }).map((e) => e.id)).toEqual([BACKLOG_ID]);
  });

  test('malformed indexes throw', () => {
    for (const bad of [null, {}, { version: 2, weeks: [] }, { version: 1, weeks: ['2026-10-31'] }, { version: 1, weeks: 'x' }, { version: 1, weeks: [], backlog: { until: 'soon' } }]) {
      expect(() => parseIndex(bad)).toThrow(/malformed/);
    }
  });

  test('loadIndex: 404 means empty, the rest are errors, and it never caches', async () => {
    let seen;
    const entries = await loadIndex({
      fetch: async (url, init) => {
        seen = { url, init };
        return respond(200, { version: 1, weeks: ['2026-10-30'] });
      },
    });
    expect(entries).toHaveLength(1);
    expect(seen.url).toEndWith('data/news/index.json');
    expect(seen.init.cache).toBe('no-store');
    expect(await loadIndex({ fetch: async () => respond(404) })).toEqual([]);
    await expect(loadIndex({ fetch: async () => respond(500) })).rejects.toThrow(/HTTP 500/);
    await expect(loadIndex({ fetch: async () => respond(200, '<html>') })).rejects.toThrow(/malformed/);
    await expect(
      loadIndex({
        fetch: async () => {
          throw new TypeError('offline');
        },
      }),
    ).rejects.toThrow(/could not reach/);
  });
});

describe('openWrapUp', () => {
  const passphrase = 'correct horse battery';
  const payload = {
    version: 1,
    week: '2026-10-30',
    generatedAt: '2026-11-06T00:00:00.000Z',
    stories: [{ id: 'abc123', headline: 'H', script: 'One. Two.', newsletter: 'bbc', receivedAt: '2026-10-31T09:00:00+08:00' }, { id: 7 }],
  };
  const served = (file) => async (url) => {
    served.url = url;
    return respond(200, file);
  };

  test('decrypts, drops malformed stories and splits sentences', async () => {
    const file = await encryptWeek({ weekId: '2026-10-30', payload, passphrase, iterations: 1000 });
    const w = await openWrapUp('2026-10-30', passphrase, { fetch: served(file) });
    expect(served.url).toEndWith('data/news/2026-10-30.json');
    expect(w.status).toBe('ready');
    expect(w.stories).toHaveLength(1);
    expect(w.stories[0].sentences).toEqual(['One.', 'Two.']);
  });

  test('backlog files open under their id', async () => {
    const file = await encryptBacklog({ until: '2026-10-30', payload: { ...payload, week: BACKLOG_ID }, passphrase, iterations: 1000 });
    expect((await openWrapUp(BACKLOG_ID, passphrase, { fetch: served(file) })).stories).toHaveLength(1);
  });

  test('wrong passphrase and a renamed file are WrongPassphraseError', async () => {
    const file = await encryptWeek({ weekId: '2026-10-30', payload, passphrase, iterations: 1000 });
    await expect(openWrapUp('2026-10-30', 'not the passphrase', { fetch: served(file) })).rejects.toBeInstanceOf(WrongPassphraseError);
    await expect(openWrapUp('2026-11-06', passphrase, { fetch: served(file) })).rejects.toBeInstanceOf(WrongPassphraseError);
  });

  test('network and format failures are not reported as a wrong passphrase', async () => {
    const opts = (r) => ({ fetch: async () => r });
    await expect(openWrapUp('2026-10-30', passphrase, opts(respond(404)))).rejects.toThrow(/HTTP 404/);
    await expect(openWrapUp('2026-10-30', passphrase, opts(respond(200, '<html>')))).rejects.toThrow(/malformed/);
    const notOurs = await openWrapUp('2026-10-30', passphrase, opts(respond(200, { version: 9 }))).catch((e) => e);
    expect(notOurs).not.toBeInstanceOf(WrongPassphraseError);
    expect(notOurs.message).toMatch(/not a news.fm week file/);
  });
});

describe('progress', () => {
  test('round trip through storage', () => {
    const storage = fakeStorage();
    let p = readProgress(storage);
    expect(p).toEqual({});
    p = markHeard(p, 'w', 'a');
    p = markHeard(p, 'w', 'b');
    p = setLastClip(p, 'w', 3);
    writeProgress(storage, p);
    expect(readProgress(storage)).toEqual({ w: { last: 3, heard: ['a', 'b'] } });
    expect(JSON.parse(storage.map.get('news.fm.progress'))).toEqual({ w: { last: 3, heard: ['a', 'b'] } });
  });

  test('no change returns the same object, so callers can skip the write', () => {
    const p = markHeard({}, 'w', 'a');
    expect(markHeard(p, 'w', 'a')).toBe(p);
    expect(setLastClip(p, 'w', 0)).toBe(p);
  });

  test('malformed storage reads as empty, junk fields are dropped', () => {
    expect(readProgress(fakeStorage({ 'news.fm.progress': '{oops' }))).toEqual({});
    expect(readProgress(fakeStorage({ 'news.fm.progress': '[1]' }))).toEqual({});
    expect(readProgress(fakeStorage({ 'news.fm.progress': '{"w":{"last":-2,"heard":["a",3]},"x":null}' }))).toEqual({ w: { last: 0, heard: ['a'] }, x: { last: 0, heard: [] } });
    expect(readProgress(null)).toEqual({});
  });

  test('a storage that throws costs nothing', () => {
    const broken = {
      getItem() {
        throw new Error('denied');
      },
      setItem() {
        throw new Error('denied');
      },
      removeItem() {
        throw new Error('denied');
      },
    };
    expect(readProgress(broken)).toEqual({});
    expect(readRemembered(broken)).toBeNull();
    writeProgress(broken, {});
    rememberPassphrase(broken, 'x');
    forgetPassphrase(broken);
  });

  test('heardCount ignores ids that are gone', () => {
    const p = { w: { last: 0, heard: ['a', 'gone'] } };
    expect(heardCount(stories('a', 'b'), p, 'w')).toBe(1);
    expect(heardCount(stories('a', 'b'), p, 'other')).toBe(0);
  });

  test('resumeIndex: the last clip, or the next unheard after it', () => {
    const s = stories('a', 'b', 'c');
    expect(resumeIndex(s, {}, 'w')).toBe(0);
    expect(resumeIndex(s, { w: { last: 1, heard: [] } }, 'w')).toBe(1);
    expect(resumeIndex(s, { w: { last: 1, heard: ['b'] } }, 'w')).toBe(2);
    expect(resumeIndex(s, { w: { last: 2, heard: ['c'] } }, 'w')).toBe(0);
    expect(resumeIndex(s, { w: { last: 9, heard: [] } }, 'w')).toBe(2);
    expect(resumeIndex(s, { w: { last: 1, heard: ['a', 'b', 'c'] } }, 'w')).toBe(1);
    expect(resumeIndex([], {}, 'w')).toBe(0);
  });
});

describe('choosing a wrap-up', () => {
  const entries = [{ id: 'new' }, { id: 'mid' }, { id: BACKLOG_ID }];

  test('the newest with unheard clips', () => {
    const lib = { new: ready('a'), mid: ready('b'), [BACKLOG_ID]: ready('c') };
    expect(chooseWrapUp(entries, lib, {})).toBe('new');
    expect(chooseWrapUp(entries, lib, { new: { last: 0, heard: ['a'] } })).toBe('mid');
    expect(chooseWrapUp(entries, lib, { new: { last: 0, heard: ['a'] }, mid: { last: 0, heard: ['b'] } })).toBe(BACKLOG_ID);
  });

  test('everything heard: the newest', () => {
    const lib = { new: ready('a'), mid: ready(), [BACKLOG_ID]: ready('c') };
    const p = { new: { last: 0, heard: ['a'] }, [BACKLOG_ID]: { last: 0, heard: ['c'] } };
    expect(chooseWrapUp(entries, lib, p)).toBe('new');
  });

  test('empty weeks are skipped', () => {
    const lib = { new: ready(), mid: ready('b') };
    expect(chooseWrapUp(entries, lib, {})).toBe('mid');
  });

  test('waits while a newer one is unread, and does not wait for older ones', () => {
    const p = { new: { last: 0, heard: ['a'] } };
    expect(chooseWrapUp(entries, { new: ready('a') }, p)).toBeNull();
    expect(chooseWrapUp(entries, { new: ready('a'), mid: { status: 'loading' } }, p)).toBeNull();
    expect(chooseWrapUp(entries, { new: ready('a') }, {})).toBe('new');
  });

  test('a failed wrap-up is skipped', () => {
    const lib = { new: { status: 'error' }, mid: ready('b'), [BACKLOG_ID]: ready('c') };
    expect(chooseWrapUp(entries, lib, {})).toBe('mid');
  });

  test('nextUnheardWrapUp goes on from the current one and wraps around', () => {
    const lib = { new: ready('a'), mid: ready('b'), [BACKLOG_ID]: ready('c') };
    expect(nextUnheardWrapUp(entries, lib, {}, 'new').id).toBe('mid');
    expect(nextUnheardWrapUp(entries, lib, {}, BACKLOG_ID).id).toBe('new');
    expect(nextUnheardWrapUp(entries, lib, { mid: { last: 0, heard: ['b'] } }, 'new').id).toBe(BACKLOG_ID);
    expect(nextUnheardWrapUp(entries, { new: ready('a') }, {}, 'new')).toBeNull();
  });

  test('findClip searches what is read', () => {
    const lib = { new: { status: 'loading' }, mid: ready('a', 'b') };
    expect(findClip(entries, lib, 'b')).toEqual({ id: 'mid', index: 1 });
    expect(findClip(entries, lib, 'zzz')).toBeNull();
  });
});

describe('this device', () => {
  test('passphrase is stored only when asked and removed by forget', () => {
    const storage = fakeStorage();
    expect(readRemembered(storage)).toBeNull();
    rememberPassphrase(storage, 'secret words');
    expect(readRemembered(storage)).toBe('secret words');
    expect(storage.map.has('news.fm.passphrase')).toBe(true);
    forgetPassphrase(storage);
    expect(readRemembered(storage)).toBeNull();
    expect(storage.map.has('news.fm.passphrase')).toBe(false);
  });

  test('settings default, round trip and clamp', () => {
    const storage = fakeStorage();
    expect(readSettings(storage)).toEqual({ voice: null, rate: 1.1, autoplay: true });
    writeSettings(storage, { voice: 'Samantha', rate: 1.4, autoplay: false });
    expect(readSettings(storage)).toEqual({ voice: 'Samantha', rate: 1.4, autoplay: false });
    expect(readSettings(fakeStorage({ 'news.fm.settings': '{"rate":40}' })).rate).toBe(1.6);
    expect(readSettings(fakeStorage({ 'news.fm.settings': 'nope' }))).toEqual({ voice: null, rate: 1.1, autoplay: true });
  });
});

describe('page helpers', () => {
  test('readNewsUrl parses ?w= and #clip-, and rejects the rest', () => {
    expect(readNewsUrl('https://x.test/news/?w=2026-10-30#clip-a1b2c3')).toEqual({ week: '2026-10-30', clipId: 'a1b2c3' });
    expect(readNewsUrl('https://x.test/news/?w=backlog')).toEqual({ week: 'backlog', clipId: null });
    expect(readNewsUrl('https://x.test/news/?w=2026-10-31#plan-1234')).toEqual({ week: null, clipId: null });
    expect(readNewsUrl(undefined)).toEqual({ week: null, clipId: null });
  });

  test('newsUrl keeps the rest of the URL', () => {
    expect(newsUrl('https://x.test/base/news/?a=1#old', 'backlog', 'abc1')).toBe('/base/news/?a=1&w=backlog#clip-abc1');
    expect(newsUrl('https://x.test/news/?w=backlog#clip-abc1', null, null)).toBe('/news/');
  });

  test('received times are shown in Hong Kong', () => {
    expect(formatReceived('2026-10-31T09:05:00+08:00')).toBe('31 Oct 2026, 09:05 HKT');
    expect(formatReceived('2026-10-31T01:05:00Z')).toBe('31 Oct 2026, 09:05 HKT');
    expect(formatReceived('nope')).toBe('');
  });

  describe('swipeAction', () => {
    const fits = { startTop: 0, clientHeight: 500, scrollHeight: 500, selecting: false, dx: 0 };

    test('past the threshold, up is next and down is prev', () => {
      expect(swipeAction({ ...fits, dy: -80 })).toBe('next');
      expect(swipeAction({ ...fits, dy: 80 })).toBe('prev');
      expect(swipeAction({ ...fits, dy: -40 })).toBeNull();
      expect(swipeAction({ ...fits, dy: 0 })).toBeNull();
    });

    test('selecting text or moving sideways is not a swipe', () => {
      expect(swipeAction({ ...fits, dy: -80, selecting: true })).toBeNull();
      expect(swipeAction({ ...fits, dy: -80, dx: 120 })).toBeNull();
    });

    test('overflowing text scrolls first, and turns the clip only from its edges', () => {
      const long = { ...fits, scrollHeight: 900 };
      expect(swipeAction({ ...long, dy: -80, startTop: 0 })).toBeNull();
      expect(swipeAction({ ...long, dy: -80, startTop: 400 })).toBe('next');
      expect(swipeAction({ ...long, dy: 80, startTop: 400 })).toBeNull();
      expect(swipeAction({ ...long, dy: 80, startTop: 0 })).toBe('prev');
    });
  });

  test('sync and connect texts', () => {
    expect(syncSummary({ published: ['backlog', '2026-10-30'], emails: 34, stories: 108 })).toBe('published backlog, 2026-10-30 · 34 emails · 108 stories');
    expect(syncSummary({ published: [], emails: 1, stories: 1 })).toBe('nothing new published · 1 email · 1 story');
    expect(connectMessage('connected')[1]).toBe('ok');
    expect(connectMessage('error', 'wrong_account')).toEqual(['google: that is not the news account · connect again and pick it', 'warn']);
    expect(connectMessage('error', 'network')[0]).toBe('google: connect failed (network)');
    expect(connectMessage('error', '<script>')[0]).toBe('google: connect failed (unknown)');
  });
});
