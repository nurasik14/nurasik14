// ## 03 awards: an aligned table, then education as a YAML block.
import { AWARDS, EDUCATION, LANGUAGES } from '../config/portfolio.config';
import Section from './Section';
import Yaml from './Yaml';

const GLYPH = { gold: '◆', bronze: '◇', merit: '★' };

const EDU_LINES = EDUCATION.flatMap((s) => [
  { k: s.key },
  ...s.fields.map(([k, v, comment]) => ({ k, v, comment, depth: 1 })),
]);

export default function Awards({ n }) {
  return (
    <Section id="awards" n={n} title="awards" aside={`${AWARDS.length} entries · newest first`}>
      <table className="w-full border-collapse">
        <caption className="sr-only">Awards and scholarships, newest first</caption>
        <thead>
          <tr className="border-b border-line text-left">
            <th scope="col" className="label w-[11ch] pb-2 pr-4 font-normal">medal</th>
            <th scope="col" className="label pb-2 pr-4 font-normal">award</th>
            <th scope="col" className="label w-[6ch] pb-2 text-right font-normal">year</th>
          </tr>
        </thead>
        <tbody>
          {AWARDS.map((a) => (
            <tr key={`${a.title}-${a.year}`} className="border-b border-line-soft align-baseline">
              <td className="whitespace-nowrap py-3 pr-4 font-mono text-[13px] text-fg-dim">
                <span aria-hidden className="mr-1.5 text-fg">{GLYPH[a.medal] ?? '·'}</span>
                {a.label}
              </td>
              <th scope="row" className="py-3 pr-4 text-left font-normal">
                <span className="text-fg">{a.title}</span>
                {a.note && <span className="mt-0.5 block text-[14px] text-fg-dim">{a.note}</span>}
              </th>
              <td className="py-3 text-right font-mono text-[13px] tabular-nums text-fg-dim">{a.year}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="mb-3 mt-12 font-mono text-[15px] font-medium text-fg">
        <span aria-hidden className="text-fg-faint">### </span>education
      </h3>
      <Yaml title="education.yaml" lines={EDU_LINES} className="max-w-2xl" />
      <p className="mt-4 font-mono text-[13px] text-fg-dim">
        <span className="text-info">languages</span>
        <span className="text-fg-faint">: </span>
        {LANGUAGES.join(' · ')}
      </p>
    </Section>
  );
}
