/* GitHub UnderlineNav-style section tabs for index.md, sticky under the top
 * bar. Replaces the outline rail on this page. The current section (the
 * shell's IntersectionObserver, via useShell().section) gets the amber
 * underline and aria-current="location". On narrow screens only this bar
 * scrolls sideways, and it keeps the current tab in view. */
import { useEffect, useRef } from 'react';
import { pad2, prefersReducedMotion } from '../lib/nav';
import { useShell } from '../shell/AppShell';

export default function ProfileTabs({ sections, counts = {} }) {
  const { section } = useShell();
  const listRef = useRef(null);
  const currentId = section?.id ?? sections[0]?.id;

  useEffect(() => {
    const ul = listRef.current;
    const a = ul?.querySelector('[aria-current="location"]');
    if (!ul || !a || ul.scrollWidth <= ul.clientWidth) return;
    const left = a.offsetLeft - (ul.clientWidth - a.offsetWidth) / 2;
    ul.scrollTo?.({ left: Math.max(0, left), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [currentId]);

  return (
    <nav
      aria-label="Profile sections"
      className="sticky top-12 z-20 -mx-4 border-b border-line bg-bg px-4 sm:-mx-6 sm:px-6 md:mx-0 md:px-0"
    >
      <ul ref={listRef} className="relative flex overflow-x-auto font-mono text-[13px]">
        {sections.map((s) => {
          const on = s.id === currentId;
          const count = counts[s.id];
          return (
            <li key={s.id} className="flex shrink-0">
              <a
                href={`#${s.id}`}
                aria-current={on ? 'location' : undefined}
                aria-keyshortcuts={s.key}
                className={`flex h-11 items-center gap-2 whitespace-nowrap px-3 no-underline transition-colors duration-150 ${
                  on ? 'text-fg shadow-[inset_0_-2px_0_rgb(var(--signal))]' : 'text-fg-dim hover:text-fg'
                }`}
              >
                <span aria-hidden className={on ? 'text-signal' : 'text-fg-faint'}>
                  {pad2(s.key)}
                </span>
                <span className={on ? 'font-medium' : ''}>{s.label}</span>
                {count != null && (
                  <span className="rounded-full bg-surface-2 px-1.5 text-[11px] leading-[1.6] text-fg-dim">
                    <span className="sr-only">(</span>
                    {count}
                    <span className="sr-only">)</span>
                  </span>
                )}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
