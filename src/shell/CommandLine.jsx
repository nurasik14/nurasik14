/* The command line: a modal sheet that rises from the statusline.
 * Opened with ":", "/" or Ctrl/Cmd+K; mounted only while open, so every
 * opening starts fresh. Esc closes and returns focus to the opener. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { PROFILE } from '../config/portfolio.config';
import { copyText, CV_HREF, pad2, PAGES, scrollToId } from '../lib/nav';

const openTab = (href) => window.open(href, '_blank', 'noopener,noreferrer');

function buildCommands({ page, sections, go, flash }) {
  const here = (p) => (p === page ? ' (here, scrolls to top)' : '');
  return [
    ...sections.map((s, i) => ({
      name: s.label,
      desc: `jump to ## ${pad2(s.key ?? i + 1)} ${s.label}`,
      keys: [s.key ?? String(i + 1)],
      run: () => scrollToId(s.id),
    })),
    { name: 'index', desc: `open ${PAGES.index.buffer}, the portfolio${here('index')}`, keys: ['g', 'i'], run: () => go('index') },
    { name: 'planner', desc: `open ${PAGES.planner.buffer}${here('planner')}`, keys: ['g', 'p'], run: () => go('planner') },
    { name: 'cv', desc: `open ${PROFILE.cv}`, run: () => openTab(CV_HREF) },
    {
      name: 'email',
      desc: `yank ${PROFILE.email} to the clipboard`,
      run: () =>
        copyText(PROFILE.email).then(
          () => flash('yanked email', 'ok'),
          () => flash(`copy blocked: ${PROFILE.email}`, 'warn'),
        ),
    },
    ...PROFILE.links.map((l) => ({
      name: l.prefix.replace(/\/$/, ''),
      desc: `${new URL(l.href).host.replace(/^www\./, '')}/${l.label}`,
      run: () => openTab(l.href),
    })),
  ];
}

const FOCUSABLE = 'input, button, [href], [tabindex]:not([tabindex="-1"])';

export default function CommandLine({ prefix = ':', page, sections, go, flash, onClose }) {
  const [value, setValue] = useState(prefix);
  const [sel, setSel] = useState(0);
  const sheetRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const pendingRef = useRef(null);

  const commands = useMemo(() => buildCommands({ page, sections, go, flash }), [page, sections, go, flash]);
  const query = value.replace(/^[:/]/, '').trim().toLowerCase();
  const shown = useMemo(() => {
    if (!query) return commands;
    const rank = (c) => (c.name.startsWith(query) ? 0 : c.name.includes(query) ? 1 : c.desc.toLowerCase().includes(query) ? 2 : -1);
    return commands
      .map((c, i) => ({ c, r: rank(c), i }))
      .filter((x) => x.r >= 0)
      .sort((a, b) => a.r - b.r || a.i - b.i)
      .map((x) => x.c);
  }, [commands, query]);
  const active = Math.min(sel, Math.max(shown.length - 1, 0));

  // Focus the input; on close, give focus back to the opener first and only
  // then run the chosen command (which may move focus to a section).
  useEffect(() => {
    const opener = document.activeElement;
    const input = inputRef.current;
    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);
    return () => {
      if (opener && opener !== document.body) opener.focus?.({ preventScroll: true });
      const run = pendingRef.current;
      pendingRef.current = null;
      run?.();
    };
  }, []);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, shown]);

  const run = (c) => {
    if (c) pendingRef.current = c.run;
    else if (query) pendingRef.current = () => flash(`E492: not an editor command: ${query}`, 'warn');
    onClose();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel(shown.length ? (active + 1) % shown.length : 0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel(shown.length ? (active - 1 + shown.length) % shown.length : 0);
    } else if (e.key === 'Enter' && e.target === inputRef.current) {
      e.preventDefault();
      run(shown[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Tab') {
      // Focus trap: cycle within the sheet.
      const items = [...sheetRef.current.querySelectorAll(FOCUSABLE)];
      const i = items.indexOf(document.activeElement);
      e.preventDefault();
      items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length]?.focus();
    }
  };

  return (
    <>
      <div aria-hidden className="fixed inset-0 z-40 bg-bg/70" onMouseDown={() => onClose()} />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command line"
        data-cmdline
        onKeyDown={onKeyDown}
        className="anim-rise fixed inset-x-0 bottom-7 z-50 border-t border-line-strong bg-surface shadow-2xl"
      >
        <div className="wrap">
          <div className="flex items-center justify-between border-b border-line-soft py-2">
            <span className="label">commands</span>
            <span className="font-mono text-[12px] text-fg-faint">
              {shown.length}/{commands.length}
            </span>
          </div>
          {shown.length ? (
            <ul ref={listRef} id="cmdline-list" role="listbox" aria-label="Commands" className="max-h-[min(50vh,22rem)] overflow-y-auto py-1">
              {shown.map((c, i) => {
                const on = i === active;
                return (
                  <li
                    key={c.name}
                    id={`cmdline-opt-${c.name}`}
                    role="option"
                    aria-selected={on}
                    onMouseMove={() => setSel(i)}
                    onClick={() => run(c)}
                    className={`grid cursor-pointer grid-cols-[11ch_minmax(0,1fr)_auto] items-center gap-x-4 rounded px-2 py-1.5 font-mono text-[13px] ${
                      on ? 'bg-surface-2 text-fg shadow-[inset_2px_0_0_rgb(var(--signal))]' : 'text-fg-dim'
                    }`}
                  >
                    <span className="text-fg">
                      <span className="text-fg-faint">:</span>
                      {c.name}
                    </span>
                    <span className="truncate text-fg-dim">{c.desc}</span>
                    <span className="flex gap-1">
                      {c.keys?.map((k) => (
                        <kbd key={k} className="kbd">
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-3 font-mono text-[13px] text-fg-dim">
              no match. Enter reports it; try <span className="text-fg">:projects</span> or <span className="text-fg">:email</span>.
            </p>
          )}
          <div className="flex items-center gap-3 border-t border-line-soft py-2 focus-within:border-signal/60">
            <label htmlFor="cmdline-input" className="sr-only">
              Command
            </label>
            <input
              ref={inputRef}
              id="cmdline-input"
              type="text"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setSel(0);
              }}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              role="combobox"
              aria-expanded={shown.length > 0}
              aria-controls="cmdline-list"
              aria-autocomplete="list"
              aria-activedescendant={shown.length ? `cmdline-opt-${shown[active].name}` : undefined}
              className="min-w-0 flex-1 bg-transparent py-1 font-mono text-[14px] text-fg caret-signal outline-none"
            />
            <span aria-hidden className="hidden gap-3 font-mono text-[12px] text-fg-faint sm:flex">
              <span>↑↓ select</span>
              <span>↵ run</span>
            </span>
            <button type="button" onClick={() => onClose()} className="btn h-7 px-2 text-[12px]">
              esc
              <span className="sr-only"> close command line</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
