import { EXPERIENCE } from '../config/portfolio.config';
import { Section, SectionHeader } from './Section';

export default function Experience() {
  return (
    <Section id="experience">
      <SectionHeader name="experience" aside="git log" />
      <div className="mt-2">
        {EXPERIENCE.map((e) => (
          <div key={e.org} className="grid grid-cols-[minmax(0,1fr)] gap-x-7 gap-y-1 border-b border-line-soft py-5 sm:grid-cols-[170px_minmax(0,1fr)]">
            <span className="pt-0.5 font-mono text-[13px] tabular-nums text-fg-dim">{e.when}</span>
            <div>
              <h3 className="font-mono text-[17px] font-medium leading-snug">
                {e.org} <span className="font-normal text-fg-dim">{e.role}</span>
              </h3>
              <p className="mt-1.5 max-w-[46em] font-sans text-[15.5px] leading-relaxed text-neutral-400">{e.note}</p>
              {e.tags && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {e.tags.map((t) => (
                    <span key={t} className="rounded border border-line px-[7px] py-px font-mono text-[11.5px] text-fg-dim">{t}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
