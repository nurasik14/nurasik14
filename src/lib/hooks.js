import { useCallback, useEffect, useRef, useState } from 'react';

export function useInterval(cb, ms, active = true) {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    if (!active || ms == null) return;
    const id = setInterval(() => ref.current(), ms);
    return () => clearInterval(id);
  }, [ms, active]);
}

export function useClock(ms = 1000) {
  const [now, setNow] = useState(() => new Date());
  useInterval(() => setNow(new Date()), ms);
  return now;
}

export function useCopy(timeout = 1400) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(
    async (text) => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), timeout);
    },
    [timeout],
  );
  return [copied, copy];
}

// Time-on-page; used for the UPTIME field so it reads like a real session.
export function useElapsed() {
  const [sec, setSec] = useState(0);
  useInterval(() => setSec((s) => s + 1), 1000);
  return sec;
}

export const fmtDur = (s) => {
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${ss}`;
};
