// The locked -> unlocked flow with a real encrypted file. The repo has no DOM
// test setup, so this drives the real unlock function and renders each state's
// markup with react-dom/server, as tests/planner/google-overlay.test.jsx does.
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { encryptBacklog, encryptBookmarks, encryptWeek, WrongPassphraseError } from '../../plugins/news-core.js';
import Player from '../../src/news/Player.jsx';
import { keyAction, loadIndex, openWrapUp } from '../../src/news/store.js';
import { RebuildButton } from '../../src/news/SyncPanel.jsx';
import Unlock from '../../src/news/Unlock.jsx';

const PASSPHRASE = 'correct horse battery';
const WEEK = '2026-10-30';

const payload = (week, stories) => ({ version: 1, week, generatedAt: '2026-11-06T00:00:00.000Z', stories });
const weekStories = [
  { id: 'aaa111', headline: 'Rates held steady', script: 'The U.S. central bank held rates at 3.5 percent. Markets barely moved.', newsletter: 'Morning Brew', receivedAt: '2026-10-31T09:05:00+08:00' },
  { id: 'bbb222', headline: 'Chips rally', script: 'Chip stocks rose. Nobody knows why.', newsletter: 'Stratechery', receivedAt: '2026-11-01T18:30:00+08:00' },
];

const files = {
  'index.json': { version: 1, backlog: { until: WEEK }, weeks: [WEEK] },
  [`${WEEK}.json`]: await encryptWeek({ weekId: WEEK, payload: payload(WEEK, weekStories), passphrase: PASSPHRASE, iterations: 1000 }),
  'backlog.json': await encryptBacklog({ until: WEEK, payload: payload('backlog', []), passphrase: PASSPHRASE, iterations: 1000 }),
};
const fetchFake = async (url) => {
  const body = files[url.split('/').at(-1)];
  return { status: body ? 200 : 404, ok: Boolean(body), json: async () => body };
};

const fakeSynth = (voices) => ({ speaking: false, pending: false, paused: false, getVoices: () => voices });

describe('locked', () => {
  test('the form: password field, one amber action, remember ticked, a privacy hint', () => {
    const html = renderToStaticMarkup(<Unlock onSubmit={() => {}} />);
    expect(html).toContain('type="password"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toMatch(/type="checkbox"[^>]*checked=""/);
    expect(html).toContain('remember on this device');
    expect(html).toContain('never leaves this browser');
    expect(html.match(/btn-primary/g)).toHaveLength(1);
    expect(html).toMatch(/>unlock</);
  });

  test('while decrypting the button says so and cannot be pressed', () => {
    const html = renderToStaticMarkup(<Unlock busy onSubmit={() => {}} />);
    expect(html).toContain('deriving key…');
    expect(html).toMatch(/<button[^>]*disabled=""/);
    expect(html).not.toMatch(/>unlock</);
  });

  test('a wrong passphrase is an inline alert tied to the field', () => {
    const html = renderToStaticMarkup(<Unlock error={{ text: 'wrong passphrase' }} onSubmit={() => {}} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('wrong passphrase');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="unlock-error"');
  });

  test('a forgotten passphrase leaves a note', () => {
    expect(renderToStaticMarkup(<Unlock note="The remembered passphrase no longer works." onSubmit={() => {}} />)).toContain('no longer works');
  });
});

describe('locked -> unlocked', () => {
  const unlock = async (passphrase) => {
    const entries = await loadIndex({ fetch: fetchFake });
    return { entries, first: await openWrapUp(entries[0].id, passphrase, { fetch: fetchFake }) };
  };

  test('a wrong passphrase stays locked', async () => {
    await expect(unlock('not the passphrase')).rejects.toBeInstanceOf(WrongPassphraseError);
  });

  test('the right one opens the player on the first clip with the ledger beside it', async () => {
    const { entries, first } = await unlock(PASSPHRASE);
    const html = renderToStaticMarkup(<Player entries={entries} first={first} passphrase={PASSPHRASE} onLock={() => {}} synth={fakeSynth([{ name: 'Samantha', lang: 'en-US' }])} />);
    expect(html).toContain('Rates held steady');
    expect(html).toContain('The U.S. central bank held rates at 3.5 percent. ');
    expect(html).toContain('Morning Brew');
    expect(html).toContain('31 Oct 2026, 09:05 HKT');
    expect(html).toMatch(/clip 1 \/ 2/);
    expect(html).toContain('week of 2026-10-30');
    expect(html).toContain('0/2 heard');
    expect(html).toContain('first wrap-up · everything before 2026-10-30');
    expect(html).toContain('queued');
    expect(html).toMatch(/<button[^>]*btn-primary[^>]*>/);
    expect(html).toContain('Samantha (en-US)');
    expect(html).not.toContain('speech is not available');
    expect(html).toMatch(/>lock</);
  });

  test('without speech the text is all there and play says why it is off', async () => {
    const { entries, first } = await unlock(PASSPHRASE);
    const html = renderToStaticMarkup(<Player entries={entries} first={first} passphrase={PASSPHRASE} onLock={() => {}} synth={null} />);
    expect(html).toContain('Rates held steady');
    expect(html).toContain('speech is not available in this browser');
    expect(html).toMatch(/<button[^>]*btn-primary[^>]*disabled=""/);
    expect(html).toContain('aria-describedby="news-speech-reason"');
  });

  test('the decrypted text is not written anywhere by rendering', async () => {
    const { entries, first } = await unlock(PASSPHRASE);
    const writes = [];
    const realStorage = globalThis.localStorage;
    globalThis.localStorage = { getItem: () => null, setItem: (k, v) => writes.push([k, v]), removeItem: () => {} };
    try {
      renderToStaticMarkup(<Player entries={entries} first={first} passphrase={PASSPHRASE} onLock={() => {}} synth={null} />);
    } finally {
      globalThis.localStorage = realStorage;
    }
    expect(writes).toEqual([]);
  });
});

describe('links and bookmarks on the card', () => {
  const GMAIL = 'https://mail.google.com/mail/u/digest@example.com/#all/18f2a3b4c5d6e7f8';
  const ARTICLE = 'https://example.com/story?a=1';
  const linked = [
    { id: 'aaa111', headline: 'Rates held steady', script: 'Rates held.', newsletter: 'Brew', receivedAt: '2026-10-31T09:05:00+08:00', links: { email: GMAIL, article: ARTICLE } },
    { id: 'bbb222', headline: 'Chips rally', script: 'Chips rose.', newsletter: 'Brew', receivedAt: '2026-11-01T18:30:00+08:00', links: { email: GMAIL, article: null } },
  ];
  const savedClip = { id: 'ccc333', week: WEEK, headline: 'A saved story', script: 'Saved words.', newsletter: 'Saved Daily', receivedAt: '2026-10-20T09:05:00+08:00', links: { email: GMAIL, article: ARTICLE }, savedAt: '2026-11-05T00:00:00.000Z' };

  const fileFetch = (extra) => async (url) => {
    const body = { ...files, ...extra }[url.split('/').at(-1)];
    return { status: body ? 200 : 404, ok: Boolean(body), json: async () => body };
  };
  const weekFile = (stories) => encryptWeek({ weekId: WEEK, payload: payload(WEEK, stories), passphrase: PASSPHRASE, iterations: 1000 });
  const entries = [{ id: WEEK, kind: 'week', label: `week of ${WEEK}`, short: `week of ${WEEK}` }];
  const synth = fakeSynth([{ name: 'Samantha', lang: 'en-US' }]);

  async function render({ stories = linked, bookmarks = [], ...props } = {}) {
    const get = fileFetch({ [`${WEEK}.json`]: await weekFile(stories), 'bookmarks.json': await encryptBookmarks({ bookmarks, passphrase: PASSPHRASE, iterations: 1000 }) });
    const first = await openWrapUp(WEEK, PASSPHRASE, { fetch: get });
    const firstBookmarks = await openWrapUp('bookmarks', PASSPHRASE, { fetch: get });
    return renderToStaticMarkup(<Player entries={entries} first={first} firstBookmarks={firstBookmarks} passphrase={PASSPHRASE} onLock={() => {}} synth={synth} {...props} />);
  }

  /** Renders as if opened at this address. */
  async function at(href, run) {
    const real = globalThis.location;
    globalThis.location = { href };
    try {
      return await run();
    } finally {
      globalThis.location = real;
    }
  }

  test('links open elsewhere with noopener noreferrer, and only those that exist show', async () => {
    const html = await render();
    expect(html).toContain(`href="${GMAIL}"`);
    expect(html).toContain(`href="${ARTICLE.replace('&', '&amp;')}"`);
    expect(html.match(/target="_blank" rel="noopener noreferrer"/g)).toHaveLength(2);
    expect(html).toMatch(/>email <span[^>]*>↗</);
    expect(html).toMatch(/>article <span[^>]*>↗</);

    const onlyEmail = await render({ stories: [{ ...linked[1] }] });
    expect(onlyEmail).toMatch(/>email <span/);
    expect(onlyEmail).not.toMatch(/>article <span/);
  });

  test('links sit outside the swipe area', async () => {
    const html = await render();
    expect(html.indexOf('tabindex="0"')).toBeLessThan(html.indexOf('Rates held.'));
    // The scrolling clip closes right after the script, before the first link.
    const after = html.slice(html.indexOf('Rates held.'));
    expect(after.indexOf('</p></div></div>')).toBeGreaterThanOrEqual(0);
    expect(after.indexOf('</p></div></div>')).toBeLessThan(after.indexOf(`href="${GMAIL}"`));
  });

  test('a version 1 clip shows no links, and a hostile scheme is not a link', async () => {
    const html = await render({ stories: weekStories });
    expect(html).not.toContain('noopener');
    expect(html).not.toContain('↗');
    const hostile = await render({ stories: [{ ...linked[0], links: { email: 'javascript:alert(1)', article: 'data:text/html,x' } }] });
    expect(hostile).not.toContain('javascript:');
    expect(hostile).not.toContain('↗');
  });

  test('Pages: the star reads, and there is no toggle, no hint and no extra row', async () => {
    const plain = await render();
    expect(plain).not.toContain('aria-label="bookmarked"');
    const html = await render({ bookmarks: [{ ...savedClip, id: 'aaa111' }] });
    expect(html).toContain('aria-label="bookmarked"');
    expect(html).toContain('★');
    expect(html).not.toContain('aria-pressed');
    expect(html).not.toContain('☆');
    expect(html).not.toContain('aria-keyshortcuts="b"');
    expect(html).not.toMatch(/<kbd[^>]*>b</);
  });

  test('localhost: the toggle shows the state, with the key next to it', async () => {
    const off = await render({ local: true, createMedia: () => null });
    expect(off).toMatch(/aria-pressed="false"[^>]*>.*?☆/);
    expect(off).toContain('aria-keyshortcuts="b"');
    expect(off).toMatch(/<kbd[^>]*>b</);
    const on = await render({ local: true, createMedia: () => null, bookmarks: [{ ...savedClip, id: 'aaa111' }] });
    expect(on).toMatch(/aria-pressed="true"[^>]*>.*?★/);
    expect(on).toContain('aria-label="bookmarked"');
  });

  test('the bookmarks row is first in the ledger with its count, and hidden at 0', async () => {
    const none = await render();
    expect(none).not.toContain('★ bookmarks');
    const html = await render({ bookmarks: [savedClip] });
    expect(html).toContain('★ bookmarks');
    expect(html).toContain('0/1 heard');
    const ledger = html.slice(html.indexOf('id="wrapups"'));
    expect(ledger.indexOf('★ bookmarks')).toBeGreaterThan(0);
    expect(ledger.indexOf('★ bookmarks')).toBeLessThan(ledger.indexOf(`>week of ${WEEK}<`));
  });

  test('?w=bookmarks plays the bookmarked clips, with their links', async () => {
    const html = await at('https://x.test/news/?w=bookmarks', () => render({ bookmarks: [savedClip] }));
    expect(html).toContain('A saved story');
    expect(html).toContain('Saved words. ');
    expect(html).toContain('Saved Daily');
    expect(html).toMatch(/clip 1 \/ 1/);
    expect(html).toContain('aria-label="bookmarked"');
    expect(html).toContain('>bookmarks<');
    expect(html).toContain(`href="${GMAIL}"`);
    expect(html).toMatch(/aria-current="true"[^>]*>.*?★ bookmarks/);
  });

  test('?w=bookmarks with none says so', async () => {
    const html = await at('https://x.test/news/?w=bookmarks', () => render());
    expect(html).toContain('no bookmarks yet');
    expect(html).not.toContain('no email arrived');
  });

  test('a clip whose audio exists plays by story id from the bookmarks too', async () => {
    const createMedia = () => ({ paused: true, addEventListener: () => {} });
    const html = await at('https://x.test/news/?w=bookmarks', () => render({ bookmarks: [savedClip], local: true, audio: { ids: ['ccc333'], voice: 'en-US-AvaMultilingualNeural', total: 1, done: 1 }, createMedia }));
    expect(html).toContain('voice · Ava');
  });

  describe('keys', () => {
    const key = (k, extra = {}) => ({ key: k, target: { nodeType: 1, tagName: 'DIV', closest: () => null }, ...extra });

    test('b toggles a bookmark on localhost, and does nothing elsewhere', () => {
      expect(keyAction(key('b'), { canBookmark: true })).toBe('bookmark');
      expect(keyAction(key('b'), { canBookmark: false })).toBeNull();
      expect(keyAction(key('b'))).toBeNull();
    });

    test('not while typing, in the command line, with a modifier, or held down', () => {
      const options = { canBookmark: true };
      expect(keyAction(key('b', { target: { nodeType: 1, tagName: 'INPUT', type: 'text' } }), options)).toBeNull();
      expect(keyAction(key('b', { target: { nodeType: 1, tagName: 'TEXTAREA' } }), options)).toBeNull();
      expect(keyAction(key('b', { target: { nodeType: 1, tagName: 'DIV', closest: (s) => (s === '[data-cmdline]' ? {} : null) } }), options)).toBeNull();
      for (const mod of ['ctrlKey', 'metaKey', 'altKey']) expect(keyAction(key('b', { [mod]: true }), options)).toBeNull();
      expect(keyAction(key('b', { repeat: true }), options)).toBeNull();
      expect(keyAction(key('b', { defaultPrevented: true }), options)).toBeNull();
    });

    test('the other keys still map as before', () => {
      expect(keyAction(key(' '))).toBe('toggle');
      expect(keyAction(key(' ', { target: { nodeType: 1, tagName: 'A', closest: () => ({}) } }))).toBeNull();
      expect(keyAction(key('j'))).toBe('next');
      expect(keyAction(key('ArrowDown'))).toBe('next');
      expect(keyAction(key('ArrowRight'))).toBe('next');
      expect(keyAction(key('k'))).toBe('prev');
      expect(keyAction(key('ArrowUp'))).toBe('prev');
      expect(keyAction(key('ArrowLeft'))).toBe('prev');
      expect(keyAction(key('+'))).toBe('faster');
      expect(keyAction(key('='))).toBe('faster');
      expect(keyAction(key('-'))).toBe('slower');
      expect(keyAction(key('x'))).toBeNull();
      const scroller = { scrollHeight: 500, clientHeight: 100 };
      expect(keyAction({ key: 'ArrowDown', target: scroller }, { scroller })).toBeNull();
      expect(keyAction({ key: 'ArrowDown', target: { ...scroller, scrollHeight: 100 } }, { scroller: { scrollHeight: 100, clientHeight: 100 } })).toBe('next');
    });
  });

  describe('rebuild button', () => {
    test('says what it will do, and shows progress while it runs', () => {
      expect(renderToStaticMarkup(<RebuildButton onRebuild={() => {}} />)).toContain('>rebuild backlog<');
      expect(renderToStaticMarkup(<RebuildButton rebuild={{ done: 3, total: 34, running: false }} onRebuild={() => {}} />)).toContain('>continue rebuild<');
      const busy = renderToStaticMarkup(<RebuildButton rebuild={{ done: 12, total: 34, running: true }} busy onRebuild={() => {}} />);
      expect(busy).toContain('rebuilding 12/34');
      expect(busy).toContain('disabled');
      expect(busy).not.toContain('btn-primary');
    });
  });
});
