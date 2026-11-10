/* Section 00 overview: a GitHub-style profile README frame. Header row
 * "nurasik14 / README.md", then the YAML frontmatter, a short intro, the
 * "### now" list and fig. 1 (real DQN logs). */
import { DQN_RUNS, LANGUAGES, NOW, PROFILE } from '../config/portfolio.config';
import { valueAt } from '../lib/chart';
import StepChart from './StepChart';

const DQN_SERIES = [
  { key: 'double', name: 'double', points: DQN_RUNS.double, stroke: 'stroke-fg', fill: 'fill-fg' },
  { key: 'dueling', name: 'dueling', points: DQN_RUNS.dueling, stroke: 'stroke-info', fill: 'fill-info', dashed: true, labelY: -3 },
];

const end = (pts) => pts.at(-1);
const n = (v) => v.toLocaleString('en-US');

function Frontmatter() {
  const rows = [
    ['focus', PROFILE.focus],
    ['status', PROFILE.status],
    ['based', PROFILE.location],
    ['langs', LANGUAGES],
  ];
  return (
    <div className="font-mono text-[13px] leading-[1.7]">
      <span aria-hidden className="block text-fg-faint">---</span>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k} className="flex">
            <dt className="shrink-0 whitespace-pre text-info">
              {k}
              <span className="text-fg-faint">:</span>{' '}
            </dt>
            <dd className="min-w-0 text-ok">
              {Array.isArray(v) ? (
                <>
                  <span aria-hidden className="text-fg-faint">[</span>
                  {v.map((x, i) => (
                    <span key={x}>
                      {x}
                      {i < v.length - 1 && <span className="text-fg-faint">, </span>}
                    </span>
                  ))}
                  <span aria-hidden className="text-fg-faint">]</span>
                </>
              ) : (
                v
              )}
            </dd>
          </div>
        ))}
      </dl>
      <span aria-hidden className="block text-fg-faint">---</span>
    </div>
  );
}

function Fig1() {
  const [dx, dy] = end(DQN_RUNS.double);
  const [ux, uy] = end(DQN_RUNS.dueling);
  return (
    <figure id="fig-1" className="m-0 scroll-mt-16 rounded border border-line bg-surface p-4">
      <p className="label mb-3">fig. 1</p>
      <p className="sr-only">
        Best reward so far by training episode. Double DQN rises from {DQN_RUNS.double[0][1]} to {dy} over {n(dx)}{' '}
        episodes. Dueling DQN reaches {uy} by episode {n(ux)}, when its run stopped; Double DQN&apos;s best at that
        episode was {valueAt(DQN_RUNS.double, ux)}. The same numbers are in a table in the train_dqn project details.
      </p>
      <StepChart
        label={`Step chart: best reward so far versus episode, Double DQN ${dy} at ${n(dx)} episodes, Dueling DQN ${uy} at ${n(ux)}.`}
        xDomain={[0, 170000]}
        yDomain={[-10, 60]}
        xTicks={[0, 50000, 100000, 150000]}
        yTicks={[-10, 0, 10, 20, 30, 40, 50, 60]}
        xLabel="episode"
        yLabel="best reward"
        series={DQN_SERIES}
      />
      <figcaption className="mt-1 border-t border-line-soft pt-2 font-mono text-[12px] text-fg-faint">
        fig. 1 · best reward so far, from FlappyBird-RL/runs/graphs/*.log
      </figcaption>
    </figure>
  );
}

export default function Readme({ id = 'overview' }) {
  return (
    <section id={id} tabIndex={-1} aria-labelledby={`${id}-title`} className="scroll-mt-12 pt-6 focus:outline-none">
      <article className="rounded border border-line">
        <header className="flex items-center justify-between gap-4 border-b border-line px-4 py-2.5 font-mono text-[12px]">
          <h2 id={`${id}-title`} className="min-w-0 truncate font-normal">
            <span className="sr-only">overview: </span>
            <span className="text-fg-dim">{PROFILE.github}</span>
            <span className="text-fg-faint"> / </span>
            <span className="text-fg">README.md</span>
          </h2>
          <span aria-hidden className="shrink-0 text-fg-faint">
            md
          </span>
        </header>
        <div className="readme-body p-4 sm:p-6">
          <div className="min-w-0">
            <Frontmatter />
            <p className="mt-5 max-w-[62ch] leading-[1.65] text-fg-dim">{PROFILE.intro}</p>
            <h3 className="mb-2 mt-6 font-mono text-[14px] font-medium text-fg">
              <span aria-hidden className="text-fg-faint">### </span>now
            </h3>
            <ul className="max-w-[62ch] space-y-1.5 text-[15px] leading-[1.55] text-fg-dim">
              {NOW.map((x) => (
                <li key={x} className="grid grid-cols-[2ch_minmax(0,1fr)]">
                  <span aria-hidden className="font-mono text-fg-faint">-</span>
                  <span>{x}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="min-w-0">
            <Fig1 />
          </div>
        </div>
      </article>
    </section>
  );
}
