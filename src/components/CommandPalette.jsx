/* Ctrl/Cmd+K or "/" palette for jumping around the page.
 * Mounted only while open, so each opening starts with a fresh query. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { PROFILE, PROJECTS } from '../config/portfolio.config';
import { copyEmail, scrollToId, SECTIONS } from '../lib/nav';

const COMMANDS = [
  ...SECTIONS.map((s) => ({ title: s.label, hint: s.key, run: () => scrollToId(s.id) })),
  ...PROJECTS.map((p) => ({
    title: `open ${p.name}()`,
    hint: 'project',
    run: () => {
      window.dispatchEvent(new CustomEvent('toolcall:open', { detail: p.id }));
      scrollToId(p.id);
    },
  })),
  {
    title: 'replay agent run',
    hint: 'hero',
    run: () => {
      scrollToId('top');
      window.dispatchEvent(new Event('agentrun:replay'));
    },
  },
  { title: 'copy email address', hint: 'action', run: () => copyEmail().catch(() => scrollToId('contact')) },
  ...PROFILE.links.map((l) => ({ title: l.href.replace('https://', ''), hint: 'link', run: () => window.open(l.href, '_blank', 'noopener') })),
];

export default function CommandPalette({ onClose }) {
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const shown = useMemo(() => {
    const q = query.toLowerCase().trim();
    return COMMANDS.filter((c) => `${c.title} ${c.hint}`.toLowerCase().includes(q));
  }, [query]);

  useEffect(() => {
    const last = document.activeElement;
    inputRef.current?.focus();
    return () => last?.focus?.();
  }, []);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const run = (c) => {
    if (!c) return;
    onClose();
    c.run();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, shown.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(shown[sel]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Tab') {
      e.preventDefault();
    }
  };

  return (
    <div
      className="fixed inset-0 z-30 grid place-items-start justify-center bg-black/70 px-4 pt-[max(80px,12vh)]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-label="Jump to" className="w-[min(560px,100%)] overflow-hidden rounded-[10px] border border-line bg-panel shadow-[0_30px_80px_-20px_rgba(0,0,0,.9)]">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSel(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Type a section or action"
          autoComplete="off"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={shown.length ? `palette-opt-${sel}` : undefined}
          className="w-full border-b border-line bg-transparent px-4 py-3.5 font-mono text-[15px] text-neutral-200 outline-none placeholder:text-neutral-600"
        />
        {shown.length ? (
          <ul ref={listRef} id="palette-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-1.5">
            {shown.map((c, i) => (
              <li
                key={c.title}
                id={`palette-opt-${i}`}
                role="option"
                aria-selected={i === sel}
                onMouseEnter={() => setSel(i)}
                onClick={() => run(c)}
                className={`flex cursor-pointer justify-between gap-3 rounded-md px-2.5 py-2 font-mono text-[13.5px] ${
                  i === sel ? 'bg-[#0d0d0d] text-neutral-200 shadow-[inset_2px_0_0_#22c55e]' : 'text-fg-dim'
                }`}
              >
                <span>{c.title}</span>
                <small className="text-neutral-600">{c.hint}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-3.5 font-mono text-[13px] text-fg-dim">No match. Try "projects" or "email".</p>
        )}
        <div className="flex gap-4 border-t border-line px-3.5 py-2 font-mono text-[11.5px] text-neutral-600">
          <span>↑↓ move</span>
          <span>enter open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
