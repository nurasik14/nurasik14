/* ### activity: a GitHub-style contribution graph from public/data/github.json
 * (scripts/profile_stats.py writes it). 53 Sunday-first week columns in amber
 * shades, month and Mon/Wed/Fri labels, a less/more legend, streaks and a
 * language bar. On a narrow column the graph shows only the most recent weeks
 * that fit, and says so; nothing on the page scrolls sideways. The SVG is
 * decorative for screen readers, which get a summary and a per-month table. */
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PROFILE } from '../config/portfolio.config';
import { buildWeeks, fmtDay, GRID, gridLayout, languageSegments, monthLabels, monthSummary, plural } from '../lib/contrib';
import { GITHUB_FILE as FILE, useGithub } from '../lib/github';

const FILL = ['fill-heat-0', 'fill-heat-1', 'fill-heat-2', 'fill-heat-3', 'fill-heat-4'];
const BG = ['bg-heat-0', 'bg-heat-1', 'bg-heat-2', 'bg-heat-3', 'bg-heat-4'];
const DAY_LABELS = [[1, 'Mon'], [3, 'Wed'], [5, 'Fri']];
const { labelW: LABEL_W, top: TOP } = GRID;
const HEX = /^#[0-9a-f]{3,8}$/i;

function useBoxWidth(ref) {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setW(el.clientWidth);
    if (!('ResizeObserver' in window)) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

function Graph({ data }) {
  const boxRef = useRef(null);
  const width = useBoxWidth(boxRef);
  const all = useMemo(() => buildWeeks(data.days), [data.days]);
  const { step, cell, weeks: shown } = gridLayout(width || 720, all.length);
  const weeks = all.slice(all.length - shown);
  const months = monthLabels(weeks);
  const w = LABEL_W + weeks.length * step;
  const h = TOP + 7 * step;
  return (
    <div ref={boxRef} className="min-w-0">
      {width > 0 && (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="block max-w-full font-mono text-[10px]">
          {months.map((m) => (
            <text key={`${m.week}-${m.label}`} x={LABEL_W + m.week * step} y={11} className="fill-fg-faint">
              {m.label}
            </text>
          ))}
          {DAY_LABELS.map(([d, label]) => (
            <text key={label} x={0} y={TOP + d * step + cell - 1} className="fill-fg-faint">
              {label}
            </text>
          ))}
          {weeks.map((week, i) =>
            week.map(
              (c, d) =>
                c && (
                  <rect
                    key={c.date}
                    x={LABEL_W + i * step}
                    y={TOP + d * step}
                    width={cell}
                    height={cell}
                    rx={2}
                    className={FILL[c.level]}
                  >
                    <title>{`${c.count ? plural(c.count, 'contribution') : 'No contributions'} on ${fmtDay(c.date)}`}</title>
                  </rect>
                ),
            ),
          )}
        </svg>
      )}
      {width > 0 && shown < all.length && (
        <p className="mt-2 font-mono text-[12px] text-fg-faint">
          last {shown} weeks shown; the totals cover the whole year
        </p>
      )}
    </div>
  );
}

function SrSummary({ data }) {
  const busiest = data.days.reduce((best, d) => (d[1] > (best?.[1] ?? 0) ? d : best), null);
  const months = monthSummary(data.days);
  return (
    <div className="sr-only">
      <p>
        {plural(data.contributions_last_year, 'contribution')} from {fmtDay(data.days[0][0])} to {fmtDay(data.days.at(-1)[0])}.
        {busiest && ` Busiest day: ${plural(busiest[1], 'contribution')} on ${fmtDay(busiest[0])}.`}
      </p>
      <table>
        <caption>Contributions per month</caption>
        <thead>
          <tr>
            <th scope="col">month</th>
            <th scope="col">contributions</th>
            <th scope="col">active days</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.key}>
              <th scope="row">{m.label}</th>
              <td>{m.total}</td>
              <td>{m.active}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stats({ data }) {
  const rows = [
    data.streak && Number.isFinite(data.streak.current) && ['current streak', plural(data.streak.current, 'day')],
    data.streak && Number.isFinite(data.streak.longest) && ['longest streak', plural(data.streak.longest, 'day')],
    Number.isFinite(data.commits_last_year) && ['commits, last year', data.commits_last_year.toLocaleString('en-US')],
    Number.isFinite(data.pull_requests) && ['pull requests, all time', data.pull_requests.toLocaleString('en-US')],
  ].filter(Boolean);
  return (
    <dl className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[12px]">
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-1.5">
          <dt className="text-fg-faint">{k}</dt>
          <dd className="text-fg">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Legend() {
  return (
    <p className="flex items-center gap-1 font-mono text-[12px] text-fg-faint">
      <span className="mr-1">less</span>
      {BG.map((c, i) => (
        <span key={c} aria-hidden className={`inline-block size-2.5 rounded-[2px] ${c} ${i === 0 ? 'outline outline-1 -outline-offset-1 outline-line' : ''}`} />
      ))}
      <span className="ml-1">more</span>
      <span className="sr-only">: darker to brighter amber means more contributions that day</span>
    </p>
  );
}

function Languages({ languages }) {
  const segs = languageSegments(languages);
  if (!segs.length) return null;
  const color = (c) => (HEX.test(c ?? '') ? c : 'rgb(var(--fg-faint))');
  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h4 className="label">languages</h4>
        <p className="font-mono text-[12px] text-fg-faint">by bytes · public repos, no forks · html/css/notebooks left out</p>
      </div>
      <div aria-hidden className="mt-2 flex h-2 gap-[2px] overflow-hidden rounded-full">
        {segs.map((s) => (
          <span key={s.name} className="h-full" style={{ flex: `${s.width} 1 0`, backgroundColor: color(s.color) }} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[12px]">
        {segs.map((s) => (
          <li key={s.name} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="inline-block size-2.5 rounded-full" style={{ backgroundColor: color(s.color) }} />
            <span className="text-fg">{s.name}</span>
            <span className="text-fg-dim">{s.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Contributions() {
  const { status, data, error } = useGithub();
  const profile = `https://github.com/${PROFILE.github}`;
  return (
    <div id="activity" className="mt-12 scroll-mt-16">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[16px] font-medium text-fg">
          {status === 'ready' ? `${plural(data.contributions_last_year, 'contribution')} in the last year` : 'contributions'}
        </h3>
        {status === 'ready' && data.generated && (
          <p className="font-mono text-[12px] text-fg-faint">
            as of <time dateTime={data.generated}>{data.generated}</time>
          </p>
        )}
      </div>

      {status === 'loading' && (
        <p role="status" className="flex min-h-[8.5rem] items-center rounded border border-line px-4 font-mono text-[13px] text-fg-faint">
          loading {FILE} …
        </p>
      )}

      {status === 'error' && (
        <div role="status" className="rounded border border-dashed border-line-strong/60 px-4 py-3 text-[14px] leading-relaxed text-fg-dim">
          <p className="font-mono text-[13px] text-warn">
            could not load {FILE} ({error})
          </p>
          <p className="mt-1 max-w-[60ch]">
            No activity numbers are shown rather than made-up ones. The live graph is on{' '}
            <a href={profile} target="_blank" rel="noopener noreferrer" className="link font-mono text-[13px]">
              github.com/{PROFILE.github}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            .
          </p>
        </div>
      )}

      {status === 'ready' && (
        <>
          <figure className="m-0 rounded border border-line p-4">
            <Graph data={data} />
            <SrSummary data={data} />
            <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
              <Stats data={data} />
              <Legend />
            </figcaption>
          </figure>
          <Languages languages={data.languages} />
        </>
      )}
    </div>
  );
}
