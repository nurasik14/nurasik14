// Vim-style statusline, fixed to the bottom. Every segment reports real state.
import { useEffect, useState } from 'react';
import { pad2 } from '../lib/nav';

const MODE_CLS = {
  NORMAL: 'bg-signal text-signal-ink',
  INSERT: 'bg-ok text-signal-ink',
  READONLY: 'bg-info text-signal-ink',
  SEALED: 'bg-signal text-signal-ink',
};
const TONE_CLS = { ok: 'text-ok', info: 'text-info', warn: 'text-warn', signal: 'text-signal' };

function useScrollPercent() {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    let raf = 0;
    const calc = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setPct(max > 0 ? Math.min(100, Math.max(0, Math.round((window.scrollY / max) * 100))) : 100);
    };
    const queue = () => {
      if (!raf) raf = requestAnimationFrame(calc);
    };
    calc();
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    // Disclosures change the page height without a scroll event.
    const ro = 'ResizeObserver' in window ? new ResizeObserver(queue) : null;
    ro?.observe(document.body);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', queue);
      window.removeEventListener('resize', queue);
      ro?.disconnect();
    };
  }, []);
  return pct;
}

export default function StatusLine({ mode, buffer, section, msg }) {
  const pct = useScrollPercent();
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex h-7 items-stretch border-t border-line bg-surface font-mono text-[12px] leading-[27px] text-fg-dim">
      <span
        className={`shrink-0 px-2.5 font-semibold tracking-[0.06em] transition-colors duration-150 ease-out ${MODE_CLS[mode] ?? MODE_CLS.NORMAL}`}
      >
        <span className="sr-only">mode </span>
        {mode}
      </span>
      <span className="shrink-0 border-r border-line px-3 text-fg">
        <span className="sr-only">buffer </span>
        {buffer}
      </span>
      {section && (
        <span className="hidden shrink-0 px-3 sm:inline">
          <span className="text-fg-faint">## </span>
          <span className="text-signal">{pad2(section.key)}</span> {section.label}
        </span>
      )}
      <span
        role="status"
        aria-live="polite"
        className={`ml-auto min-w-0 truncate px-3 ${msg ? (TONE_CLS[msg.tone] ?? TONE_CLS.info) : ''}`}
      >
        {msg?.text}
      </span>
      <span className="hidden shrink-0 border-l border-line px-3 sm:inline">utf-8</span>
      <span className="hidden w-[7ch] shrink-0 border-l border-line pr-3 text-right text-fg sm:inline">
        <span className="sr-only">scrolled </span>
        {pct}%
      </span>
    </div>
  );
}
