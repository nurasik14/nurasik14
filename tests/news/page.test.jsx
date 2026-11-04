// The locked -> unlocked flow with a real encrypted file. The repo has no DOM
// test setup, so this drives the real unlock function and renders each state's
// markup with react-dom/server, as tests/planner/google-overlay.test.jsx does.
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { encryptBacklog, encryptWeek, WrongPassphraseError } from '../../plugins/news-core.js';
import Player from '../../src/news/Player.jsx';
import { loadIndex, openWrapUp } from '../../src/news/store.js';
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
