/* The "stats" panel for each project card. Keyed by `stats` in
 * portfolio.config.js; an { empty, note } object renders a placeholder. */
import { DQN_RUNS } from '../config/portfolio.config';
import { valueAt } from '../lib/chart';
import StepChart from './StepChart';

const GREEN = '#22c55e';
const CYAN = '#06b6d4';

function Empty({ title, children, className = '' }) {
  return (
    <div className={`rounded-lg border border-dashed border-line p-[18px] font-sans text-sm leading-relaxed text-fg-dim ${className}`}>
      <b className="mb-1 block font-mono text-[13px] font-medium text-neutral-200">{title}</b>
      {children}
    </div>
  );
}

function Fig({ value, label, tone = 'text-neutral-200' }) {
  return (
    <div className="rounded-md border border-line-soft bg-black px-3 py-2.5">
      <b className={`block font-mono text-2xl font-bold leading-tight tracking-tight tabular-nums ${tone}`}>{value}</b>
      <span className="mt-1.5 block font-sans text-[12.5px] leading-snug text-fg-dim">{label}</span>
    </div>
  );
}

function DqnStats() {
  const { double, dueling } = DQN_RUNS;
  const duelEnd = dueling.at(-1)[0];
  const episodes = [...new Set([...double, ...dueling].map((p) => p[0]))].sort((a, b) => a - b);
  return (
    <>
      <div className="mb-[18px] grid gap-2.5 sm:grid-cols-3">
        <Fig value={double.at(-1)[1]} tone="text-term-green" label={`best reward, Double DQN, ${double.at(-1)[0].toLocaleString('en-US')} episodes`} />
        <Fig value={dueling.at(-1)[1]} tone="text-term-cyan" label={`Dueling DQN best after ${duelEnd.toLocaleString('en-US')} episodes`} />
        <Fig value={valueAt(double, duelEnd)} label="Double DQN best at that same point" />
      </div>
      <div className="mb-1.5 flex flex-wrap gap-4 font-mono text-xs text-fg-dim">
        <span><i className="mr-1.5 inline-block w-[18px] border-t-2 border-term-green align-middle" />double_dqn</span>
        <span><i className="mr-1.5 inline-block w-[18px] border-t-2 border-dashed border-term-cyan align-middle" />dueling_dqn</span>
      </div>
      <StepChart
        label="Best reward by training episode. Double DQN rises from minus 8.7 to 53.1 over 168,126 episodes. Dueling DQN reaches 15.2 by episode 34,422, when its run stopped."
        xDomain={[0, 170000]}
        yDomain={[-10, 60]}
        xTicks={[0, 50000, 100000, 150000]}
        yTicks={[0, 20, 40, 60]}
        series={[
          { key: 'double', name: 'double_dqn', points: double, color: GREEN, label: `double ${double.at(-1)[1]}` },
          { key: 'dueling', name: 'dueling_dqn', points: dueling, color: CYAN, dashed: true, label: `dueling ${dueling.at(-1)[1]}`, labelDy: -8 },
        ]}
      />
      <p className="mt-3 max-w-[46em] font-sans text-sm leading-relaxed text-fg-dim">
        <b className="font-medium text-neutral-200">Dueling learned faster early on</b>, ahead of Double DQN at 34k
        episodes. I stopped the Dueling run there, so the long-run comparison is still open.
      </p>
      <details className="mt-2.5 font-mono text-xs text-fg-dim">
        <summary className="w-fit cursor-pointer hover:text-neutral-200">show data as a table</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="border-collapse tabular-nums">
            <thead>
              <tr>
                {['episode', 'double best', 'dueling best'].map((h) => (
                  <th key={h} className="border-b border-line-soft py-1 pr-[18px] text-right font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="text-neutral-200">
              {episodes.map((e) => (
                <tr key={e}>
                  <td className="border-b border-line-soft py-1 pr-[18px] text-right">{e.toLocaleString('en-US')}</td>
                  <td className="border-b border-line-soft py-1 pr-[18px] text-right">{valueAt(double, e)}</td>
                  <td className="border-b border-line-soft py-1 pr-[18px] text-right">{e <= duelEnd ? valueAt(dueling, e) : '–'}</td>
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
    <div className={`rounded-md border bg-black px-2.5 py-2 ${hl ? 'border-term-cyan/50' : 'border-line'}`}>
      {children}
      {sub && <small className="mt-0.5 block text-[11.5px] text-fg-dim">{sub}</small>}
    </div>
  );
}

function SearchStats() {
  const wire = <span aria-hidden className="text-center text-neutral-600 max-sm:w-5 max-sm:rotate-90">→</span>;
  return (
    <>
      <div
        role="img"
        aria-label="A question goes to a local model, which calls either the native search tool or my SearXNG tool, then answers."
        className="grid items-center gap-2.5 font-mono text-[12.5px] sm:grid-cols-[auto_20px_minmax(0,1fr)_20px_auto]"
      >
        <Node>question</Node>
        {wire}
        <div className="grid gap-2">
          <Node sub="provider picked by the model">native tool call</Node>
          <Node sub="self-hosted, I pick the sources" hl>searxng_search()</Node>
        </div>
        {wire}
        <Node>answer</Node>
      </div>
      <Empty title="no benchmark yet" className="mt-4">
        Next I'll score both modes on one fixed question set and chart task success and seconds per answer here.
      </Empty>
    </>
  );
}

function RagStats() {
  const cols = ['kk dense', 'kk hybrid', 'ru dense', 'ru hybrid', 'en dense', 'en hybrid'];
  const heights = [40, 55, 35, 60, 45, 70];
  return (
    <>
      <div aria-hidden className="grid h-[120px] grid-cols-6 items-end gap-2.5 border-b border-line px-3 pt-3">
        {heights.map((h, i) => (
          <i
            key={i}
            className="block rounded-t-[3px] border border-b-0 border-dashed border-line"
            style={{ height: `${h}%`, background: 'repeating-linear-gradient(135deg, #1a1a1a 0 4px, transparent 4px 8px)' }}
          />
        ))}
      </div>
      <div aria-hidden className="grid grid-cols-6 gap-2.5 px-3 pt-1.5 text-center font-mono text-[11px] text-neutral-600">
        {cols.map((c) => <span key={c}>{c}</span>)}
      </div>
      <Empty title="waiting for the first benchmark" className="mt-4">
        Recall@5 per language and retrieval method goes here once it's measured. The bars above are placeholders, not results.
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
