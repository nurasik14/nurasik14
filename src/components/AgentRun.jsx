/* Hero panel: an agent answers "who is this?" with real tool calls.
 * Steps resolve one by one on load; reduced motion shows the finished run. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AGENT_RUN, DQN_RUNS } from '../config/portfolio.config';
import { stepPath } from '../lib/chart';
import { prefersReducedMotion } from '../lib/nav';
import { Check, LoaderCircle, Wrench } from './icons';

function Spark() {
  const pts = DQN_RUNS.double;
  const [lastX, lastY] = pts.at(-1);
  const w = 280, h = 34;
  const sx = (x) => 2 + (x / lastX) * (w - 8);
  const sy = (y) => h - 4 - ((y - pts[0][1]) / (lastY - pts[0][1])) * (h - 8);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} aria-hidden className="mt-1.5 block h-[34px] w-full max-w-[280px]">
      <path d={stepPath(pts, sx, sy)} fill="none" stroke="#22c55e" strokeWidth="1.6" />
      <circle cx={sx(lastX)} cy={sy(lastY)} r="3.5" fill="#22c55e" stroke="#000" strokeWidth="2" />
    </svg>
  );
}

function Out({ value }) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return (
      <>
        [{value.map((v, i) => (
          <span key={v}>{i > 0 && ', '}<span className="text-neutral-300">"{v}"</span></span>
        ))}]
      </>
    );
  }
  const entries = Object.entries(value);
  return (
    <>
      {'{ '}
      {entries.map(([k, v], i) => (
        <span key={k}>
          <span className="text-term-cyan">{k}</span>: <span className="text-neutral-300">"{v}"</span>
          {i < entries.length - 1 && ', '}
        </span>
      ))}
      {' }'}
    </>
  );
}

export default function AgentRun() {
  const { prompt, steps, answer } = AGENT_RUN;
  const [done, setDone] = useState(() => (prefersReducedMotion() ? steps.length : 0));
  const timers = useRef([]);

  // resolve calls 1..n on a timer; the caller resets `done` first
  const schedule = useCallback(() => {
    timers.current.forEach(clearTimeout);
    if (prefersReducedMotion()) return;
    timers.current = steps.map((_, i) => setTimeout(() => setDone(i + 1), 700 + i * 750));
  }, [steps]);

  const play = useCallback(() => {
    setDone(prefersReducedMotion() ? steps.length : 0);
    schedule();
  }, [schedule, steps]);

  useEffect(() => {
    schedule();
    const onReplay = () => play();
    window.addEventListener('agentrun:replay', onReplay);
    return () => {
      timers.current.forEach(clearTimeout);
      window.removeEventListener('agentrun:replay', onReplay);
    };
  }, [schedule, play]);

  return (
    <section
      aria-label="Agent run that summarizes my work"
      className="overflow-hidden rounded-[10px] border border-line bg-panel shadow-[0_0_0_1px_rgba(34,197,94,.04),0_24px_60px_-30px_rgba(34,197,94,.25)]"
    >
      <div className="flex items-center gap-3 border-b border-line bg-[#0d0d0d] px-3.5 py-2.5 font-mono text-xs text-fg-dim">
        <span aria-hidden className="flex gap-1.5">
          {[0, 1, 2].map((i) => <i key={i} className="size-[9px] rounded-full bg-line" />)}
        </span>
        <span>agent.run</span>
        <span className="ml-auto flex items-center gap-2 tabular-nums">
          <span aria-live="polite">{done}/{steps.length} tool calls</span>
          <button type="button" onClick={play} className="border-b border-dotted border-neutral-600 hover:text-neutral-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-term-green">
            replay
          </button>
        </span>
      </div>
      <p className="px-4 pb-1.5 pt-4 font-mono text-sm">
        <span className="text-term-cyan">&gt;</span> {prompt}
      </p>
      <div className="grid gap-1.5 px-2.5 pb-3 pt-1.5">
        {steps.map((s, i) => {
          const ok = i < done;
          return (
            <div key={s.fn} className="rounded-lg border border-line-soft bg-black">
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 px-2.5 py-2 font-mono text-[13px]">
                <Wrench className="size-4 text-neutral-600" />
                <span className="break-words">
                  <span className="text-neutral-200">{s.fn}</span>
                  <span className="text-neutral-600">(</span>
                  <span className="text-term-cyan">{s.arg}</span>
                  <span className="text-neutral-600">)</span>
                </span>
                {ok ? (
                  <Check className="size-4 text-term-green" aria-label="done" />
                ) : (
                  <LoaderCircle className="size-4 animate-spin text-term-amber motion-reduce:animate-none" aria-label="running" />
                )}
              </div>
              {ok && (
                <div className="break-words pb-2.5 pl-[38px] pr-3 font-mono text-[12.5px] leading-[1.65] text-neutral-400">
                  <Out value={s.out} />
                  {s.spark && <Spark />}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {done === steps.length && (
        <p className="mx-2.5 mb-3.5 border-l-2 border-term-green px-3.5 py-3 font-sans text-[14.5px] leading-relaxed text-neutral-300">
          {answer}
        </p>
      )}
    </section>
  );
}
