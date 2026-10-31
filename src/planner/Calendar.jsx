import React from 'react';
import {
  addDays,
  addMonths,
  addMonthsToDate,
  compareDates,
  longDate,
  MONTHS,
  monthGrid,
  monthOf,
  parseDate,
  parseMonth,
  rangeLabel,
  weekdayIndex,
} from './dates.js';
import { layoutWeeks, plansOn, progressState } from './lanes.js';
import { doneCount } from '../../plugins/planner-core.js';

const WEEKDAY_SHORT = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const COLS = 'grid grid-cols-[2rem_repeat(7,minmax(0,1fr))] sm:grid-cols-[2.75rem_repeat(7,minmax(0,1fr))]';

const TINT = {
  none: 'border-line-strong bg-surface-2 text-fg-dim',
  some: 'border-info/60 bg-info/15 text-fg',
  all: 'border-ok/60 bg-ok/15 text-fg',
};

const inRange = (day, a, b) => a && b && compareDates(day, a) >= 0 && compareDates(day, b) <= 0;

/**
 * Month grid with ISO week gutter, plan lane bars and range selection.
 * `range` is { start, end } of "YYYY-MM-DD" strings (either may be '').
 */
export default function Calendar({ month, onMonth, plans, today, editable, range, onRange, selectedId, onSelectPlan }) {
  const weeks = React.useMemo(() => layoutWeeks(monthGrid(month), plans), [month, plans]);
  const [focusDay, setFocusDay] = React.useState(() => (monthOf(today) === month ? today : `${month}-01`));
  const [hover, setHover] = React.useState('');
  const gridRef = React.useRef(null);
  const wantFocus = React.useRef(false);
  const { y, m } = parseMonth(month);
  const headingId = 'cal-month';

  // Keep the roving tab stop inside the visible month.
  const firstDay = weeks[0].days[0];
  const lastDay = weeks.at(-1).days[6];
  const tabDay = compareDates(focusDay, firstDay) >= 0 && compareDates(focusDay, lastDay) <= 0 ? focusDay : `${month}-01`;

  React.useEffect(() => {
    if (!wantFocus.current) return;
    wantFocus.current = false;
    gridRef.current?.querySelector(`[data-day="${tabDay}"]`)?.focus();
  }, [tabDay, month]);

  // While choosing the end, the hovered day previews the range.
  const pending = editable && range.start && !range.end;
  let [selA, selB] = [range.start, range.end || (pending ? hover || range.start : '')];
  if (selA && selB && compareDates(selA, selB) > 0) [selA, selB] = [selB, selA];

  function pick(day) {
    if (!editable) {
      const here = plansOn(plans, day);
      if (here.length) onSelectPlan(here[0].id);
      return;
    }
    if (!range.start || range.end) onRange({ start: day, end: '' });
    else if (compareDates(day, range.start) < 0) onRange({ start: day, end: range.start });
    else onRange({ start: range.start, end: day });
    setHover('');
  }

  function go(n) {
    onMonth(addMonths(month, n));
    setFocusDay((d) => addMonthsToDate(d, n));
  }

  function jumpToday() {
    onMonth(monthOf(today));
    setFocusDay(today);
  }

  function moveFocus(day) {
    wantFocus.current = true;
    setFocusDay(day);
    if (monthOf(day) !== month && (compareDates(day, firstDay) < 0 || compareDates(day, lastDay) > 0)) onMonth(monthOf(day));
  }

  function onKeyDown(e) {
    const day = e.target?.dataset?.day;
    if (!day) return;
    const wd = weekdayIndex(day);
    const moves = {
      ArrowLeft: () => addDays(day, -1),
      ArrowRight: () => addDays(day, 1),
      ArrowUp: () => addDays(day, -7),
      ArrowDown: () => addDays(day, 7),
      Home: () => addDays(day, -wd),
      End: () => addDays(day, 6 - wd),
      PageUp: () => addMonthsToDate(day, e.shiftKey ? -12 : -1),
      PageDown: () => addMonthsToDate(day, e.shiftKey ? 12 : 1),
    };
    if (moves[e.key]) {
      e.preventDefault();
      const next = moves[e.key]();
      if (pending) setHover(next);
      moveFocus(next);
      if (e.key.startsWith('Page')) onMonth(monthOf(next));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick(day);
    } else if (e.key === 'Escape' && (range.start || range.end)) {
      e.preventDefault();
      onRange({ start: '', end: '' });
      setHover('');
    }
  }

  const visiblePlans = React.useMemo(() => {
    const seen = new Map();
    for (const w of weeks) for (const s of w.segments) seen.set(s.plan.id, s.plan);
    return [...seen.values()];
  }, [weeks]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h3 id={headingId} className="font-mono text-[15px] font-medium text-fg" aria-live="polite">
          {MONTHS[m - 1]} <span className="text-fg-dim">{y}</span>
        </h3>
        <div className="flex items-center gap-1.5" role="group" aria-label="month">
          <button type="button" className="btn h-8 px-2.5" onClick={() => go(-1)} aria-label="previous month">
            <span aria-hidden="true">‹</span> prev
          </button>
          <button type="button" className="btn h-8 px-2.5" onClick={jumpToday} aria-label="jump to today">
            today
          </button>
          <button type="button" className="btn h-8 px-2.5" onClick={() => go(1)} aria-label="next month">
            next <span aria-hidden="true">›</span>
          </button>
        </div>
      </div>

      <div
        ref={gridRef}
        role="grid"
        aria-labelledby={headingId}
        aria-readonly={editable ? undefined : 'true'}
        aria-multiselectable={editable ? 'true' : undefined}
        onKeyDown={onKeyDown}
        onMouseLeave={() => setHover('')}
        className="select-none overflow-hidden rounded border border-line bg-surface [--date-h:1.75rem] [--lane:6px] sm:[--date-h:1.75rem] sm:[--lane:1.375rem]"
      >
        <div role="row" className={`${COLS} border-b border-line`}>
          <div role="columnheader" className="py-1.5 text-center font-mono text-[11px] text-fg-faint">
            <span aria-hidden="true">wk</span>
            <span className="sr-only">ISO week</span>
          </div>
          {WEEKDAY_SHORT.map((d, i) => (
            <div key={d} role="columnheader" className={`py-1.5 pl-1.5 font-mono text-[11px] sm:pl-2 ${i > 4 ? 'text-fg-faint' : 'text-fg-dim'}`}>
              <abbr title={['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][i]} className="no-underline">
                {d}
              </abbr>
            </div>
          ))}
        </div>

        {weeks.map((row, ri) => (
          <div
            key={row.days[0]}
            role="row"
            className={`relative ${COLS} ${ri < weeks.length - 1 ? 'border-b border-line-soft' : ''}`}
            style={{ '--lanes': row.lanes }}
          >
            <div role="rowheader" className="pt-1.5 text-center font-mono text-[11px] text-fg-faint">
              <span aria-hidden="true">w{row.week}</span>
              <span className="sr-only">week {row.week}</span>
            </div>
            {row.days.map((day) => {
              const { d, m: dm } = parseDate(day);
              const outside = monthOf(day) !== month;
              const isToday = day === today;
              const selected = inRange(day, selA, selB);
              const edge = selected && (day === selA || day === selB);
              const here = plansOn(plans, day);
              const label = [
                longDate(day),
                isToday ? 'today' : '',
                here.length ? `plans: ${here.map((p) => p.title).join(', ')}` : '',
                edge && day === selA ? 'range start' : '',
                edge && day === selB ? 'range end' : '',
              ]
                .filter(Boolean)
                .join(' — ');
              return (
                <div
                  key={day}
                  role="gridcell"
                  data-day={day}
                  tabIndex={day === tabDay ? 0 : -1}
                  aria-selected={editable ? selected : undefined}
                  aria-label={label}
                  aria-current={isToday ? 'date' : undefined}
                  onClick={() => {
                    setFocusDay(day);
                    pick(day);
                  }}
                  onMouseEnter={pending ? () => setHover(day) : undefined}
                  onFocus={() => setFocusDay(day)}
                  className={[
                    'relative min-h-[max(2.75rem,calc(var(--date-h)+var(--lanes)*var(--lane)+0.5rem))] border-l border-line-soft sm:min-h-[max(5.25rem,calc(var(--date-h)+var(--lanes)*var(--lane)+0.5rem))]',
                    'outline-offset-[-2px]',
                    editable || here.length ? 'cursor-pointer' : '',
                    selected ? (edge ? 'bg-info/25' : 'bg-info/10') : outside ? 'bg-bg/60' : editable ? 'hover:bg-surface-2' : '',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'absolute left-1 top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-[3px] px-1 font-mono text-[12px] leading-none sm:left-1.5',
                      isToday ? 'font-semibold text-signal ring-1 ring-signal' : outside ? 'text-fg-faint' : 'text-fg-dim',
                    ].join(' ')}
                  >
                    {d === 1 ? (
                      <>
                        <span className="hidden sm:inline">{MONTHS[dm - 1].slice(0, 3)}&nbsp;</span>
                        {d}
                      </>
                    ) : (
                      d
                    )}
                  </span>
                  {isToday && (
                    <span className="absolute right-1.5 top-1 hidden font-mono text-[10px] uppercase tracking-[0.08em] text-signal sm:inline" aria-hidden="true">
                      today
                    </span>
                  )}
                </div>
              );
            })}

            {/* Bars are a pointer shortcut; keyboard and screen readers reach plans via cell labels and the log. */}
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-0 ${COLS} content-start gap-y-0 pt-[var(--date-h)]`}
              style={{ gridTemplateRows: `repeat(${Math.max(row.lanes, 1)}, var(--lane))` }}
            >
              {row.segments.map((s) => {
                const state = progressState(s.plan);
                const isSel = s.plan.id === selectedId;
                return (
                  <div
                    key={s.plan.id}
                    onClick={() => onSelectPlan(s.plan.id)}
                    title={`${s.plan.title} · ${rangeLabel(s.plan.start, s.plan.end, y)} · ${doneCount(s.plan)}/${s.plan.tasks.length}`}
                    style={{ gridColumn: `${s.from + 2} / ${s.to + 3}`, gridRow: s.lane + 1 }}
                    className={[
                      'pointer-events-auto mb-[2px] flex min-w-0 cursor-pointer items-center gap-1.5 overflow-hidden border font-mono text-[11px] leading-none sm:mb-[3px] sm:px-1.5',
                      s.startsHere ? 'ml-0.5 rounded-l-[3px]' : 'border-l-0',
                      s.endsHere ? 'mr-0.5 rounded-r-[3px]' : 'border-r-0',
                      TINT[state],
                      isSel ? 'outline outline-1 outline-fg' : '',
                    ].join(' ')}
                  >
                    {s.label && (
                      <span className="hidden min-w-0 truncate sm:inline">
                        {state === 'all' && <span className="text-ok">✓ </span>}
                        <span className="font-sans text-[12px]">{s.plan.title}</span>{' '}
                        <span className="text-fg-faint">{s.plan.hash.slice(0, 7)}</span>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-2 font-mono text-[12px] text-fg-faint">
        {editable ? (
          range.start && !range.end ? (
            <>
              start <span className="text-fg-dim">{range.start}</span> · pick an end day · <kbd className="kbd">Esc</kbd> clears
            </>
          ) : range.start && range.end ? (
            <>
              range <span className="text-fg-dim">{rangeLabel(range.start, range.end, y)}</span> · <kbd className="kbd">Esc</kbd> clears
            </>
          ) : (
            <>
              click a start day, then an end day · <span className="hidden sm:inline">arrows move · <kbd className="kbd">Enter</kbd> picks · <kbd className="kbd">PgUp</kbd>/<kbd className="kbd">PgDn</kbd> months</span>
            </>
          )
        ) : (
          <>select a plan on the calendar or in the log</>
        )}
      </p>

      {/* Below 640px bars shrink to lane strips, so name them here. */}
      {visiblePlans.length > 0 && (
        <ul className="mt-3 space-y-1 sm:hidden" aria-label="plans in this view">
          {visiblePlans.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onSelectPlan(p.id)}
                aria-pressed={p.id === selectedId}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left ${p.id === selectedId ? 'bg-surface-2' : 'hover:bg-surface'}`}
              >
                <span aria-hidden="true" className={`h-1 w-4 shrink-0 rounded-sm border ${TINT[progressState(p)]}`} />
                <span className="min-w-0 flex-1 truncate text-[14px]">{p.title}</span>
                <span className="shrink-0 font-mono text-[12px] text-fg-faint">
                  {rangeLabel(p.start, p.end, y)} · {doneCount(p)}/{p.tasks.length}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
