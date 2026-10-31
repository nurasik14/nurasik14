// Left outline (>=1100px only). The amber ▌ marks the section in view.
import { pad2 } from '../lib/nav';

export default function OutlineRail({ sections, current }) {
  return (
    <nav aria-label="Outline" className="hidden min-[1100px]:block">
      <div className="sticky top-12 pb-10 pt-12">
        <p className="label mb-3">outline</p>
        <ol className="font-mono text-[13px]">
          {sections.map((s, i) => {
            const on = current?.id === s.id;
            return (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  aria-current={on ? 'location' : undefined}
                  className={`grid grid-cols-[1ch_2ch_minmax(0,1fr)] gap-x-2 rounded py-1 pr-2 no-underline transition-colors ${
                    on ? 'text-fg' : 'text-fg-dim hover:text-fg'
                  }`}
                >
                  <span aria-hidden className="text-signal">{on ? '▌' : ''}</span>
                  <span className={on ? 'text-signal' : 'text-fg-faint'}>{pad2(s.key ?? i + 1)}</span>
                  <span className="truncate">{s.label}</span>
                </a>
              </li>
            );
          })}
        </ol>
        <dl className="mt-8 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2 border-t border-line-soft pt-4 font-mono text-[12px] text-fg-faint">
          <dt>
            <kbd className="kbd">1</kbd>–<kbd className="kbd">{sections.at(-1)?.key ?? sections.length}</kbd>
          </dt>
          <dd>jump</dd>
          <dt>
            <kbd className="kbd">:</kbd>
          </dt>
          <dd>command</dd>
          <dt>
            <kbd className="kbd">g</kbd> <kbd className="kbd">p</kbd>
          </dt>
          <dd>planner</dd>
        </dl>
      </div>
    </nav>
  );
}
