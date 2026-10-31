import React from 'react';
import { verifyPlan } from '../../plugins/planner-core.js';
import { rangeLabel, rangeLength } from './dates.js';
import { Progress } from './PlanLog.jsx';

function formatSealedAt(iso) {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

/** Recomputes the seal hash in the browser; null while unknown or unsupported. */
function useVerified(plan) {
  const [state, setState] = React.useState({ id: null, ok: null });
  React.useEffect(() => {
    let live = true;
    if (!plan || !globalThis.crypto?.subtle) return undefined;
    verifyPlan(plan).then(
      (ok) => live && setState({ id: plan.id, ok }),
      () => live && setState({ id: plan.id, ok: null }),
    );
    return () => {
      live = false;
    };
  }, [plan]);
  return plan && state.id === plan.id ? state.ok : null;
}

export default function PlanDetail({ plan, mode, year, onToggle, onDelete }) {
  // Arming "break seal" belongs to one plan; selecting another disarms it.
  const [armedId, setArmedId] = React.useState(null);
  const confirming = plan != null && armedId === plan.id;
  const setConfirming = (on) => setArmedId(on ? plan.id : null);
  const [deleting, setDeleting] = React.useState(false);
  const verified = useVerified(plan);
  const breakRef = React.useRef(null);
  const cancelRef = React.useRef(null);

  if (!plan) {
    return (
      <p className="font-mono text-[13px] text-fg-faint">
        no plan selected · pick one in the log{mode === 'readonly' ? ' or on the calendar' : ''}
      </p>
    );
  }

  const hash7 = plan.hash.slice(0, 7);
  const local = mode === 'local';

  async function breakSeal() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setDeleting(true);
    try {
      await onDelete(plan);
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <article aria-labelledby="plan-detail-title">
      <h3 id="plan-detail-title" tabIndex={-1} className="text-[22px] font-semibold leading-tight tracking-[-0.01em] text-fg focus:outline-none">
        {plan.title}
      </h3>
      <p className="mt-1 font-mono text-[13px] text-fg-dim">
        {rangeLabel(plan.start, plan.end, year)} · {rangeLength(plan.start, plan.end)} {rangeLength(plan.start, plan.end) === 1 ? 'day' : 'days'}
        {plan.tag && <span className="ml-2 text-info">#{plan.tag}</span>}
      </p>

      <dl className="mt-4 grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 font-mono text-[12px]">
        <dt className="text-fg-faint">sealed</dt>
        <dd className="text-fg-dim">
          <time dateTime={plan.sealedAt}>{formatSealedAt(plan.sealedAt)}</time>
        </dd>
        <dt className="text-fg-faint">sha256</dt>
        <dd className="break-all text-fg-dim">
          <span className="text-fg">{hash7}</span>
          {plan.hash.slice(7)}
        </dd>
        {verified !== null && (
          <>
            <dt className="text-fg-faint">verify</dt>
            <dd className={verified ? 'text-ok' : 'text-warn'}>{verified ? '✓ hash matches content' : '✗ content does not match hash'}</dd>
          </>
        )}
        <dt className="text-fg-faint">progress</dt>
        <dd>
          <Progress plan={plan} />
        </dd>
      </dl>

      {plan.notes && <p className="mt-4 max-w-[64ch] whitespace-pre-wrap break-words text-[15px] leading-relaxed text-fg-dim">{plan.notes}</p>}

      <fieldset className="mt-5">
        <legend className="label mb-2">tasks</legend>
        <ul className="space-y-0.5">
          {plan.tasks.map((t, i) => (
            <li key={i}>
              <label className={`flex items-start gap-2.5 rounded px-1.5 py-1 ${local ? 'cursor-pointer hover:bg-surface-2' : ''}`}>
                <input
                  type="checkbox"
                  checked={t.done}
                  disabled={!local}
                  onChange={(e) => onToggle(plan, i, e.target.checked)}
                  className="mt-[5px] h-4 w-4 shrink-0 accent-ok disabled:opacity-70"
                />
                <span className={`min-w-0 break-words text-[15px] leading-relaxed ${t.done ? 'text-fg-faint line-through decoration-fg-faint' : 'text-fg'}`}>
                  {t.text}
                  {t.done && <span className="sr-only"> (done)</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
        {!local && <p className="mt-2 font-mono text-[12px] text-fg-faint">read-only snapshot · tasks are ticked on the owner's machine</p>}
      </fieldset>

      {local && (
        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line-soft pt-4">
          <button
            ref={breakRef}
            type="button"
            className="btn btn-danger h-8 px-2.5"
            onClick={breakSeal}
            onBlur={(e) => {
              // Arming is cancelled by leaving the button, except towards "cancel".
              if (!deleting && e.relatedTarget !== cancelRef.current) setConfirming(false);
            }}
            disabled={deleting}
            aria-describedby="break-hint"
          >
            {deleting ? 'breaking…' : confirming ? `confirm: break seal ${hash7}` : 'break seal'}
          </button>
          {confirming && !deleting && (
            <button
              ref={cancelRef}
              type="button"
              className="btn h-8 px-2.5"
              onBlur={(e) => e.relatedTarget !== breakRef.current && setConfirming(false)}
              onClick={() => {
                setConfirming(false);
                breakRef.current?.focus();
              }}
            >
              cancel
            </button>
          )}
          <span id="break-hint" className="font-mono text-[12px] text-fg-faint" aria-live="polite">
            {confirming ? 'click again to delete this plan from plans.json' : 'deletes the plan'}
          </span>
        </div>
      )}
    </article>
  );
}
