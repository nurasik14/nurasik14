/* The results panel inside an open project row. Keyed by `stats` in
 * portfolio.config.js; an { empty, note } object renders an honest
 * placeholder instead of a number nobody measured. */
import { DQN_RUNS } from '../config/portfolio.config';
import { valueAt } from '../lib/chart';

const n = (v) => v.toLocaleString('en-US');

function Empty({ title, children, className = '' }) {
  return (
    <div className={`rounded border border-dashed border-line-strong/60 px-4 py-3 text-[14px] leading-relaxed text-fg-dim ${className}`}>
      <p className="font-mono text-[13px] text-fg">
        <span aria-hidden className="text-fg-faint">∅ </span>
        {title}
      </p>
      <p className="mt-1 max-w-[60ch]">{children}</p>
    </div>
  );
}

function Fig({ value, children }) {
  return (
    // dt first in the DOM, value shown on top
    <div className="flex flex-col-reverse justify-end rounded border border-line-soft bg-bg px-3 py-2.5">
      <dt className="mt-1 text-[13px] leading-snug text-fg-dim">{children}</dt>
      <dd className="font-mono text-[22px] font-medium leading-tight tracking-[-0.02em] text-fg">{value}</dd>
    </div>
  );
}

function DqnStats() {
  const { double, dueling } = DQN_RUNS;
  const [dx, dy] = double.at(-1);
  const [ux, uy] = dueling.at(-1);
  const episodes = [...new Set([...double, ...dueling].map((p) => p[0]))].sort((a, b) => a - b);
  return (
    <>
      <dl className="grid gap-2 sm:grid-cols-3">
        <Fig value={dy}>Double DQN best, {n(dx)} episodes</Fig>
        <Fig value={uy}>Dueling DQN best, {n(ux)} episodes</Fig>
        <Fig value={valueAt(double, ux)}>Double DQN best at episode {n(ux)}</Fig>
      </dl>
      <p className="mt-3 max-w-[62ch] text-[14px] leading-relaxed text-fg-dim">
        <span className="text-fg">Dueling learned faster early on</span>: it was ahead of Double DQN when I stopped its run at{' '}
        {n(ux)} episodes, so the long-run comparison is still open. The curves are{' '}
        <a href="#fig-1" className="link font-mono text-[13px]">
          fig. 1 ↑
        </a>
        .
      </p>
      <details className="group mt-3 font-mono text-[12px] text-fg-dim">
        <summary className="w-fit cursor-pointer list-none rounded px-1 -mx-1 hover:text-fg [&::-webkit-details-marker]:hidden">
          <span aria-hidden className="inline-block w-[2ch] transition-transform duration-150 group-open:rotate-90">▸</span>
          data as a table
        </summary>
        <div className="mt-2 overflow-x-auto" role="region" aria-label="DQN checkpoints table" tabIndex={0}>
          <table className="border-collapse tabular-nums">
            <caption className="sr-only">Best reward so far at each checkpoint</caption>
            <thead>
              <tr className="text-fg-faint">
                {['episode', 'double', 'dueling'].map((h) => (
                  <th key={h} scope="col" className="border-b border-line py-1 pr-5 text-right font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-fg">
              {episodes.map((e) => (
                <tr key={e}>
                  <th scope="row" className="border-b border-line-soft py-1 pr-5 text-right font-normal text-fg-dim">
                    {n(e)}
                  </th>
                  <td className="border-b border-line-soft py-1 pr-5 text-right">{valueAt(double, e)}</td>
                  <td className="border-b border-line-soft py-1 pr-5 text-right">{e <= ux ? valueAt(dueling, e) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

function Node({ children, sub, hl }) {
  return (
    <div className={`rounded border bg-bg px-2.5 py-2 ${hl ? 'border-info/70' : 'border-line'}`}>
      <span className={hl ? 'text-info' : 'text-fg'}>{children}</span>
      {sub && <small className="mt-0.5 block text-[12px] text-fg-faint">{sub}</small>}
    </div>
  );
}

function SearchStats() {
  const wire = (
    <span aria-hidden className="text-center text-fg-faint max-sm:w-5 max-sm:rotate-90">
      →
    </span>
  );
  return (
    <>
      <div
        role="img"
        aria-label="A question goes to a local model, which calls either the native search tool or my SearXNG tool, then answers."
        className="grid items-center gap-2 font-mono text-[13px] sm:grid-cols-[auto_1.25rem_minmax(0,1fr)_1.25rem_auto]"
      >
        <Node>question</Node>
        {wire}
        <div className="grid gap-2">
          <Node sub="provider picked by the model">native tool call</Node>
          <Node sub="self-hosted, I pick the sources" hl>
            searxng_search()
          </Node>
        </div>
        {wire}
        <Node>answer</Node>
      </div>
      <Empty title="no benchmark yet" className="mt-3">
        Next I&apos;ll score both modes on one fixed question set and report task success and seconds per answer here.
      </Empty>
    </>
  );
}

function RagStats() {
  const langs = ['kk', 'ru', 'en'];
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse font-mono text-[13px] tabular-nums">
          <caption className="sr-only">recall@5 by language and retrieval method: not measured yet</caption>
          <thead>
            <tr className="text-fg-faint">
              <th scope="col" className="border-b border-line py-1 pr-4 text-left font-normal">recall@5</th>
              {langs.map((l) => (
                <th key={l} scope="col" className="border-b border-line py-1 pr-4 text-right font-normal">
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {['dense', 'hybrid'].map((m) => (
              <tr key={m}>
                <th scope="row" className="border-b border-line-soft py-1.5 pr-4 text-left font-normal text-fg">
                  {m}
                </th>
                {langs.map((l) => (
                  <td key={l} className="border-b border-line-soft py-1.5 pr-4 text-right text-fg-faint">
                    <span aria-hidden>—</span>
                    <span className="sr-only">not measured</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Empty title="waiting for the first benchmark" className="mt-3">
        Recall@5 per language and retrieval method goes in this table once it&apos;s measured. Every cell is empty until then.
      </Empty>
    </>
  );
}

export default function ProjectStats({ stats }) {
  if (stats === 'dqn') return <DqnStats />;
  if (stats === 'search') return <SearchStats />;
  if (stats === 'rag') return <RagStats />;
  return <Empty title={stats.empty}>{stats.note}</Empty>;
}
