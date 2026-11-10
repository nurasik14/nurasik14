/* Pure helpers for the contribution graph (public/data/github.json).
 * Dates are "YYYY-MM-DD" strings and are handled in UTC, so the grid never
 * shifts by a day with the visitor's time zone. */

const DAY_MS = 86400000;
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Graph geometry: room for the "Wed" day labels on the left and month labels on top.
export const GRID = { labelW: 30, top: 18 };

/**
 * Cell pitch for a graph `width` px wide with `total` week columns: the whole
 * year when cells can be at least 8px (every desktop column), else only the
 * most recent weeks that fit at 10px (the page then says how many are shown).
 */
export function gridLayout(width, total) {
  const avail = Math.max(0, width - GRID.labelW);
  const fitAll = Math.floor(avail / total);
  if (fitAll >= 10) {
    const step = Math.min(fitAll, 15);
    return { step, cell: step - (step >= 13 ? 3 : 2), weeks: total };
  }
  return { step: 13, cell: 10, weeks: Math.max(1, Math.min(total, Math.floor(avail / 13))) };
}

const parse = (iso) => new Date(`${iso}T00:00:00Z`);

/** True when `d` has the fields the page renders; anything else is an error state. */
export function isGithubData(d) {
  return Boolean(
    d &&
      typeof d === 'object' &&
      Array.isArray(d.days) &&
      d.days.length > 0 &&
      d.days.every((x) => Array.isArray(x) && /^\d{4}-\d{2}-\d{2}$/.test(x[0]) && Number.isFinite(x[1])) &&
      Number.isFinite(d.contributions_last_year),
  );
}

/**
 * Columns of 7 cells (Sunday first), like GitHub. Cells before the first day
 * or after the last are null. Each cell: { date, count, level }.
 */
export function buildWeeks(days) {
  const sorted = [...days].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const levelOf = levels(sorted.map((d) => d[1]));
  const byDate = new Map(sorted.map(([date, count]) => [date, count]));
  const first = parse(sorted[0][0]);
  const last = parse(sorted.at(-1)[0]);
  const start = new Date(first.getTime() - first.getUTCDay() * DAY_MS);
  const weeks = [];
  for (let t = start.getTime(); t <= last.getTime(); t += 7 * DAY_MS) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(t + i * DAY_MS).toISOString().slice(0, 10);
      const count = byDate.get(date);
      week.push(count === undefined ? null : { date, count, level: levelOf(count) });
    }
    weeks.push(week);
  }
  return weeks;
}

/**
 * Level 0 for no contributions, then 1-4 by quartile of the non-zero days,
 * which is how GitHub shades its graph (so one huge day does not flatten
 * the rest).
 */
export function levels(counts) {
  const nz = counts.filter((c) => c > 0).sort((a, b) => a - b);
  if (!nz.length) return () => 0;
  const q = (p) => nz[Math.min(nz.length - 1, Math.floor(p * nz.length))];
  const [q1, q2, q3, max] = [q(0.25), q(0.5), q(0.75), nz.at(-1)];
  // The busiest day is always the brightest, even with few active days.
  return (c) => (c <= 0 ? 0 : c >= max ? 4 : c <= q1 ? 1 : c <= q2 ? 2 : c <= q3 ? 3 : 4);
}

/**
 * Month labels: [{ week, label }] at the first column holding the 1st of a
 * month (or the first column). A label too close to the previous one is
 * dropped, so short text never overlaps.
 */
export function monthLabels(weeks, minGap = 3) {
  const out = [];
  weeks.forEach((week, i) => {
    const cell = week.find((c) => c && (i === 0 || c.date.endsWith('-01')));
    if (!cell) return;
    const m = Number(cell.date.slice(5, 7)) - 1;
    const label = MONTHS[m];
    if (out.length && i - out.at(-1).week < minGap) {
      // The first column only gets a label if the next month does not crowd it.
      if (out.at(-1).week === 0) out.pop();
      else return;
    }
    out.push({ week: i, label });
  });
  return out;
}

/** Per-month totals for the screen-reader table: [{ key, label, total, active, best }]. */
export function monthSummary(days) {
  const map = new Map();
  for (const [date, count] of days) {
    const key = date.slice(0, 7);
    const m = map.get(key) ?? { key, label: `${MONTHS[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}`, total: 0, active: 0, best: null };
    m.total += count;
    if (count > 0) m.active += 1;
    if (count > 0 && (!m.best || count > m.best.count)) m.best = { date, count };
    map.set(key, m);
  }
  return [...map.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}

/** "Sun, Nov 9 2025" */
export function fmtDay(iso) {
  const d = parse(iso);
  return `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} ${d.getUTCFullYear()}`;
}

export const plural = (n, one, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** Language bar: drops non-positive entries and caps the total at 100. */
export function languageSegments(languages = []) {
  const xs = languages.filter((l) => l && l.name && Number.isFinite(l.pct) && l.pct > 0);
  const total = xs.reduce((s, l) => s + l.pct, 0);
  const scale = total > 100 ? 100 / total : 1;
  return xs.map((l) => ({ ...l, width: l.pct * scale }));
}
