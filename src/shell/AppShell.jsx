/* The workbench shell shared by index.md (portfolio) and planner.cal.
 * Contract: docs/DESIGN.md "Shell". Public API (keep stable):
 *   <AppShell page="index"|"planner" sections={[{ id, label, key }]} defaultMode="NORMAL">
 *   useShell() -> { mode, setMode(name|null), flash(text, tone?), registerCommands(list) -> unregister }
 *   useCommands([{ name, desc, keys?, run }]) adds page commands to the command line
 * Layout: with `sections`, the shell wraps children in the page column (.wrap)
 * next to the outline rail; without them, children own their width. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PROFILE } from '../config/portfolio.config';
import { isTypingTarget, PAGES, scrollToId } from '../lib/nav';
import { BUILD } from './build';
import CommandLine from './CommandLine';
import { ShellContext } from './context';
import OutlineRail from './OutlineRail';
import StatusLine from './StatusLine';
import TopBar from './TopBar';

// Part of the public API (pages import useShell from here).
// oxlint-disable-next-line react/only-export-components
export { useCommands, useShell } from './context';

const FLASH_MS = 4000;

// The section whose top has crossed 60% of the viewport most recently is the
// current one. IntersectionObserver keeps this off the scroll handler.
function useCurrentSection(sections) {
  const [current, setCurrent] = useState(null);
  const ids = sections.map((s) => s.id).join(' ');
  useEffect(() => {
    if (!ids || !('IntersectionObserver' in window)) return undefined;
    const order = ids.split(' ');
    const visible = new Set();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        setCurrent(order.findLast((id) => visible.has(id)) ?? null);
      },
      { rootMargin: '-56px 0px -40% 0px' },
    );
    for (const id of order) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [ids]);
  return sections.find((s) => s.id === current) ?? null;
}

// INSERT while a text control has focus. relatedTarget on focusout is the
// element receiving focus, so moving between two fields never flickers.
function useTyping() {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const check = (el) => isTypingTarget(el) && !el.readOnly && !el.closest('[data-cmdline]');
    const onIn = (e) => setTyping(check(e.target));
    const onOut = (e) => setTyping(check(e.relatedTarget));
    // A focused field that gets removed from the DOM fires no focusout in every browser.
    const recheck = () => setTimeout(() => setTyping(check(document.activeElement)), 0);
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    document.addEventListener('pointerdown', recheck, true);
    return () => {
      document.removeEventListener('focusin', onIn);
      document.removeEventListener('focusout', onOut);
      document.removeEventListener('pointerdown', recheck, true);
    };
  }, []);
  return typing;
}

function Footer() {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="wrap flex flex-wrap justify-between gap-x-6 gap-y-1 py-6 font-mono text-[12px] text-fg-faint">
        <span>
          {PROFILE.name} · {PROFILE.location}
        </span>
        <span>
          build <span className="text-fg-dim">{BUILD.commit}</span>
          {BUILD.date && <> · <time dateTime={BUILD.date}>{BUILD.date}</time></>}
        </span>
      </div>
    </footer>
  );
}

export default function AppShell({ page = 'index', sections = [], defaultMode = 'NORMAL', children }) {
  const [override, setOverride] = useState(null);
  const [msg, setMsg] = useState(null);
  const [cmd, setCmd] = useState(null); // null, or the prefix the command line opened with
  const typing = useTyping();
  const current = useCurrentSection(sections);

  const base = override ?? defaultMode;
  const mode = base === 'SEALED' ? base : typing ? 'INSERT' : base;

  const setMode = useCallback((m) => setOverride(m ?? null), []);
  const flash = useCallback((text, tone = 'info') => setMsg({ text, tone, id: Math.random() }), []);
  // Page commands registered through useCommands(); each registration is removed on unmount.
  const [registered, setRegistered] = useState([]);
  const registerCommands = useCallback((commands) => {
    const entry = { commands };
    setRegistered((xs) => [...xs, entry]);
    return () => setRegistered((xs) => xs.filter((x) => x !== entry));
  }, []);
  const pageCommands = useMemo(() => registered.flatMap((x) => x.commands), [registered]);
  const ctx = useMemo(() => ({ mode, setMode, flash, registerCommands }), [mode, setMode, flash, registerCommands]);

  useEffect(() => {
    if (!msg) return undefined;
    const t = setTimeout(() => setMsg(null), FLASH_MS);
    return () => clearTimeout(t);
  }, [msg]);

  // The browser tries the URL hash before React has rendered the target; retry once mounted.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
  }, []);

  const go = useCallback(
    (target) => {
      if (target === page) window.scrollTo({ top: 0, behavior: 'auto' });
      else window.location.assign(PAGES[target].href);
    },
    [page],
  );

  // Global keys. Ctrl/Cmd+K works everywhere; the rest are ignored while typing.
  const cmdOpen = cmd !== null;
  const cmdOpenRef = useRef(cmdOpen);
  useEffect(() => {
    cmdOpenRef.current = cmdOpen;
  }, [cmdOpen]);
  useEffect(() => {
    let gAt = 0;
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmd((c) => (c === null ? ':' : null));
        return;
      }
      if (cmdOpenRef.current || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (e.key === ':' || e.key === '/') {
        e.preventDefault();
        setCmd(e.key);
        return;
      }
      if (e.key === 'g') {
        gAt = e.timeStamp;
        return;
      }
      const chord = e.timeStamp - gAt < 1000;
      gAt = 0;
      if (chord && (e.key === 'i' || e.key === 'p')) {
        e.preventDefault();
        go(e.key === 'i' ? 'index' : 'planner');
        return;
      }
      if (/^[1-9]$/.test(e.key)) {
        const s = sections.find((x, i) => (x.key ?? String(i + 1)) === e.key);
        if (s && scrollToId(s.id)) e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sections, go]);

  const hasRail = sections.length > 0;

  return (
    <ShellContext.Provider value={ctx}>
      <div className="flex min-h-screen flex-col pb-7" data-page={page}>
        <a
          href="#main"
          className="sr-only z-50 font-mono text-[13px] focus:not-sr-only focus:fixed focus:left-4 focus:top-2 focus:rounded focus:bg-signal focus:px-3 focus:py-1.5 focus:text-signal-ink"
        >
          Skip to content
        </a>
        <TopBar page={page} cmdOpen={cmdOpen} onCommand={() => setCmd(':')} />
        {hasRail ? (
          <div className="wrap flex-1 min-[1100px]:grid min-[1100px]:grid-cols-[10.5rem_minmax(0,1fr)] min-[1100px]:gap-12">
            <OutlineRail sections={sections} current={current} />
            <main id="main" tabIndex={-1} className="min-w-0 focus:outline-none">
              {children}
            </main>
          </div>
        ) : (
          <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
            {children}
          </main>
        )}
        <Footer />
      </div>
      <StatusLine mode={mode} buffer={PAGES[page]?.buffer ?? page} section={current} msg={msg} />
      {cmdOpen && (
        <CommandLine
          prefix={cmd}
          page={page}
          sections={sections}
          extra={pageCommands}
          go={go}
          flash={flash}
          onClose={() => setCmd(null)}
        />
      )}
    </ShellContext.Provider>
  );
}
