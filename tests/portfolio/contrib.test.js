// Contribution-graph helpers, run against the real public/data/github.json.
import { describe, expect, test } from 'bun:test';
import {
  buildWeeks,
  fmtDay,
  gridLayout,
  isGithubData,
  languageSegments,
  levels,
  monthLabels,
  monthSummary,
  plural,
} from '../../src/lib/contrib.js';
import { loadGithub } from '../../src/lib/github.js';

const data = await Bun.file(new URL('../../public/data/github.json', import.meta.url)).json();

describe('github.json', () => {
  test('has the shape the page renders', () => {
    expect(isGithubData(data)).toBe(true);
    expect(data.days.reduce((s, d) => s + d[1], 0)).toBe(data.contributions_last_year);
  });
  test('rejects broken data instead of drawing it', () => {
    expect(isGithubData(null)).toBe(false);
    expect(isGithubData({ ...data, days: [] })).toBe(false);
    expect(isGithubData({ ...data, days: [['2026-1-1', 3]] })).toBe(false);
    expect(isGithubData({ ...data, contributions_last_year: undefined })).toBe(false);
  });
});

describe('buildWeeks', () => {
  const weeks = buildWeeks(data.days);
  test('Sunday-first columns, 53 for the year', () => {
    expect(weeks.length).toBe(53);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    const first = weeks[0].find(Boolean);
    expect(new Date(`${first.date}T00:00:00Z`).getUTCDay()).toBe(weeks[0].indexOf(first));
  });
  test('every day appears once, padding is null', () => {
    const cells = weeks.flat().filter(Boolean);
    expect(cells.length).toBe(data.days.length);
    expect(cells.reduce((s, c) => s + c.count, 0)).toBe(data.contributions_last_year);
    expect(weeks.at(-1).at(-1)).toBeNull(); // the year ends on a Tuesday
  });
  test('zero days are level 0, the busiest day is level 4', () => {
    const cells = weeks.flat().filter(Boolean);
    expect(cells.filter((c) => c.count === 0).every((c) => c.level === 0)).toBe(true);
    const max = Math.max(...cells.map((c) => c.count));
    expect(cells.find((c) => c.count === max).level).toBe(4);
  });
  test('handles a start in the middle of the week without shifting days', () => {
    const w = buildWeeks([['2026-11-04', 1], ['2026-11-05', 0]]); // Wed, Thu
    expect(w.length).toBe(1);
    expect(w[0][3]).toEqual({ date: '2026-11-04', count: 1, level: 4 });
    expect(w[0][0]).toBeNull();
  });
});

describe('levels', () => {
  test('quartiles of non-zero days', () => {
    const lv = levels([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map(lv)).toEqual([0, 1, 1, 1, 2, 2, 3, 3, 4]);
  });
  test('all zero stays zero', () => {
    expect(levels([0, 0])(0)).toBe(0);
  });
});

describe('monthLabels', () => {
  test('one label per month start, never crowded', () => {
    const labels = monthLabels(buildWeeks(data.days));
    expect(labels[0]).toEqual({ week: 0, label: 'Nov' });
    expect(labels.map((l) => l.label)).toContain('Jun');
    for (let i = 1; i < labels.length; i++) expect(labels[i].week - labels[i - 1].week).toBeGreaterThanOrEqual(3);
  });
});

describe('gridLayout', () => {
  test('the whole year fits every desktop column without overflow', () => {
    // graph box width at a 1440 / 1012 / 768 viewport
    for (const w of [770, 602, 430]) {
      const g = gridLayout(w, 53);
      if (w >= 560) expect(g.weeks).toBe(53);
      expect(30 + g.weeks * g.step).toBeLessThanOrEqual(w);
    }
  });
  test('a phone shows the last weeks that fit and nothing overflows', () => {
    for (const w of [254, 288, 342]) {
      const g = gridLayout(w, 53);
      expect(g.weeks).toBeLessThan(53);
      expect(30 + g.weeks * g.step).toBeLessThanOrEqual(w);
    }
    expect(gridLayout(254, 53).weeks).toBeGreaterThanOrEqual(15);
  });
  test('cells keep a gap', () => {
    for (const w of [300, 600, 700, 900, 2000]) {
      const g = gridLayout(w, 53);
      expect(g.step - g.cell).toBeGreaterThanOrEqual(2);
      expect(g.cell).toBeGreaterThanOrEqual(8);
    }
  });
});

describe('summaries', () => {
  test('per-month totals add up to the year', () => {
    const months = monthSummary(data.days);
    expect(months.reduce((s, m) => s + m.total, 0)).toBe(data.contributions_last_year);
    expect(months[0].label).toBe('Nov 2025');
  });
  test('formatting', () => {
    expect(fmtDay('2025-11-09')).toBe('Sun, Nov 9 2025');
    expect(plural(1, 'day')).toBe('1 day');
    expect(plural(1316, 'contribution')).toBe('1,316 contributions');
  });
  test('language segments drop junk and cap at 100', () => {
    expect(languageSegments(data.languages).map((l) => l.name)).toContain('Python');
    const segs = languageSegments([{ name: 'A', pct: 80 }, { name: 'B', pct: 40 }, { name: 'C', pct: 0 }, null]);
    expect(segs.map((s) => s.name)).toEqual(['A', 'B']);
    expect(segs.reduce((s, x) => s + x.width, 0)).toBeCloseTo(100);
  });
});

describe('loadGithub', () => {
  test('an HTTP error rejects (the page shows an error state), and a later call retries', async () => {
    const fail = async () => ({ ok: false, status: 404, json: async () => ({}) });
    await expect(loadGithub(fail)).rejects.toThrow('HTTP 404');
    const urls = [];
    const ok = async (url) => {
      urls.push(url);
      return { ok: true, status: 200, json: async () => data };
    };
    expect((await loadGithub(ok)).login).toBe('nurasik14');
    expect(urls[0].endsWith('data/github.json')).toBe(true);
    // cached: no second request
    await loadGithub(ok);
    expect(urls.length).toBe(1);
  });
});
