import { AWARDS, EDUCATION, LANGUAGES } from '../config/portfolio.config';
import { Section, SectionHeader } from './Section';

const MEDAL = {
  gold: 'text-[#facc15]',
  bronze: 'text-term-amber',
  merit: 'text-term-green',
};

function Yaml() {
  const k = (s) => <span className="text-term-cyan">{s}</span>;
  return (
    <pre className="mt-2 overflow-x-auto rounded-[10px] border border-line bg-panel p-[18px] font-mono text-[13px] leading-[1.8]">
      {EDUCATION.map((school) => (
        <span key={school.key}>
          {k(school.key)}:{'\n'}
          {school.fields.map(([key, value, comment]) => (
            <span key={key}>
              {'  '}
              {k(key)}: {value}
              {comment && <span className="text-neutral-600">{`   # ${comment}`}</span>}
              {'\n'}
            </span>
          ))}
          {'\n'}
        </span>
      ))}
      {k('languages')}: [{LANGUAGES.join(', ')}]
    </pre>
  );
}

export default function AwardsEducation() {
  return (
    <Section id="awards">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-14 gap-y-[72px] lg:grid-cols-[minmax(0,6fr)_minmax(0,6fr)]">
        <div>
          <SectionHeader name="awards" aside={`${AWARDS.length} entries`} />
          {AWARDS.map((a) => (
            <div key={a.title} className="grid grid-cols-[76px_minmax(0,1fr)_auto] items-baseline gap-4 border-b border-line-soft py-3.5">
              <span className={`rounded border border-current py-0.5 text-center font-mono text-xs ${MEDAL[a.medal]}`}>{a.label}</span>
              <p className="font-sans text-[15.5px] leading-normal">
                {a.title}
                {a.note && <span className="block text-sm text-fg-dim">{a.note}</span>}
              </p>
              <span className="font-mono text-[13px] tabular-nums text-fg-dim">{a.year}</span>
            </div>
          ))}
        </div>
        <div>
          <SectionHeader name="education" />
          <Yaml />
        </div>
      </div>
    </Section>
  );
}
