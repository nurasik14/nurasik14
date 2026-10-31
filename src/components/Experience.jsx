// ## 02 experience: drawn like `git log --graph`, newest commit on top.
import { EXPERIENCE } from '../config/portfolio.config';
import Section from './Section';

export default function Experience({ n }) {
  return (
    <Section id="experience" n={n} title="experience" aside="newest first">
      <ol>
        {EXPERIENCE.map((e, i) => {
          const first = i === 0;
          const last = i === EXPERIENCE.length - 1;
          return (
            <li
              key={`${e.org}-${e.when}`}
              className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-4 sm:grid-cols-[1.25rem_18ch_minmax(0,1fr)] sm:gap-x-5"
            >
              <span aria-hidden className="relative row-span-2 sm:row-span-1">
                <span
                  className={`absolute left-1/2 w-px -translate-x-1/2 bg-line ${first ? 'top-[0.7rem]' : 'top-0'} ${last ? 'h-[0.7rem]' : 'bottom-0'}`}
                />
                <span className="absolute left-1/2 top-[0.7rem] size-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-fg-dim bg-bg" />
              </span>
              <p className="font-mono text-[13px] leading-[1.4rem] text-fg-dim">{e.when}</p>
              <div className={`col-start-2 min-w-0 sm:col-start-3 ${last ? '' : 'pb-10'}`}>
                <h3 className="text-[18px] font-semibold leading-[1.4rem] tracking-[-0.01em] text-fg">{e.org}</h3>
                <p className="mt-1 font-mono text-[13px] text-fg-dim">{e.role}</p>
                <p className="mt-2 max-w-[65ch] text-fg-dim">{e.note}</p>
                {e.tags?.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-1.5 font-mono text-[12px] text-fg-dim">
                    {e.tags.map((t) => (
                      <li key={t} className="rounded border border-line px-1.5 py-px">
                        {t}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
