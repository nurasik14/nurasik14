import React from 'react';
import AppShell, { useShell } from '../shell/AppShell';
import { sortPlans } from '../../plugins/planner-core.js';
import Calendar from './Calendar.jsx';
import Composer from './Composer.jsx';
import GooglePanel from './GooglePanel.jsx';
import PlanDetail from './PlanDetail.jsx';
import PlanLog from './PlanLog.jsx';
import { compareDates, monthGrid, monthOf, parseMonth, shortDate, today as localToday } from './dates.js';
import { connectMessage, loadGoogleEvents } from './google.js';
import { deletePlan, loadPlans, setTaskDone } from './store.js';

const PUBLISH_CMD = 'git add public/data/plans.json public/data/google-events.json && git commit -m "plans: update" && git push';
const GOOGLE_PREF = 'planner.googleEvents';

function readGooglePref() {
  try {
    return window.localStorage.getItem(GOOGLE_PREF) !== 'off';
  } catch {
    return true;
  }
}

/** ?google=connected|error&reason=… from the OAuth callback; removed once read. */
function takeGoogleParam() {
  const url = new URL(window.location.href);
  const result = url.searchParams.get('google');
  if (!result) return null;
  const reason = url.searchParams.get('reason');
  url.searchParams.delete('google');
  url.searchParams.delete('reason');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  return { result, reason };
}

const pulledLabel = (iso) => {
  const dt = new Date(iso);
  return Number.isNaN(dt.getTime()) ? iso : shortDate(localToday(dt), dt.getFullYear() !== new Date().getFullYear());
};

function readUrl() {
  const url = new URL(window.location.href);
  const m = url.searchParams.get('m');
  const hash = /^#plan-([0-9a-f]{4,64})$/.exec(url.hash);
  return { month: parseMonth(m) ? m : null, planId: hash ? hash[1] : null };
}

function writeUrl(month, planId) {
  const url = new URL(window.location.href);
  url.searchParams.set('m', month);
  url.hash = planId ? `plan-${planId}` : '';
  const next = `${url.pathname}${url.search}${url.hash}`;
  if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    window.history.replaceState(window.history.state, '', next);
  }
}

const isTyping = (el) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// No shortcut numbers here: the page does not register shell sections, and a
// number that is not a working shortcut would be a fake control.
function SectionHeading({ id, children, aside }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-line pt-4">
      <h2 id={id} className="font-mono text-[15px] font-medium text-fg">
        <span className="text-fg-faint" aria-hidden="true">
          ##{' '}
        </span>
        {children}
      </h2>
      {aside}
    </div>
  );
}

function ModeBadge({ status, mode }) {
  const [text, cls] =
    status === 'loading'
      ? ['detecting…', 'border-line text-fg-faint']
      : status === 'error'
        ? ['no data', 'border-warn/60 text-warn']
        : mode === 'local'
          ? ['local · rw', 'border-ok/60 text-ok']
          : ['pages · read-only', 'border-info/60 text-info'];
  return <span className={`inline-flex h-6 items-center rounded border px-2 font-mono text-[12px] ${cls}`}>{text}</span>;
}

function PublishCommand() {
  const { flash } = useShell();
  const [copied, setCopied] = React.useState(false);
  const codeRef = React.useRef(null);

  React.useEffect(() => {
    if (!copied) return undefined;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(PUBLISH_CMD);
      setCopied(true);
      flash('copied publish command', 'ok');
    } catch {
      const sel = window.getSelection();
      sel.selectAllChildren(codeRef.current);
      flash('clipboard blocked · command selected, press Ctrl C', 'warn');
    }
  }

  return (
    <div className="mt-3 flex max-w-[52rem] items-stretch overflow-hidden rounded border border-line bg-surface">
      <code ref={codeRef} className="min-w-0 flex-1 whitespace-pre-wrap break-words px-3 py-2 font-mono text-[12.5px] leading-relaxed text-fg-dim">
        <span className="select-none text-fg-faint" aria-hidden="true">
          ${' '}
        </span>
        {PUBLISH_CMD}
      </code>
      <button type="button" onClick={copy} className="shrink-0 border-l border-line px-3 font-mono text-[12px] text-fg-dim hover:bg-surface-2 hover:text-fg">
        {copied ? '✓ copied' : 'copy'}
      </button>
    </div>
  );
}

function PlannerPage({ data, setPlans, reload, refresh }) {
  const shell = useShell();
  const { flash } = shell;
  const shellRef = React.useRef(shell);
  React.useEffect(() => {
    shellRef.current = shell;
  });

  const [today] = React.useState(() => localToday());
  const year = Number(today.slice(0, 4));
  const [initialUrl] = React.useState(readUrl);
  const [month, setMonth] = React.useState(initialUrl.month ?? monthOf(today));
  const [selectedId, setSelectedId] = React.useState(initialUrl.planId);
  const [range, setRange] = React.useState({ start: '', end: '' });
  const [lastSealed, setLastSealed] = React.useState(null);
  const detailRef = React.useRef(null);
  const revealOnLoad = React.useRef(Boolean(initialUrl.planId));

  const { status, mode, plans } = data;
  const local = status === 'ready' && mode === 'local';
  const selected = plans.find((p) => p.id === selectedId) ?? null;

  // Google overlay: a static file, so Pages shows it too. null = never pulled.
  const [google, setGoogle] = React.useState(null);
  const [googleOn, setGoogleOn] = React.useState(readGooglePref);
  const reloadGoogle = React.useCallback(() => loadGoogleEvents().then(setGoogle), []);
  React.useEffect(() => {
    reloadGoogle();
  }, [reloadGoogle]);
  function toggleGoogle() {
    const next = !googleOn;
    setGoogleOn(next);
    try {
      window.localStorage.setItem(GOOGLE_PREF, next ? 'on' : 'off');
    } catch {
      // Private mode: the toggle still works for this visit.
    }
  }
  const onSynced = React.useCallback(() => {
    reloadGoogle();
    refresh();
  }, [reloadGoogle, refresh]);

  React.useEffect(() => {
    const param = takeGoogleParam();
    if (!param) return;
    const [text, tone] = connectMessage(param.result, param.reason);
    shellRef.current.flash(text, tone);
  }, []);

  // Let the shell pick up READONLY / NORMAL once the mode is known.
  React.useEffect(() => {
    if (status === 'ready') shellRef.current.setMode(null);
  }, [status, mode]);

  React.useEffect(() => writeUrl(month, selected ? selectedId : null), [month, selectedId, selected]);

  const reveal = React.useCallback(() => {
    requestAnimationFrame(() => {
      const el = detailRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.top < 48 || r.top > window.innerHeight - 120) el.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
    });
  }, []);

  const showPlanMonth = React.useCallback(
    (plan) => {
      const weeks = monthGrid(month);
      const visible = compareDates(plan.end, weeks[0].days[0]) >= 0 && compareDates(plan.start, weeks.at(-1).days[6]) <= 0;
      if (!visible) setMonth(monthOf(plan.start));
    },
    [month],
  );

  const selectPlan = React.useCallback(
    (id) => {
      setSelectedId(id);
      const plan = plans.find((p) => p.id === id);
      if (plan) showPlanMonth(plan);
      reveal();
    },
    [plans, showPlanMonth, reveal],
  );

  // Deep link: #plan-<id> on load (month adjusted during render, once) and on hashchange.
  const [loadHandled, setLoadHandled] = React.useState(false);
  if (status === 'ready' && !loadHandled) {
    setLoadHandled(true);
    const plan = plans.find((p) => p.id === initialUrl.planId);
    if (plan && !initialUrl.month) setMonth(monthOf(plan.start));
  }
  React.useEffect(() => {
    if (status !== 'ready' || !revealOnLoad.current) return;
    revealOnLoad.current = false;
    if (plans.some((p) => p.id === initialUrl.planId)) reveal();
    else flash(`no plan ${initialUrl.planId}`, 'warn');
  }, [status, plans, initialUrl, flash, reveal]);

  React.useEffect(() => {
    const onHash = () => {
      const { planId } = readUrl();
      if (planId) selectPlan(planId);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [selectPlan]);

  // Esc clears a range selection from anywhere outside a text field.
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented || isTyping(e.target)) return;
      setRange((r) => (r.start || r.end ? { start: '', end: '' } : r));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function onRange(next) {
    setRange(next);
    if (next.start) setLastSealed(null);
  }

  function onSealed(plan) {
    setPlans((ps) => sortPlans([...ps, plan]));
    setSelectedId(plan.id);
    setRange({ start: '', end: '' });
    setLastSealed(plan);
  }

  function onToggle(plan, index, done) {
    const patchTask = (source) => (ps) =>
      ps.map((p) => (p.id === plan.id ? { ...p, tasks: p.tasks.map((t, i) => (i === index ? source(t) : t)) } : p));
    const before = plan.tasks[index];
    setPlans(patchTask((t) => ({ ...t, done, doneAt: done ? (t.doneAt ?? new Date().toISOString()) : null })));
    setTaskDone(plan.id, index, done).then(
      (saved) => setPlans(patchTask(() => saved.tasks[index])),
      (err) => {
        setPlans(patchTask(() => before));
        flash(`task not saved: ${err.message}`, 'warn');
      },
    );
  }

  async function onDelete(plan) {
    try {
      await deletePlan(plan.id);
      setPlans((ps) => ps.filter((p) => p.id !== plan.id));
      setSelectedId(null);
      if (lastSealed?.id === plan.id) setLastSealed(null);
      flash(`broke seal ${plan.hash.slice(0, 7)} · removed from plans.json`, 'warn');
      document.getElementById('h-log-focus')?.focus();
    } catch (err) {
      flash(`seal not broken: ${err.message}`, 'warn');
    }
  }

  return (
    <div className="wrap pb-16 pt-8 sm:pt-12">
      <header>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="font-mono text-[26px] font-medium tracking-[-0.01em] text-fg sm:text-[30px]">
            <span className="text-fg-faint" aria-hidden="true">
              ##{' '}
            </span>
            planner.cal
          </h1>
          <ModeBadge status={status} mode={mode} />
        </div>
        <p className="mt-2 max-w-[64ch] text-fg-dim">
          {status === 'loading' && 'Reading plans…'}
          {status === 'error' && 'Plans could not be read.'}
          {local && (
            <>
              Sealed plans are written to <code className="font-mono text-[14px] text-fg">public/data/plans.json</code>. Commit and push to publish.
            </>
          )}
          {status === 'ready' && mode === 'readonly' && (
            <>
              Read-only snapshot, published from my machine.
              {google && (
                <span className="font-mono text-[13px] text-fg-faint">
                  {' '}
                  google events · pulled <time dateTime={google.pulledAt}>{pulledLabel(google.pulledAt)}</time>
                </span>
              )}
            </>
          )}
        </p>
        {local && <PublishCommand />}
        {local && <GooglePanel onSynced={onSynced} />}
      </header>

      <div
        className={`mt-10 grid gap-x-10 gap-y-16 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_23rem] ${local ? '' : 'lg:grid-rows-[auto_1fr]'}`}
      >
        <section id="calendar" aria-labelledby="h-calendar" className="min-w-0 scroll-mt-16">
          <SectionHeading id="h-calendar">
            calendar
          </SectionHeading>
          <Calendar
            month={month}
            onMonth={setMonth}
            plans={plans}
            today={today}
            editable={local}
            range={range}
            onRange={onRange}
            selectedId={selectedId}
            onSelectPlan={selectPlan}
            google={google}
            googleOn={googleOn}
            onGoogleToggle={toggleGoogle}
          />
        </section>

        {local && (
          <section id="compose" aria-labelledby="h-compose" className="min-w-0 scroll-mt-16">
            <SectionHeading id="h-compose">
              seal
            </SectionHeading>
            <Composer
              range={range}
              onRange={onRange}
              sealed={lastSealed}
              onSealed={onSealed}
              onReopen={() => setLastSealed(null)}
              year={year}
            />
          </section>
        )}

        <section id="log" aria-labelledby="h-log" className="min-w-0 scroll-mt-16 lg:col-start-1">
          <SectionHeading id="h-log" aside={status === 'ready' && plans.length > 0 && <span className="font-mono text-[12px] text-fg-faint">{plans.length} sealed</span>}>
            <span tabIndex={-1} className="focus:outline-none" id="h-log-focus">
              log
            </span>
          </SectionHeading>
          <PlanLog
            status={status}
            error={data.error}
            onRetry={reload}
            plans={plans}
            mode={mode}
            today={today}
            year={year}
            selectedId={selectedId}
            onSelect={selectPlan}
          />
        </section>

        <aside
          id="plan-detail"
          ref={detailRef}
          aria-label="selected plan"
          aria-live="polite"
          aria-atomic="false"
          className={`min-w-0 scroll-mt-16 self-start rounded border border-line bg-surface p-4 sm:p-5 lg:sticky lg:top-16 lg:col-start-2 ${local ? 'lg:row-start-2' : 'lg:row-span-2 lg:row-start-1'}`}
        >
          {status === 'ready' ? (
            <PlanDetail plan={selected} mode={mode} year={year} onToggle={onToggle} onDelete={onDelete} />
          ) : (
            <p className="font-mono text-[13px] text-fg-faint">{status === 'loading' ? 'loading…' : 'nothing to show'}</p>
          )}
        </aside>
      </div>
    </div>
  );
}

export default function PlannerApp() {
  const [data, setData] = React.useState({ status: 'loading', mode: null, plans: [], error: '' });
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let live = true;
    loadPlans().then(
      (r) => live && setData({ status: 'ready', mode: r.mode, plans: r.plans, error: '' }),
      (err) => live && setData({ status: 'error', mode: null, plans: [], error: err.message }),
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  const load = React.useCallback(() => {
    setData((d) => ({ ...d, status: 'loading', error: '' }));
    setAttempt((n) => n + 1);
  }, []);

  const setPlans = React.useCallback((fn) => setData((d) => ({ ...d, plans: fn(d.plans) })), []);

  // Re-read plans without the loading state (after a sync); errors keep the current view.
  const refresh = React.useCallback(() => {
    loadPlans().then(
      (r) => setData((d) => ({ ...d, mode: r.mode, plans: r.plans })),
      () => {},
    );
  }, []);

  return (
    <AppShell page="planner" defaultMode={data.mode === 'readonly' ? 'READONLY' : 'NORMAL'}>
      <PlannerPage data={data} setPlans={setPlans} reload={load} refresh={refresh} />
    </AppShell>
  );
}
