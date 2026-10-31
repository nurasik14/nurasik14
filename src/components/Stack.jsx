// ## 04 stack: TOOLS grouped like a package manifest (static, no marquee).
import { TOOLS } from '../config/portfolio.config';
import Section from './Section';

const GROUPS = TOOLS.reduce((m, [name, kind]) => m.set(kind, [...(m.get(kind) ?? []), name]), new Map());
const KEY_W = Math.max(...[...GROUPS.keys()].map((k) => k.length)) + 3; // quotes + colon

const P = ({ children }) => (
  <span aria-hidden className="text-fg-faint">
    {children}
  </span>
);

export default function Stack({ n }) {
  const entries = [...GROUPS];
  return (
    <Section id="stack" n={n} title="stack" aside={`${TOOLS.length} tools · ${entries.length} groups`}>
      <figure className="m-0 max-w-3xl overflow-hidden rounded border border-line bg-surface">
        <figcaption className="flex items-center justify-between border-b border-line-soft px-3 py-1.5 font-mono text-[12px] text-fg-faint">
          stack.json
          <span>{entries.length} keys</span>
        </figcaption>
        <div className="px-3 py-2.5 font-mono text-[13px] leading-[1.8]">
          <P>{'{'}</P>
          <dl>
            {entries.map(([kind, names], i) => (
              <div key={kind} className="flex pl-[2ch]">
                <dt className="shrink-0 whitespace-pre">
                  <P>&quot;</P>
                  <span className="text-info">{kind}</span>
                  <P>{`":${' '.repeat(KEY_W - kind.length - 2)}`}</P>
                </dt>
                <dd className="min-w-0">
                  <P>[</P>
                  <ul className="inline">
                    {names.map((name, j) => (
                      <li key={name} className="inline">
                        <span className="text-ok">
                          <P>&quot;</P>
                          {name}
                          <P>&quot;</P>
                        </span>
                        {j < names.length - 1 && <P>, </P>}
                      </li>
                    ))}
                  </ul>
                  <P>]{i < entries.length - 1 ? ',' : ''}</P>
                </dd>
              </div>
            ))}
          </dl>
          <P>{'}'}</P>
        </div>
      </figure>
    </Section>
  );
}
