// ## 03 experience: like GitHub's "contribution activity", a year rule, then
// dated rows on a vertical rail with a dot per entry. Newest first.
import { EXPERIENCE } from '../config/portfolio.config';
import Section from './Section';

// Group by the year the entry starts in ("2025-10 → 2025-11" -> "2025"), keeping order.
const BY_YEAR = EXPERIENCE.reduce((m, e) => {
  const y = String(e.when).slice(0, 4);
  return m.set(y, [...(m.get(y) ?? []), e]);
}, new Map());

export default function Experience({ n }) {
  return (
    <Section id="experience" n={n} title="experience" aside="newest first">
      {[...BY_YEAR].map(([year, items]) => (
        <div key={year} className="mb-8 last:mb-0">
          <h3 className="mb-4 flex items-center gap-3 font-mono text-[13px] text-fg-dim">
            {year}
            <span aria-hidden className="h-px flex-1 bg-line" />
          </h3>
          <ol className="relative ml-3 border-l border-line pl-7">
            {items.map((e) => (
              <li key={`${e.org}-${e.when}`} className="relative pb-8 last:pb-1">
                <span
                  aria-hidden
                  className="absolute -left-7 top-0 flex size-6 -translate-x-1/2 items-center justify-center rounded-full border border-line bg-surface"
                >
                  <span className="size-1.5 rounded-full bg-fg-dim" />
                </span>
                <p className="font-mono text-[12px] leading-6 text-fg-faint">
                  {e.when}
                </p>
                <h4 className="mt-0.5 text-[17px] font-semibold leading-snug tracking-[-0.01em] text-fg">
                  {e.org}
                  <span className="ml-2 font-mono text-[13px] font-normal text-fg-dim">{e.role}</span>
                </h4>
                <p className="mt-1.5 max-w-[65ch] text-[15px] leading-[1.6] text-fg-dim">{e.note}</p>
                {e.tags?.length > 0 && (
                  <ul aria-label="tags" className="mt-2.5 flex flex-wrap gap-1.5 font-mono text-[12px] text-fg-dim">
                    {e.tags.map((t) => (
                      <li key={t} className="rounded-full border border-line px-2 py-px">
                        {t}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </Section>
  );
}
