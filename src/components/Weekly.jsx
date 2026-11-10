/* ## 02 weekly: what the week looked like, from real logs only.
 *   ### last 7 days  public/data/wakatime.json (WakaTime, refreshed daily)
 *   ### digest       public/data/weekly/ (WakaTime + local git + Last.fm, Sundays)
 * The presentational parts take data as props (server-rendered in tests); the
 * default export is the container that fetches. Any file or source that is
 * missing gets an honest empty state, never stand-in numbers. Category colours
 * are info / ok / fg-dim / line-strong, always next to a word and a percentage;
 * amber and the heat-* ramp are not used here. */
import { useState } from 'react';
import { plural } from '../lib/contrib';
import {
  categorySlots,
  chartMaxHours,
  dayParts,
  fmtDate,
  fmtRange,
  fmtStamp,
  hm,
  INDEX_FILE,
  isSourceError,
  stackDays,
  topRows,
  useDigest,
  useDigestIndex,
  useWaka,
  WAKA_FILE,
} from '../lib/weekly';
import Section from './Section';

const SLOT_FILL = ['fill-info', 'fill-ok', 'fill-fg-dim', 'fill-line-strong'];
const SLOT_BG = ['bg-info', 'bg-ok', 'bg-fg-dim', 'bg-line-strong'];
const SAFE_URL = /^https:\/\//;
export const SOURCE_NOTE = 'WakaTime API (refreshed daily 04:00 HKT) · local git logs · Last.fm scrobbles (weekly digest, Sundays)';

/* ---- shared bits ---------------------------------------------------------- */

function H3({ children }) {
  return (
    <h3 className="font-mono text-[15px] font-medium text-fg">
      <span aria-hidden className="text-fg-faint">### </span>
      {children}
    </h3>
  );
}

function Meta({ children }) {
  return <p className="font-mono text-[12px] text-fg-faint">{children}</p>;
}

export function Empty({ title, children, className = '' }) {
  return (
    <div className={`rounded border border-dashed border-line-strong/60 px-4 py-3 text-[14px] leading-relaxed text-fg-dim ${className}`}>
      <p className="font-mono text-[13px] text-fg">
        <span aria-hidden className="text-fg-faint">∅ </span>
        {title}
      </p>
      {children && <p className="mt-1 max-w-[60ch] [overflow-wrap:anywhere]">{children}</p>}
    </div>
  );
}

function Loading({ file }) {
  return (
    <p role="status" className="flex min-h-[6rem] items-center rounded border border-line px-4 font-mono text-[13px] text-fg-faint">
      loading {file} …
    </p>
  );
}

function LoadError({ file, error }) {
  return (
    <div role="status" className="rounded border border-dashed border-line-strong/60 px-4 py-3 text-[14px] leading-relaxed text-fg-dim">
      <p className="font-mono text-[13px] text-warn [overflow-wrap:anywhere]">
        could not load {file} ({error})
      </p>
      <p className="mt-1 max-w-[60ch]">No numbers are shown rather than made-up ones.</p>
    </div>
  );
}

function Fig({ value, children }) {
  return (
    // dt first in the DOM, value shown on top (as in ProjectStats)
    <div className="flex flex-col-reverse justify-end rounded border border-line-soft bg-bg px-3 py-2.5">
      <dt className="mt-1 text-[13px] leading-snug text-fg-dim">{children}</dt>
      <dd className="font-mono text-[22px] font-medium leading-tight tracking-[-0.02em] text-fg">{value}</dd>
    </div>
  );
}

/** Ranked rows (projects, languages): name, time, share, and a thin bar at the share of the total. */
export function RankList({ title, rows, n = 8, className = '' }) {
  const shown = topRows(rows, n);
  return (
    <div className={`min-w-0 ${className}`}>
      <h4 className="label mb-2">{title}</h4>
      {shown.length === 0 ? (
        <p className="font-mono text-[13px] text-fg-faint">none recorded</p>
      ) : (
        <ol className="grid gap-2 font-mono text-[13px]">
          {shown.map((r) => (
            <li key={r.name} className="min-w-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className={`min-w-0 truncate ${r.other ? 'text-fg-faint' : 'text-fg'}`} title={r.name}>
                  {r.other ? 'other' : r.name}
                </span>
                <span className="shrink-0 tabular-nums text-fg-dim">
                  {hm(r.seconds)} <span className="inline-block w-[5ch] text-right text-fg-faint">{Math.round(r.percent)}%</span>
                </span>
              </div>
              <div aria-hidden className="mt-1 h-[3px] rounded-full bg-line-soft">
                <div className="h-full rounded-full bg-fg-faint" style={{ width: `${Math.min(100, Math.max(0, r.percent))}%` }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Category split: words and percentages always; a proportional bar when there is more than one. */
export function CategorySplit({ categories }) {
  const slots = categorySlots(categories);
  if (!slots.length) return <Meta>no categories recorded</Meta>;
  const total = slots.reduce((s, c) => s + c.seconds, 0) || 1;
  return (
    <div>
      {slots.length > 1 && (
        <div aria-hidden className="mb-3 flex h-2 gap-[2px] overflow-hidden rounded-full">
          {slots.map((c) => (
            <span key={c.name} className={`h-full ${SLOT_BG[c.slot]}`} style={{ flex: `${c.seconds / total} 1 0` }} />
          ))}
        </div>
      )}
      <ul className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[12px]">
        {slots.map((c) => (
          <li key={c.name} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={`inline-block size-2.5 rounded-[2px] ${SLOT_BG[c.slot]}`} />
            <span className="text-fg">{c.name}</span>
            <span className="text-fg-dim">{Math.round(c.percent)}%</span>
            <span className="text-fg-faint">{hm(c.seconds)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---- ### last 7 days ------------------------------------------------------- */

const CHART_H = 120; // px; the viewBox height matches, so y units are pixels
const COL = 100; // viewBox units per day; x stretches with the column width

/** Daily bars, stacked by category when there is more than one. Decorative for screen readers (see DayTable). */
export function DayChart({ days, categories }) {
  const slots = categorySlots(categories);
  const stacked = stackDays(days, slots);
  const maxH = chartMaxHours(days);
  const max = maxH * 3600;
  const y = (s) => CHART_H - (s / max) * CHART_H;
  const ticks = maxH >= 2 ? [maxH, Math.round(maxH / 2)] : [maxH];
  const w = days.length * COL;
  return (
    <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2">
      <div aria-hidden className="relative font-mono text-[11px] text-fg-faint" style={{ height: CHART_H }}>
        {[...ticks, 0].map((t) => (
          <span key={t} className="absolute right-0 -translate-y-1/2 leading-none" style={{ top: `${(1 - t / maxH) * 100}%` }}>
            {t}h
          </span>
        ))}
      </div>
      <svg
        aria-hidden
        width="100%"
        height={CHART_H}
        viewBox={`0 0 ${w} ${CHART_H}`}
        preserveAspectRatio="none"
        className="block overflow-visible"
      >
        {ticks.map((t) => (
          <line
            key={t}
            x1={0}
            x2={w}
            y1={y(t * 3600)}
            y2={y(t * 3600)}
            vectorEffect="non-scaling-stroke"
            className="stroke-line-soft"
            strokeWidth={1}
          />
        ))}
        {stacked.map((d, i) => {
          let top = CHART_H;
          const parts = d.segments.map((s, k) => {
            const h = (s.seconds / max) * CHART_H;
            // a 2px gap between stacked segments
            const gap = k > 0 && h > 3 ? 2 : 0;
            top -= h;
            return (
              <rect key={s.name} x={i * COL + 22} width={COL - 44} y={top} height={Math.max(0, h - gap)} className={SLOT_FILL[s.slot]} />
            );
          });
          const detail = d.segments.length > 1 ? ` (${d.segments.map((s) => `${s.name} ${hm(s.seconds)}`).join(', ')})` : '';
          const { weekday } = dayParts(d.date);
          return (
            <g key={d.date}>
              {parts}
              <rect x={i * COL} width={COL} y={0} height={CHART_H} fill="transparent">
                <title>{`${weekday}, ${fmtDate(d.date)}: ${d.seconds ? hm(d.seconds) : 'no editor time'}${detail}`}</title>
              </rect>
            </g>
          );
        })}
        <line x1={0} x2={w} y1={CHART_H - 0.5} y2={CHART_H - 0.5} vectorEffect="non-scaling-stroke" className="stroke-line" strokeWidth={1} />
      </svg>
      <div
        aria-hidden
        className="col-start-2 mt-1.5 grid text-center font-mono text-[11px] leading-tight"
        style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
      >
        {days.map((d) => {
          const { weekday, day } = dayParts(d.date);
          return (
            <span key={d.date} className={d.seconds ? 'text-fg-dim' : 'text-fg-faint'}>
              {weekday}
              <br />
              {day}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** The chart's data for screen readers. */
export function DayTable({ days, categories, caption }) {
  const slots = categorySlots(categories);
  const stacked = stackDays(days, slots);
  const split = slots.length > 1;
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">day</th>
          <th scope="col">editor time</th>
          {split && slots.map((s) => <th key={s.name} scope="col">{s.name}</th>)}
        </tr>
      </thead>
      <tbody>
        {stacked.map((d) => (
          <tr key={d.date}>
            <th scope="row">{`${dayParts(d.date).weekday}, ${fmtDate(d.date)}`}</th>
            <td>{d.seconds ? hm(d.seconds) : 'none'}</td>
            {split &&
              slots.map((s) => {
                const seg = d.segments.find((x) => x.slot === s.slot);
                return <td key={s.name}>{seg ? hm(seg.seconds) : 'none'}</td>;
              })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** ### last 7 days, ready state: wakatime.json as props. */
export function LastDays({ data }) {
  const range = fmtRange(data.range.start, data.range.end);
  const nDays = data.range.days ?? data.days.length;
  const editors = topRows(data.editors, 4);
  return (
    <>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <H3>last 7 days</H3>
        <Meta>
          {range} · updated <time dateTime={data.generated}>{fmtStamp(data.generated, data.timezone)}</time>
        </Meta>
      </div>

      {data.total_seconds === 0 ? (
        <Empty title="no editor time in these 7 days">WakaTime recorded nothing between {range}.</Empty>
      ) : (
        <figure className="m-0 rounded border border-line p-4">
          <dl className="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-2">
            <Fig value={hm(data.total_seconds)}>in the editor</Fig>
            <Fig value={hm(data.daily_average_seconds)}>daily average</Fig>
            <Fig value={`${data.active_days}/${nDays}`}>active days</Fig>
          </dl>
          <div className="mt-5">
            <DayChart days={data.days} categories={data.categories} />
            <DayTable days={data.days} categories={data.categories} caption={`Editor time per day, ${range}`} />
          </div>
          <figcaption className="mt-4">
            <CategorySplit categories={data.categories} />
          </figcaption>
        </figure>
      )}

      {data.total_seconds > 0 && (
        <>
          <div className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-x-8 gap-y-6">
            <RankList title="projects" rows={data.projects} />
            <RankList title="languages" rows={data.languages} />
          </div>
          {editors.length > 0 && (
            <p className="mt-4 font-mono text-[12px] text-fg-faint">
              editors:{' '}
              {editors.map((e, i) => (
                <span key={e.name}>
                  {i > 0 && ' · '}
                  <span className="text-fg-dim">{e.other ? 'other' : e.name}</span> {Math.round(e.percent)}%
                </span>
              ))}
            </p>
          )}
        </>
      )}
    </>
  );
}

/** ### last 7 days for any load state. */
export function LastDaysBlock({ state }) {
  if (state.status === 'ready') return <LastDays data={state.data} />;
  return (
    <>
      <div className="mb-3">
        <H3>last 7 days</H3>
      </div>
      {state.status === 'loading' ? <Loading file={WAKA_FILE} /> : <LoadError file={WAKA_FILE} error={state.error} />}
    </>
  );
}

/* ---- ### digest ------------------------------------------------------------ */

function SourceError({ name, error }) {
  return (
    <Empty title={`${name}: no data for this week`}>
      <span className="font-mono text-[12px] text-fg-faint">{error}</span>
    </Empty>
  );
}

function Card({ title, children }) {
  return (
    <div className="min-w-0">
      <h4 className="label mb-2">{title}</h4>
      {children}
    </div>
  );
}

function Headline({ value, children }) {
  return (
    <p className="mb-3 font-mono text-[13px] text-fg-dim">
      <span className="text-[18px] font-medium text-fg">{value}</span> {children}
    </p>
  );
}

function EditorCard({ w }) {
  if (isSourceError(w)) return <SourceError name="WakaTime" error={w.error} />;
  if (!w.total_seconds) return <Empty title="no editor time logged this week" />;
  const cats = categorySlots(w.categories);
  return (
    <>
      <Headline value={hm(w.total_seconds)}>over {plural(w.active_days, 'day')}</Headline>
      {cats.length > 1 && (
        <div className="mb-3">
          <CategorySplit categories={w.categories} />
        </div>
      )}
      <RankList title="top projects" rows={w.projects} n={5} />
    </>
  );
}

const MAX_REPOS = 8;

function GitCard({ g }) {
  if (isSourceError(g)) return <SourceError name="git" error={g.error} />;
  if (!g.total) return <Empty title="no commits this week" />;
  const shown = g.repos.slice(0, MAX_REPOS);
  const rest = g.repos.slice(MAX_REPOS);
  return (
    <>
      <Headline value={g.total.toLocaleString('en-US')}>
        {g.total === 1 ? 'commit' : 'commits'} in {plural(g.repos.length, 'repo')}
      </Headline>
      <ul className="grid gap-1 font-mono text-[13px]">
        {shown.map((r) => {
          const row = (
            <span className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-fg" title={r.name}>
                {r.name}
              </span>
              <span className="shrink-0 tabular-nums text-fg-dim">{r.commits}</span>
            </span>
          );
          return (
            <li key={r.name} className="min-w-0">
              {r.latest.length ? (
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-baseline rounded hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                    <span aria-hidden className="inline-block w-[2ch] shrink-0 text-fg-faint transition-transform duration-150 group-open:rotate-90">
                      ▸
                    </span>
                    {row}
                    <span className="sr-only">, latest commit subjects</span>
                  </summary>
                  <ul className="anim-disclose mb-2 ml-[2ch] mt-1 grid gap-1 border-l border-line pl-3 text-[12px] leading-snug text-fg-dim">
                    {r.latest.map((s, i) => (
                      <li key={`${i}-${s}`} className="[overflow-wrap:anywhere]">
                        {s}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : (
                <div className="flex items-baseline">
                  <span aria-hidden className="inline-block w-[2ch] shrink-0" />
                  {row}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {rest.length > 0 && (
        <p className="mt-2 font-mono text-[12px] text-fg-faint">
          and {plural(rest.length, 'more repo')}, {plural(rest.reduce((s, r) => s + r.commits, 0), 'commit')}
        </p>
      )}
    </>
  );
}

function MusicCard({ m }) {
  if (isSourceError(m)) return <SourceError name="Last.fm" error={m.error} />;
  if (!m.tracks.length) return <Empty title="no scrobbles this week" />;
  return (
    <>
      <Headline value={m.scrobbles.toLocaleString('en-US')}>{m.scrobbles === 1 ? 'scrobble' : 'scrobbles'}</Headline>
      <ol className="grid gap-2 text-[14px] leading-snug">
        {m.tracks.map((t, i) => (
          <li key={`${t.name}-${t.artist}`} className="flex min-w-0 items-baseline gap-3">
            <span aria-hidden className="w-[2ch] shrink-0 font-mono text-[12px] text-fg-faint">
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
              {SAFE_URL.test(t.url ?? '') ? (
                <a href={t.url} target="_blank" rel="noreferrer" className="link text-fg">
                  {t.name}
                  <span className="sr-only"> (opens last.fm in a new tab)</span>
                </a>
              ) : (
                <span className="text-fg">{t.name}</span>
              )}
              <span className="block text-[13px] text-fg-dim">{t.artist}</span>
            </span>
            <span className="shrink-0 font-mono text-[12px] tabular-nums text-fg-dim">{plural(t.plays, 'play')}</span>
          </li>
        ))}
      </ol>
    </>
  );
}

/** One week's digest file as props. */
export function DigestView({ digest }) {
  return (
    <div>
      <Meta>
        {fmtRange(digest.start, digest.end)} · {digest.complete ? 'complete week' : 'in progress, still being written'}
        {digest.generated && (
          <>
            {' '}
            · generated <time dateTime={digest.generated}>{fmtStamp(digest.generated, digest.timezone)}</time>
          </>
        )}
      </Meta>
      {digest.highlights.length ? (
        <ul className="mt-3 grid max-w-[66ch] gap-1 text-[15px] leading-relaxed text-fg-dim">
          {digest.highlights.map((h, i) => (
            <li key={`${i}-${h}`} className="flex gap-2 [overflow-wrap:anywhere]">
              <span aria-hidden className="font-mono text-fg-faint">
                -
              </span>
              <span className="min-w-0">{h}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[15px] text-fg-dim">Nothing recorded this week.</p>
      )}
      <div className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] gap-x-8 gap-y-8">
        <Card title="editor">
          <EditorCard w={digest.wakatime} />
        </Card>
        <Card title="git">
          <GitCard g={digest.git} />
        </Card>
        <Card title="last.fm">
          <MusicCard m={digest.lastfm} />
        </Card>
      </div>
    </div>
  );
}

/** Week buttons, newest first. The selected one is aria-pressed and outlined. */
export function WeekPicker({ weeks, selected, onSelect }) {
  return (
    <ul aria-label="Choose a week" className="mb-4 flex flex-wrap gap-2 font-mono text-[13px]">
      {weeks.map((w) => {
        const on = w.week === selected;
        return (
          <li key={w.week}>
            <button
              type="button"
              aria-pressed={on}
              title={fmtRange(w.start, w.end)}
              onClick={() => onSelect?.(w.week)}
              className={`inline-flex h-9 items-center gap-2 rounded border px-2.5 transition-colors duration-150 ${
                on ? 'border-line-strong bg-surface-2 text-fg' : 'border-line text-fg-dim hover:border-line-strong hover:text-fg'
              }`}
            >
              {w.week}
              {!w.complete && <span className="text-[12px] text-fg-faint">in progress</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** ### digest for any load state of the index and the selected week. */
export function DigestBlock({ index, selected, onSelect, digest }) {
  const weeks = index.status === 'ready' ? index.data.weeks : [];
  const row = weeks.find((w) => w.week === selected) ?? weeks[0];
  return (
    <div className="mt-12">
      <div className="mb-3">
        <H3>digest</H3>
      </div>
      {index.status === 'loading' && <Loading file={INDEX_FILE} />}
      {index.status === 'error' && <LoadError file={INDEX_FILE} error={index.error} />}
      {index.status === 'ready' && !row && <Empty title="no weekly digests yet">The first one is written on Sunday night.</Empty>}
      {row && (
        <>
          <WeekPicker weeks={weeks} selected={row.week} onSelect={onSelect} />
          {digest?.status === 'ready' && <DigestView digest={digest.data} />}
          {(!digest || digest.status === 'loading') && <Loading file={row.file} />}
          {digest?.status === 'error' && <LoadError file={row.file} error={digest.error} />}
        </>
      )}
    </div>
  );
}

/* ---- the section ----------------------------------------------------------- */

/** The whole section from load states, so it can be rendered without fetching. */
export function WeeklyView({ n, waka, index, digest, selected, onSelect }) {
  const latest = index.status === 'ready' ? index.data.weeks[0] : null;
  return (
    <Section id="weekly" n={n} title="weekly" aside={latest ? `latest digest ${latest.week}` : 'last 7 days · weekly digest'}>
      <LastDaysBlock state={waka} />
      <DigestBlock index={index} selected={selected} onSelect={onSelect} digest={digest} />
      <p className="mt-10 font-mono text-[12px] leading-relaxed text-fg-faint">{SOURCE_NOTE}</p>
    </Section>
  );
}

export default function Weekly({ n }) {
  const waka = useWaka();
  const index = useDigestIndex();
  const [selected, setSelected] = useState(null);
  const weeks = index.status === 'ready' ? index.data.weeks : [];
  const row = weeks.find((w) => w.week === selected) ?? weeks[0];
  const digest = useDigest(row?.file);
  return <WeeklyView n={n} waka={waka} index={index} digest={digest} selected={row?.week} onSelect={setSelected} />;
}
