// Hero: YAML frontmatter, the name, lede, actions; fig. 1 (real DQN logs) on the right.
import { DQN_RUNS, LANGUAGES, PROFILE } from '../config/portfolio.config';
import { CV_HREF } from '../lib/nav';
import ProfileLinks from './ProfileLinks';
import { valueAt } from '../lib/chart';
import StepChart from './StepChart';

const DQN_SERIES = [
  { key: 'double', name: 'double', points: DQN_RUNS.double, stroke: 'stroke-fg', fill: 'fill-fg' },
  { key: 'dueling', name: 'dueling', points: DQN_RUNS.dueling, stroke: 'stroke-info', fill: 'fill-info', dashed: true, labelY: -3 },
];

const end = (pts) => pts.at(-1);
const n = (v) => v.toLocaleString('en-US');

function Frontmatter() {
  // Only fields the H1 and lede below don't already say.
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
        episode was {valueAt(DQN_RUNS.double, ux)}. The same numbers are in a table in the train_dqn project row.
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

export default function Hero() {
  return (
    <header className="grid grid-cols-[minmax(0,1fr)] gap-x-12 gap-y-10 pt-10 sm:pt-14 min-[1100px]:pt-12 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] xl:items-start">
      <div>
        <Frontmatter />
        <h1 className="mt-6 font-sans text-[clamp(2.75rem,7vw,5.5rem)] font-semibold leading-[0.95] tracking-[-0.04em] text-fg">
          {PROFILE.name}
          <span aria-hidden className="ml-[0.06em] inline-block h-[0.78em] w-[0.42em] translate-y-[0.06em] bg-signal" />
        </h1>
        <p className="mt-6 max-w-[62ch] text-[17px] leading-[1.65] text-fg-dim">{PROFILE.lede}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href={CV_HREF} className="btn btn-primary">
            Read the CV <span aria-hidden>↗</span>
          </a>
          <a href="#projects" className="btn">
            Projects <kbd aria-hidden className="kbd border-line-strong">1</kbd>
          </a>
        </div>
        <ProfileLinks className="mt-6" />
      </div>
      <div className="max-w-2xl xl:max-w-none xl:pt-[1.7em]">
        <Fig1 />
      </div>
    </header>
  );
}
