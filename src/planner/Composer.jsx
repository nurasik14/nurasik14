import React from 'react';
import { useShell } from '../shell/AppShell';
import { LIMITS, normalizeTasks, validatePlanInput } from '../../plugins/planner-core.js';
import { rangeLabel } from './dates.js';
import { createPlan } from './store.js';

const FIELDS = ['title', 'start', 'end', 'tasks', 'notes', 'tag'];
const SEALED_MS = 2500;

function FieldError({ id, error }) {
  if (!error) return null;
  return (
    <p id={id} className="mt-1 font-mono text-[12px] text-warn">
      <span aria-hidden="true">✗ </span>
      {error}
    </p>
  );
}

/**
 * Write a plan and seal it. After a seal the form collapses to one
 * commit-style line until the owner starts the next plan.
 */
export default function Composer({ range, onRange, sealed, onSealed, onReopen, year }) {
  const shell = useShell();
  const { flash } = shell;
  // The seal effect must run once per seal, whatever the shell does with its callbacks.
  const shellRef = React.useRef(shell);
  React.useEffect(() => {
    shellRef.current = shell;
  });
  const [title, setTitle] = React.useState('');
  const [tasks, setTasks] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [tag, setTag] = React.useState('');
  const [errors, setErrors] = React.useState({});
  const [formError, setFormError] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const formRef = React.useRef(null);
  const lineRef = React.useRef(null);
  const focusTitle = React.useRef(false);

  // "new plan" lands on the title once the form is no longer inert.
  React.useEffect(() => {
    if (sealed || !focusTitle.current) return;
    focusTitle.current = false;
    formRef.current?.querySelector('#f-title')?.focus();
  }, [sealed]);

  const parsed = normalizeTasks(tasks) ?? [];
  const collapsed = Boolean(sealed);

  // The seal moment: focus the commit line (leaving INSERT), then show SEALED.
  React.useEffect(() => {
    if (!sealed) return undefined;
    lineRef.current?.focus();
    let ended = false;
    const t1 = setTimeout(() => {
      shellRef.current.setMode('SEALED');
      shellRef.current.flash(`sealed ${sealed.hash.slice(0, 7)} → public/data/plans.json`, 'signal');
    }, 0);
    const t2 = setTimeout(() => {
      ended = true;
      shellRef.current.setMode(null);
    }, SEALED_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      if (!ended) shellRef.current.setMode(null);
    };
  }, [sealed]);

  function fail(errs) {
    setErrors(errs);
    const first = FIELDS.find((f) => errs[f]);
    if (first) formRef.current?.querySelector(`#f-${first}`)?.focus();
  }

  async function submit(e) {
    e?.preventDefault();
    if (saving) return;
    setFormError('');
    const input = { title, notes, tag, tasks: parsed, start: range.start, end: range.end };
    const check = validatePlanInput(input);
    if (!check.ok) {
      const errs = { ...check.errors };
      if (!range.start) errs.start = 'pick a start day on the calendar, or type one';
      if (!range.end) errs.end = range.start ? 'pick an end day (click the start again for a one-day plan)' : 'pick an end day';
      return fail(errs);
    }
    setErrors({});
    setSaving(true);
    try {
      const plan = await createPlan(check.value);
      setTitle('');
      setTasks('');
      setNotes('');
      setTag('');
      onSealed(plan);
    } catch (err) {
      if (err.field && FIELDS.includes(err.field)) fail({ [err.field]: err.message });
      else setFormError(err.message);
      flash(`seal failed: ${err.message}`, 'warn');
    } finally {
      setSaving(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(e);
  }

  const described = (field, hint) => [hint, errors[field] ? `e-${field}` : ''].filter(Boolean).join(' ') || undefined;
  const fieldClass = (field) => `field ${errors[field] ? 'border-warn' : ''}`;

  return (
    <div>
      {collapsed && (
        <div className="rounded border border-line bg-surface p-3">
          <p
            ref={lineRef}
            tabIndex={-1}
            className="break-words font-mono text-[13px] leading-relaxed text-fg-dim focus:outline-none"
          >
            <span className="text-signal">sealed</span> <span className="text-fg">{sealed.hash.slice(0, 7)}</span> ·{' '}
            <span className="font-sans text-[14px] text-fg">{sealed.title}</span> · {rangeLabel(sealed.start, sealed.end, year)} ·{' '}
            {sealed.tasks.length} {sealed.tasks.length === 1 ? 'task' : 'tasks'}
          </p>
          <button
            type="button"
            className="btn mt-3 h-8 px-2.5"
            onClick={() => {
              focusTitle.current = true;
              onReopen();
            }}
          >
            <span aria-hidden="true">+</span> new plan
          </button>
        </div>
      )}

      <div className={`grid transition-[grid-template-rows,opacity] duration-150 ease-out ${collapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'}`}>
        <div className="min-h-0 overflow-hidden" inert={collapsed}>
          <form ref={formRef} onSubmit={submit} onKeyDown={onKeyDown} noValidate className="space-y-4 p-px">
            <div>
              <div className="flex items-baseline justify-between">
                <label htmlFor="f-title" className="label">
                  title
                </label>
                <span className="font-mono text-[11px] text-fg-faint" aria-hidden="true">
                  {title.trim().length}/{LIMITS.title}
                </span>
              </div>
              <input
                id="f-title"
                type="text"
                autoComplete="off"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={LIMITS.title + 20}
                aria-invalid={errors.title ? 'true' : undefined}
                aria-describedby={described('title')}
                className={`${fieldClass('title')} mt-1 font-sans text-[15px]`}
                placeholder="what this range is for"
              />
              <FieldError id="e-title" error={errors.title} />
            </div>

            <fieldset>
              <legend className="label">range</legend>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="f-start" className="sr-only">
                    start date
                  </label>
                  <input
                    id="f-start"
                    type="date"
                    value={range.start}
                    onChange={(e) => onRange({ start: e.target.value, end: range.end })}
                    aria-invalid={errors.start ? 'true' : undefined}
                    aria-describedby={described('start', 'range-hint')}
                    className={fieldClass('start')}
                  />
                </div>
                <div>
                  <label htmlFor="f-end" className="sr-only">
                    end date
                  </label>
                  <input
                    id="f-end"
                    type="date"
                    value={range.end}
                    min={range.start || undefined}
                    onChange={(e) => onRange({ start: range.start, end: e.target.value })}
                    aria-invalid={errors.end ? 'true' : undefined}
                    aria-describedby={described('end', 'range-hint')}
                    className={fieldClass('end')}
                  />
                </div>
              </div>
              <p id="range-hint" className="mt-1 font-mono text-[12px] text-fg-faint">
                start → end, inclusive · synced with the calendar
              </p>
              <FieldError id="e-start" error={errors.start} />
              <FieldError id="e-end" error={errors.end} />
            </fieldset>

            <div>
              <div className="flex items-baseline justify-between">
                <label htmlFor="f-tasks" className="label">
                  tasks
                </label>
                <span id="tasks-count" className={`font-mono text-[11px] ${parsed.length > LIMITS.tasks ? 'text-warn' : 'text-fg-faint'}`}>
                  → {parsed.length} {parsed.length === 1 ? 'task' : 'tasks'}
                </span>
              </div>
              <textarea
                id="f-tasks"
                rows={5}
                value={tasks}
                onChange={(e) => setTasks(e.target.value)}
                aria-invalid={errors.tasks ? 'true' : undefined}
                aria-describedby={described('tasks', 'tasks-hint tasks-count')}
                className={`${fieldClass('tasks')} mt-1 resize-y leading-relaxed`}
                placeholder={'- [ ] one task per line\n- [ ] markdown prefixes are fine'}
              />
              <p id="tasks-hint" className="mt-1 font-mono text-[12px] text-fg-faint">
                one per line · up to {LIMITS.tasks}
              </p>
              <FieldError id="e-tasks" error={errors.tasks} />
            </div>

            <div>
              <label htmlFor="f-notes" className="label">
                notes <span className="normal-case tracking-normal">(optional)</span>
              </label>
              <textarea
                id="f-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                aria-invalid={errors.notes ? 'true' : undefined}
                aria-describedby={described('notes')}
                className={`${fieldClass('notes')} mt-1 resize-y font-sans text-[15px]`}
              />
              <FieldError id="e-notes" error={errors.notes} />
            </div>

            <div>
              <label htmlFor="f-tag" className="label">
                tag <span className="normal-case tracking-normal">(optional)</span>
              </label>
              <input
                id="f-tag"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={tag}
                onChange={(e) => setTag(e.target.value.toLowerCase())}
                aria-invalid={errors.tag ? 'true' : undefined}
                aria-describedby={described('tag', 'tag-hint')}
                className={`${fieldClass('tag')} mt-1`}
                placeholder="e.g. thesis"
              />
              <p id="tag-hint" className="mt-1 font-mono text-[12px] text-fg-faint">
                a-z 0-9 - · max {LIMITS.tag}
              </p>
              <FieldError id="e-tag" error={errors.tag} />
            </div>

            {formError && (
              <p className="rounded border border-warn/60 px-3 py-2 font-mono text-[12px] text-warn" role="alert">
                <span aria-hidden="true">✗ </span>not sealed: {formError}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" className="btn btn-primary" disabled={saving} aria-describedby="seal-hint">
                {saving ? 'sealing…' : 'seal'}
              </button>
              <span id="seal-hint" className="font-mono text-[12px] text-fg-faint">
                <kbd className="kbd">Ctrl</kbd> <kbd className="kbd">Enter</kbd> · sealed plans are immutable
              </span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
