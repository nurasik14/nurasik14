import React from 'react';
import { doneCount } from '../../plugins/planner-core.js';
import { rangeLabel } from './dates.js';
import { planPhase } from './lanes.js';

const GROUPS = [
  { key: 'now', label: 'now' },
  { key: 'upcoming', label: 'upcoming' },
  { key: 'past', label: 'past' },
];

/** `[■■□□] 2/4`; long checklists are scaled to ten cells. */
export function Progress({ plan }) {
  const total = plan.tasks.length;
  const done = doneCount(plan);
  const cells = Math.min(total, 10);
  const filled = total ? Math.round((done / total) * cells) : 0;
  const complete = total > 0 && done === total;
  return (
    <span className="whitespace-nowrap font-mono text-[12px]">
      <span aria-hidden="true" className={complete ? 'text-ok' : 'text-fg-dim'}>
        [{'■'.repeat(filled)}
        <span className="text-fg-faint">{'□'.repeat(cells - filled)}</span>]
      </span>{' '}
      <span className={complete ? 'text-ok' : 'text-fg-dim'}>
        {done}/{total}
        <span className="sr-only"> tasks done</span>
      </span>
    </span>
  );
}

function Skeleton() {
  return (
    <div className="space-y-2 font-mono text-[13px] text-fg-faint" aria-hidden="true">
      {['░░░░░░░  ░░░░░░░░░░░░░░░░  ░░░░░░░░', '░░░░░░░  ░░░░░░░░░░  ░░░░░░░░░░░', '░░░░░░░  ░░░░░░░░░░░░░  ░░░░░░'].map((t) => (
        <p key={t} className="truncate">
          {t}
        </p>
      ))}
    </div>
  );
}

/** git log-style list of plans grouped by now / upcoming / past. */
export default function PlanLog({ status, error, onRetry, plans, mode, today, year, selectedId, onSelect }) {
  if (status === 'loading') {
    return (
      <div>
        <p className="mb-3 font-mono text-[13px] text-fg-dim" role="status">
          reading plans…
        </p>
        <Skeleton />
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="rounded border border-warn/60 p-4" role="alert">
        <p className="font-mono text-[13px] text-warn">
          <span aria-hidden="true">✗ </span>could not read plans
        </p>
        <p className="mt-1 break-words font-mono text-[12px] text-fg-dim">{error}</p>
        <button type="button" className="btn mt-3 h-8 px-2.5" onClick={onRetry}>
          retry
        </button>
      </div>
    );
  }
  if (!plans.length) {
    return (
      <p className="font-mono text-[13px] text-fg-dim">
        {mode === 'local' ? 'No sealed plans yet. Pick a range on the calendar to start.' : 'Nothing published yet.'}
      </p>
    );
  }

  const grouped = GROUPS.map((g) => ({ ...g, plans: plans.filter((p) => planPhase(p, today) === g.key) })).filter((g) => g.plans.length);
  // Past plans read newest first, like a log.
  for (const g of grouped) if (g.key === 'past') g.plans = [...g.plans].reverse();

  return (
    <div className="space-y-6">
      {grouped.map((g) => (
        <section key={g.key} aria-labelledby={`log-${g.key}`}>
          <h3 id={`log-${g.key}`} className="label mb-1.5 flex items-center gap-2">
            {g.label} <span className="text-fg-faint">({g.plans.length})</span>
          </h3>
          <ul className="border-t border-line-soft">
            {g.plans.map((p) => {
              const selected = p.id === selectedId;
              return (
                <li key={p.id} className="border-b border-line-soft">
                  <button
                    type="button"
                    onClick={() => onSelect(p.id)}
                    aria-pressed={selected}
                    aria-controls="plan-detail"
                    className={`grid w-full grid-cols-[4.5rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-0.5 px-2 py-2 text-left sm:grid-cols-[4.5rem_minmax(0,1fr)_auto_auto] ${
                      selected ? 'bg-surface-2' : 'hover:bg-surface'
                    }`}
                  >
                    <span className={`font-mono text-[12px] ${selected ? 'text-signal' : 'text-fg-faint'}`}>
                      {selected && <span aria-hidden="true">▌</span>}
                      {p.hash.slice(0, 7)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] text-fg">{p.title}</span>
                    </span>
                    <span className="col-start-2 font-mono text-[12px] text-fg-dim sm:col-start-auto">
                      {rangeLabel(p.start, p.end, year)}
                      {p.tag && <span className="ml-2 text-info">#{p.tag}</span>}
                    </span>
                    <span className="col-start-2 sm:col-start-auto">
                      <Progress plan={p} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
