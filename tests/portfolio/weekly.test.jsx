// ## 02 weekly: validators against the real public/data files, pure helpers,
// and the presentational components rendered on the server with fixtures
// (no DOM; effects do not run).
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import Weekly, { DigestBlock, DigestView, LastDays, LastDaysBlock, SOURCE_NOTE, WeeklyView } from '../../src/components/Weekly.jsx';
import {
  categorySlots,
  chartMaxHours,
  fmtRange,
  fmtStamp,
  hm,
  isDigest,
  isDigestIndex,
  isWakaData,
  loadDigest,
  loadJson,
  stackDays,
  topRows,
} from '../../src/lib/weekly.js';

// Rendering assertions use a frozen copy (tests/portfolio/fixtures/data, taken
// from public/data on 2026-11-11): the live files are rewritten daily by CI and
// weekly by the digest job. The live files are only checked by the validators.
const readFrom = (root) => (f) => JSON.parse(readFileSync(new URL(`${root}${f}`, import.meta.url), 'utf8'));
const read = readFrom('./fixtures/');
const live = readFrom('../../public/');
const waka = read('data/wakatime.json');
const index = read('data/weekly/index.json');
const digests = index.weeks.map((w) => read(w.file));

describe('live public/data files', () => {
  test('the deployed files pass the validators', () => {
    expect(isWakaData(live('data/wakatime.json'))).toBe(true);
    const idx = live('data/weekly/index.json');
    expect(isDigestIndex(idx)).toBe(true);
    for (const w of idx.weeks) expect(isDigest(live(w.file))).toBe(true);
  });
});
const clone = (x) => structuredClone(x);
const decode = (s) => s.replaceAll('&amp;', '&').replaceAll('&#x27;', "'").replaceAll('&quot;', '"');

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

// A week with four categories (three colour slots + other) and a quiet day.
const multiCats = [
  { name: 'Coding', seconds: 36000, percent: 50 },
  { name: 'AI Coding', seconds: 18000, percent: 25 },
  { name: 'Debugging', seconds: 10800, percent: 15 },
  { name: 'Writing Docs', seconds: 5400, percent: 7.5 },
  { name: 'Other', seconds: 1800, percent: 2.5 },
];
const multiDays = ['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10'].map((date, i) =>
  i === 4
    ? { date, seconds: 0, categories: {} }
    : { date, seconds: 12000, categories: { Coding: 6000, 'AI Coding': 3000, Debugging: 1800, 'Writing Docs': 900, Other: 300 } },
);
const multiWaka = {
  ...clone(waka),
  total_seconds: 72000,
  daily_average_seconds: 10286,
  active_days: 6,
  categories: multiCats,
  days: multiDays,
};
const emptyWaka = {
  ...clone(waka),
  total_seconds: 0,
  daily_average_seconds: 0,
  active_days: 0,
  categories: [],
  projects: [],
  languages: [],
  editors: [],
  days: multiDays.map((d) => ({ date: d.date, seconds: 0, categories: {} })),
};
const allErrors = {
  ...clone(digests[0]),
  week: '2026-W46',
  start: '2026-11-09',
  end: '2026-11-15',
  complete: false,
  highlights: [],
  wakatime: { error: 'WAKATIME_OAUTH_TOKEN not set' },
  git: { error: 'OSError: no repos' },
  lastfm: { error: 'RuntimeError: LASTFM_API_KEY / LASTFM_USERNAME not set' },
};
const { range: _r, source: _s, generated: _g, timezone: _t, ...emptyStats } = emptyWaka;
const emptyWeek = {
  ...clone(digests[0]),
  highlights: ['No editor time logged this week.', 'No commits this week.'],
  wakatime: emptyStats,
  git: { total: 0, repos: [], per_day: {} },
  lastfm: { user: 'x', scrobbles: 0, tracks: [] },
};
const multiWeek = { ...clone(digests[0]), wakatime: { ...emptyStats, ...multiWaka, range: undefined } };

const ready = (data) => ({ status: 'ready', data, error: null });

describe('validators', () => {
  test('accept the real files', () => {
    expect(isWakaData(waka)).toBe(true);
    expect(isDigestIndex(index)).toBe(true);
    expect(index.weeks.length).toBeGreaterThan(0);
    for (const d of digests) expect(isDigest(d)).toBe(true);
  });
  test('accept the fixtures (multi-category, all-error and empty weeks)', () => {
    expect(isWakaData(multiWaka)).toBe(true);
    expect(isWakaData(emptyWaka)).toBe(true);
    for (const d of [allErrors, emptyWeek, multiWeek]) expect(isDigest(d)).toBe(true);
  });
  test('reject malformed wakatime.json', () => {
    expect(isWakaData(null)).toBe(false);
    expect(isWakaData([])).toBe(false);
    expect(isWakaData({ ...waka, total_seconds: '20h' })).toBe(false);
    expect(isWakaData({ ...waka, days: [] })).toBe(false);
    expect(isWakaData({ ...waka, days: [{ date: '2026-1-1', seconds: 3, categories: {} }] })).toBe(false);
    expect(isWakaData({ ...waka, projects: [{ name: 'x', seconds: -1, percent: 1 }] })).toBe(false);
    expect(isWakaData({ ...waka, range: undefined })).toBe(false);
    expect(isWakaData({ error: 'boom' })).toBe(false);
  });
  test('reject a malformed index, including paths outside data/weekly', () => {
    expect(isDigestIndex(null)).toBe(false);
    expect(isDigestIndex({})).toBe(false);
    const row = index.weeks[0];
    expect(isDigestIndex({ weeks: [{ ...row, week: '2026-45' }] })).toBe(false);
    expect(isDigestIndex({ weeks: [{ ...row, complete: 'yes' }] })).toBe(false);
    expect(isDigestIndex({ weeks: [{ ...row, file: 'https://evil.example/x.json' }] })).toBe(false);
    expect(isDigestIndex({ weeks: [{ ...row, file: 'data/weekly/../github.json' }] })).toBe(false);
    expect(isDigestIndex({ weeks: [{ ...row, commits: '65' }] })).toBe(false);
    expect(isDigestIndex({ weeks: [] })).toBe(true); // no digests yet is valid, shown as an empty state
  });
  test('reject a malformed digest', () => {
    const d = digests[0];
    expect(isDigest(null)).toBe(false);
    expect(isDigest({ ...d, highlights: 'x' })).toBe(false);
    expect(isDigest({ ...d, wakatime: {} })).toBe(false);
    expect(isDigest({ ...d, git: { total: 3 } })).toBe(false);
    expect(isDigest({ ...d, lastfm: { scrobbles: 1, tracks: [{ name: 'a' }] } })).toBe(false);
    expect(isDigest({ ...d, lastfm: undefined })).toBe(false);
  });
});

describe('helpers', () => {
  test('hm matches the Python scripts', () => {
    expect(hm(0)).toBe('0m');
    expect(hm(29)).toBe('0m');
    expect(hm(59 * 60)).toBe('59m');
    expect(hm(3600)).toBe('1h 00m');
    expect(hm(3 * 3600 + 5 * 60)).toBe('3h 05m');
    expect(hm(68389)).toBe('19h 00m'); // the digest's highlight says the same
    expect(hm(72832)).toBe('20h 14m');
    expect(hm(undefined)).toBe('0m');
  });
  test('dates and stamps', () => {
    expect(fmtRange('2026-11-04', '2026-11-10')).toBe('Nov 4 – 10, 2026');
    expect(fmtRange('2026-10-27', '2026-11-02')).toBe('Oct 27 – Nov 2, 2026');
    expect(fmtRange('2025-12-29', '2026-01-04')).toBe('Dec 29, 2025 – Jan 4, 2026');
    expect(fmtStamp('2026-11-10T20:16:29+00:00', 'Asia/Hong_Kong')).toBe('Nov 11, 04:16 HKT');
    expect(fmtStamp('2026-11-10T20:16:29+00:00', 'Not/AZone')).toBe('Nov 10, 20:16 UTC');
    expect(fmtStamp('garbage')).toBe('garbage');
  });
  test('topRows keeps 8 and folds the rest into the data\'s Other', () => {
    const rows = topRows(waka.projects, 8);
    expect(rows).toHaveLength(9);
    expect(rows.at(-1).name).toBe('Other');
    const folded = waka.projects.slice(8).reduce((s, r) => s + r.seconds, 0);
    expect(rows.at(-1).seconds).toBe(folded);
    expect(rows.reduce((s, r) => s + r.seconds, 0)).toBe(waka.projects.reduce((s, r) => s + r.seconds, 0));
    expect(topRows(waka.editors, 8)).toEqual(waka.editors);
  });
  test('categories get three colour slots, the rest is "other"', () => {
    expect(categorySlots(waka.categories)).toEqual([{ ...waka.categories[0], slot: 0 }]);
    const slots = categorySlots(multiCats);
    expect(slots.map((s) => [s.name, s.slot])).toEqual([
      ['Coding', 0],
      ['AI Coding', 1],
      ['Debugging', 2],
      ['other', 3],
    ]);
    expect(slots[3].seconds).toBe(7200);
    const stacked = stackDays(multiDays, slots);
    expect(stacked[0].segments.map((s) => s.seconds)).toEqual([6000, 3000, 1800, 1200]);
    expect(stacked[4].segments).toEqual([]);
    expect(stackDays(waka.days, categorySlots(waka.categories))[1].segments).toEqual([
      { name: 'AI Coding', seconds: 25531, slot: 0 },
    ]);
    expect(chartMaxHours(waka.days)).toBe(8);
    expect(chartMaxHours([{ seconds: 0 }])).toBe(1);
  });
});

describe('loaders', () => {
  const fake = (body, ok = true) => () => Promise.resolve({ ok, status: ok ? 200 : 404, json: () => Promise.resolve(body) });
  test('a valid file resolves; a bad or missing one rejects and is retried later', async () => {
    expect(await loadJson('data/test-a.json', isWakaData, fake(waka))).toBe(waka);
    await expect(loadJson('data/test-b.json', isWakaData, fake({ nope: 1 }))).rejects.toThrow('unexpected format');
    await expect(loadJson('data/test-c.json', isWakaData, fake(null, false))).rejects.toThrow('HTTP 404');
    expect(await loadJson('data/test-c.json', isWakaData, fake(waka))).toBe(waka);
  });
  test('only data/weekly/<week>.json is ever fetched', async () => {
    await expect(loadDigest('../secrets.json', fake(digests[0]))).rejects.toThrow('bad digest path');
  });
});

describe('last 7 days', () => {
  test('real data: totals, chart, table, split, ranked lists', () => {
    const html = decode(renderToStaticMarkup(<LastDays data={waka} />));
    expect(html).toContain('last 7 days');
    expect(html).toContain('Nov 4 – 10, 2026');
    expect(html).toContain('updated <time dateTime="2026-11-10T20:26:42+00:00">Nov 11, 04:26 HKT</time>');
    expect(html).toContain('20h 14m');
    expect(html).toContain('2h 53m');
    expect(html).toContain('6/7');
    expect(html).toMatch(/<svg aria-hidden="true"/);
    expect(html).toContain('<table class="sr-only">');
    expect(html.match(/<th scope="row">/g)).toHaveLength(7);
    expect(html).toContain('AI Coding');
    expect(html).toContain('100%');
    expect(html).toContain('overworld-hyprland');
    expect(html).toContain('Markdown');
    expect(html).not.toContain('pygym'); // 9th project: folded into other
    expect(html).toContain('Claude Code');
    expect(html).not.toMatch(/heat-|signal/); // data colours stay off the amber ramp
  });
  test('several categories: stacked bars, a split bar and a legend with words', () => {
    const html = decode(renderToStaticMarkup(<LastDays data={multiWaka} />));
    for (const c of ['Coding', 'AI Coding', 'Debugging', 'other']) expect(html).toContain(c);
    expect(html).toContain('50%');
    expect(html).toContain('fill-ok');
    expect(html).toContain('fill-line-strong');
    expect(html).toMatch(/<th scope="col">Debugging<\/th>/);
    expect(html).toContain('Sun, Nov 8: no editor time');
  });
  test('an empty week says so and shows no numbers', () => {
    const html = renderToStaticMarkup(<LastDays data={emptyWaka} />);
    expect(html).toContain('no editor time in these 7 days');
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('daily average');
  });
  test('loading and error states', () => {
    expect(renderToStaticMarkup(<LastDaysBlock state={{ status: 'loading' }} />)).toContain('loading data/wakatime.json');
    const err = renderToStaticMarkup(<LastDaysBlock state={{ status: 'error', error: 'HTTP 404' }} />);
    expect(err).toContain('could not load data/wakatime.json (HTTP 404)');
    expect(err).not.toMatch(/\dh \d\dm/);
  });
});

describe('digest', () => {
  test('the real week: highlights, editor, git with disclosures, Last.fm links', () => {
    const d = digests[0];
    const html = decode(renderToStaticMarkup(<DigestView digest={d} />));
    for (const h of d.highlights) expect(html).toContain(h);
    expect(html).toContain('19h 00m');
    expect(html).toContain('65');
    expect(html.match(/<details/g)).toHaveLength(Math.min(8, d.git.repos.length));
    expect(html).toContain('and 3 more repos, 3 commits');
    expect(html).toContain('Feature: Stray Thoughts Widget');
    for (const t of d.lastfm.tracks) {
      expect(html).toContain(t.name);
      expect(html).toContain(`href="${t.url}" target="_blank" rel="noreferrer"`);
    }
    expect(html).toContain('500');
  });
  test('all three sources erroring: one honest empty state each, no numbers', () => {
    const html = decode(renderToStaticMarkup(<DigestView digest={allErrors} />));
    expect(html).toContain('WakaTime: no data for this week');
    expect(html).toContain('git: no data for this week');
    expect(html).toContain('Last.fm: no data for this week');
    expect(html).toContain('WAKATIME_OAUTH_TOKEN not set');
    expect(html).toContain('Nothing recorded this week.');
    expect(html).toContain('in progress');
    expect(html).not.toMatch(/\dh \d\dm|scrobbles|commits in/);
  });
  test('an empty week', () => {
    const html = renderToStaticMarkup(<DigestView digest={emptyWeek} />);
    expect(html).toContain('no editor time logged this week');
    expect(html).toContain('no commits this week');
    expect(html).toContain('no scrobbles this week');
  });
  test('a multi-category week shows its split', () => {
    const html = renderToStaticMarkup(<DigestView digest={multiWeek} />);
    expect(html).toContain('Debugging');
    expect(html).toContain('20h 00m');
  });
  test('week picker: newest selected, in-progress marked, per-file states', () => {
    const idx = { generated: 'x', weeks: [{ ...index.weeks[0], week: '2026-W46', file: 'data/weekly/2026-W46.json', complete: false }, ...index.weeks] };
    const html = renderToStaticMarkup(<DigestBlock index={ready(idx)} digest={{ status: 'loading' }} />);
    expect(html).toMatch(/aria-pressed="true"[^>]*>2026-W46<span[^>]*>in progress/);
    expect(html).toMatch(/aria-pressed="false"[^>]*>2026-W45</);
    expect(html).toContain('loading data/weekly/2026-W46.json');
    const picked = renderToStaticMarkup(<DigestBlock index={ready(idx)} selected="2026-W45" digest={{ status: 'error', error: 'HTTP 404' }} />);
    expect(picked).toMatch(/aria-pressed="true"[^>]*>2026-W45</);
    expect(picked).toContain('could not load data/weekly/2026-W45.json (HTTP 404)');
  });
  test('index states: loading, error, no weeks yet', () => {
    expect(renderToStaticMarkup(<DigestBlock index={{ status: 'loading' }} />)).toContain('loading data/weekly/index.json');
    expect(renderToStaticMarkup(<DigestBlock index={{ status: 'error', error: 'HTTP 404' }} />)).toContain(
      'could not load data/weekly/index.json (HTTP 404)',
    );
    expect(renderToStaticMarkup(<DigestBlock index={ready({ weeks: [] })} />)).toContain('no weekly digests yet');
  });
});

describe('section', () => {
  test('full view: heading 02, latest week aside, source note', () => {
    const html = decode(
      renderToStaticMarkup(<WeeklyView n="2" waka={ready(waka)} index={ready(index)} digest={ready(digests[0])} selected="2026-W45" />),
    );
    expect(html).toContain('id="weekly"');
    expect(html).toMatch(/text-signal">02<\/span> weekly/);
    expect(html).toContain(`latest digest ${index.weeks[0].week}`);
    expect(html).toContain(SOURCE_NOTE);
    expect(SOURCE_NOTE).toBe('WakaTime API (refreshed daily 04:00 HKT) · local git logs · Last.fm scrobbles (weekly digest, Sundays)');
    expect(html.match(/btn-primary/g)).toBeNull(); // no amber action here
  });
  test('the container starts in loading states, with no numbers', () => {
    const html = renderToStaticMarkup(<Weekly n="2" />);
    expect(html).toContain('loading data/wakatime.json');
    expect(html).toContain('loading data/weekly/index.json');
    expect(html).not.toMatch(/\dh \d\dm/);
  });
  test('no emoji in the static UI strings', () => {
    for (const f of ['src/components/Weekly.jsx', 'src/lib/weekly.js', 'src/App.jsx']) {
      const src = readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
      expect([f, [...src].filter((ch) => EMOJI.test(ch))]).toEqual([f, []]);
    }
  });
});
