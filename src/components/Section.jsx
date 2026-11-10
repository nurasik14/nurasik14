// "## 01 projects": markdown-style heading; the number is the shortcut key.
// scroll-mt + the html scroll-padding clear the top bar and the sticky tabs.
import { pad2 } from '../lib/nav';

export default function Section({ id, n, title, aside, children }) {
  return (
    <section
      id={id}
      tabIndex={-1}
      aria-labelledby={`${id}-title`}
      className="mt-10 scroll-mt-12 border-t border-line pt-10 focus:outline-none"
    >
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 id={`${id}-title`} className="font-mono text-[22px] font-medium leading-tight tracking-[-0.01em] text-fg">
          <span aria-hidden className="text-fg-faint">## </span>
          <span className="text-signal">{pad2(n)}</span> {title}
        </h2>
        {aside && <p className="font-mono text-[12px] text-fg-faint">{aside}</p>}
      </div>
      {children}
    </section>
  );
}
