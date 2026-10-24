import React from 'react';
import { NAV, PROFILE, TOPBAR } from '../config/site.config';
import { useClock, useElapsed, fmtDur } from '../lib/hooks';
import { Sparkline, StatusDot, cx } from './ui';

function useJitter() {
  const [s, setS] = React.useState(() => ({
    latency: TOPBAR.latencyBaseMs + 2,
    mem: TOPBAR.memBaseGb + 0.2,
    load: TOPBAR.loadBase + 0.22,
    netIn: TOPBAR.netInBase + 0.44,
    netOut: TOPBAR.netOutBase + 0.22,
    threads: TOPBAR.threadsBase + 2,
    hist: Array.from({ length: 40 }, () => TOPBAR.latencyBaseMs + 2),
  }));
  React.useEffect(() => {
    const id = setInterval(() => {
      setS((p) => {
        const next =
          TOPBAR.latencyBaseMs + Math.round(Math.random() * 6 + (Math.random() > 0.93 ? 22 : 0));
        return {
          latency: next,
          mem: +(TOPBAR.memBaseGb + Math.random() * TOPBAR.memJitterGb).toFixed(2),
          load: +(TOPBAR.loadBase + Math.random() * TOPBAR.loadJitter).toFixed(2),
          netIn: +(TOPBAR.netInBase + Math.random() * TOPBAR.netInJitter).toFixed(2),
          netOut: +(TOPBAR.netOutBase + Math.random() * TOPBAR.netOutJitter).toFixed(2),
          threads: TOPBAR.threadsBase + Math.floor(Math.random() * TOPBAR.threadsJitter),
          hist: [...p.hist.slice(1), next],
        };
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return s;
}

const Field = ({ k, v, tone }) => (
  <span className="flex shrink-0 items-baseline gap-1 whitespace-nowrap">
    <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-neutral-600">{k}:</span>
    <span className={cx('num font-mono text-[10.5px]', tone || 'text-neutral-300')}>{v}</span>
  </span>
);

const Sep = () => <span className="shrink-0 select-none px-1.5 font-mono text-[10px] text-neutral-700">│</span>;

export default function TopBar({ tab, setTab }) {
  const m = useJitter();
  const now = useClock(1000);
  const el = useElapsed();
  const latTone = m.latency > 24 ? 'text-term-amber' : 'text-term-green';

  return (
    <header className="sticky top-0 z-50 border-b border-neutral-800 bg-black/95 backdrop-blur-[2px]">
      {/* ---- row 1: telemetry ticker ---- */}
      <div className="flex h-9 items-center gap-0 overflow-x-auto border-b border-neutral-900 px-2.5 ticker-mask">
        <span className="flex shrink-0 items-center gap-1.5 pr-1">
          <StatusDot tone="green" />
          <span className="font-mono text-[10.5px] font-medium text-neutral-200">
            {PROFILE.handle}@{TOPBAR.host}
          </span>
        </span>
        <Sep />
        <Field k="host" v={TOPBAR.host} />
        <Sep />
        <span className="flex shrink-0 items-center gap-1 whitespace-nowrap">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-neutral-600">status:</span>
          <span className="font-mono text-[10.5px] font-medium text-term-green">ONLINE</span>
        </span>
        <Sep />
        <Field k="uptime" v={TOPBAR.uptime} tone="text-term-green" />
        <Sep />
        <Field k="latency" v={`${m.latency}ms`} tone={latTone} />
        <span className="hidden w-16 shrink-0 px-1 sm:block">
          <Sparkline data={m.hist} h={12} color={m.latency > 24 ? '#f59e0b' : '#22c55e'} strokeWidth={1} />
        </span>
        <Sep />
        <Field k="mem" v={`${m.mem.toFixed(1)}GB / ${TOPBAR.memTotalGb}GB`} />
        <Sep />
        <Field k="load" v={m.load.toFixed(2)} />
        <Sep />
        <Field k="threads" v={m.threads} />
        <Sep />
        <Field k="net" v={`↓${m.netIn} ↑${m.netOut} MB/s`} tone="text-term-cyan" />
        <Sep />
        <Field k="session" v={fmtDur(el)} tone="text-neutral-500" />
        <Sep />
        <Field k="now" v={`${now.toTimeString().slice(0, 8)} UTC+8`} tone="text-neutral-500" />
      </div>

      {/* ---- row 2: cli-flag navigation ---- */}
      <nav className="flex h-9 items-stretch overflow-x-auto px-2.5 ticker-mask">
        <span className="flex shrink-0 items-center pr-1.5 font-mono text-[11px] text-term-green">$</span>
        {NAV.map((n) => {
          const on = tab === n.label;
          return (
            <button
              key={n.flag}
              type="button"
              onClick={() => setTab(n.label)}
              aria-current={on ? 'page' : undefined}
              className={cx(
                'focus-ring group relative flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 font-mono text-[11px] transition-colors duration-75',
                on
                  ? 'border-term-green bg-term-green/[0.07] text-term-green'
                  : 'border-transparent text-neutral-500 hover:bg-[#111] hover:text-neutral-200',
              )}
            >
              <span>{n.flag}</span>
              <span
                className={cx(
                  'text-[9px] border px-1 leading-[14px]',
                  on ? 'border-term-green/40 text-term-green' : 'border-neutral-800 text-neutral-600',
                )}
              >
                {n.key}
              </span>
            </button>
          );
        })}
        <div className="ml-auto hidden shrink-0 items-center gap-2 pl-3 lg:flex">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-neutral-600">
            build {TOPBAR.build} · react 19 · vite
          </span>
          <span className="chip">{TOPBAR.region}</span>
        </div>
      </nav>
    </header>
  );
}
