import React from 'react';
import {
  ComposedChart,
  Area,
  Line,
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts';
import {
  SCRAPER_JOBS,
  LOG_LINES,
  RANGES,
  SOURCE_MIX,
  RAW_JSON,
  RAW_CSV,
  RAW_SCHEMA,
  REFRESH_MS,
} from '../config/dashboards.config';
import { ANALYTICS } from '../lib/series';
import { Panel, Chip, StatusDot, Sparkline, cx, CopyBtn } from './ui';
import { useInterval } from '../lib/hooks';

const SERIES = [
  { id: 'ingested', label: 'INGESTED', color: '#22c55e', kind: 'area' },
  { id: 'p95', label: 'p95_MS', color: '#f59e0b', kind: 'line' },
  { id: 'errors', label: 'ERRORS', color: '#ef4444', kind: 'bar' },
  { id: 'queue', label: 'QUEUE', color: '#06b6d4', kind: 'line' },
];

const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="border border-neutral-700 bg-black/95 px-2 py-1 font-mono text-[10px]">
      <div className="mb-0.5 text-neutral-500">t {label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color }}>
          {p.dataKey}: <span className="num">{p.value}</span>
        </div>
      ))}
    </div>
  );
};

const axis = { tick: { fill: '#666', fontSize: 9 }, tickLine: false };

/* ------------------------------------------------------------------ */
/* Panel A — pipeline monitor                                          */
/* ------------------------------------------------------------------ */
function PipelineMonitor() {
  const [jobs, setJobs] = React.useState(() =>
    SCRAPER_JOBS.map((j, i) => ({ ...j, lastSync: Date.now() - i * 37_000 - 4_000, delta: 0 })),
  );
  const [logs, setLogs] = React.useState(() => LOG_LINES.slice(0, 8).map((l) => `${ts(Date.now() - 4000)} ${l}`));
  const [paused, setPaused] = React.useState(false);

  useInterval(() => {
    if (paused) return;
    setJobs((js) =>
      js.map((j) => {
        const roll = Math.random();
        const bump = Math.max(0, Math.round(j.rate * (0.6 + Math.random() * 0.9)));
        let status = j.status;
        let code = j.code;
        if (roll > 0.995) {
          status = 'ERR';
          code = 429;
        } else if (roll > 0.975) {
          status = 'WARN';
          code = 206;
        } else if (roll > 0.93) {
          status = 'OK';
          code = 200;
        }
        const synced = roll > 0.82;
        return {
          ...j,
          status,
          code,
          records: j.records + (status === 'ERR' ? 0 : bump),
          delta: bump,
          lastSync: synced ? Date.now() : j.lastSync,
        };
      }),
    );
    setLogs((l) => [...l.slice(-40), `${ts(Date.now())} ${LOG_LINES[Math.floor(Math.random() * LOG_LINES.length)]}`]);
  }, REFRESH_MS);

  const ok = jobs.filter((j) => j.status === 'OK').length;
  const total = jobs.reduce((s, j) => s + j.records, 0);

  return (
    <Panel
      title="pipeline_monitor.py"
      accent="green"
      right={
        <>
          <Chip tone="green">
            <StatusDot tone="green" live={!paused} /> {ok}/{jobs.length} ok
          </Chip>
          <button type="button" onClick={() => setPaused((p) => !p)} className={cx('btn focus-ring', paused && 'btn-on')}>
            {paused ? '[RESUME]' : '[PAUSE]'}
          </button>
        </>
      }
      bodyClass="flex min-w-0 flex-col"
    >
      <div className="grid grid-cols-3 gap-px border-b border-neutral-800 bg-neutral-900">
        {[
          { k: 'records_total', v: total.toLocaleString(), t: 'text-neutral-100' },
          { k: 'ingest_rate', v: `${jobs.reduce((s, j) => s + j.rate, 0).toFixed(1)}/s`, t: 'text-term-green' },
          { k: 'fleet', v: `${jobs.length} jobs`, t: 'text-term-cyan' },
        ].map((m) => (
          <div key={m.k} className="bg-black px-2 py-1">
            <div className="label">{m.k}</div>
            <div className={cx('num font-mono text-[12.5px]', m.t)}>{m.v}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th className="w-[74px]">job</th>
              <th>target</th>
              <th className="w-[92px]">parser</th>
              <th className="w-[96px]">cadence</th>
              <th className="w-16">code</th>
              <th className="w-[52px]">st</th>
              <th className="w-[86px]">records</th>
              <th className="w-[74px]">rate</th>
              <th className="w-[92px]">last_sync</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id}>
                <td className="text-neutral-300">{j.id}</td>
                <td className="max-w-[220px] truncate text-neutral-500">{j.target}</td>
                <td className="truncate text-neutral-600">{j.parser}</td>
                <td className="text-neutral-600">{j.cadence}</td>
                <td
                  className={cx(
                    'num',
                    j.code === 200 ? 'text-term-green' : j.code === 206 ? 'text-term-amber' : 'text-term-red',
                  )}
                >
                  {j.code}
                </td>
                <td>
                  <span
                    className={cx(
                      'font-mono text-[9.5px] font-semibold',
                      j.status === 'OK'
                        ? 'text-term-green'
                        : j.status === 'WARN'
                          ? 'text-term-amber'
                          : 'text-term-red',
                    )}
                  >
                    {j.status === 'OK' ? '[OK]' : j.status === 'WARN' ? '[WARN]' : '[ERR]'}
                  </span>
                </td>
                <td className="num text-neutral-200">
                  {j.records.toLocaleString()}
                  <span className="text-term-green/70"> +{j.delta}</span>
                </td>
                <td className="num text-neutral-500">{j.rate.toFixed(1)}/s</td>
                <td className="num text-neutral-500">{ago(j.lastSync)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t border-neutral-800 bg-black">
        <div className="flex items-center gap-2 border-b border-neutral-900 px-2 py-1">
          <span className="label">stdout · tail -f</span>
          <span className="ml-auto font-mono text-[9px] text-neutral-600">{logs.length} lines</span>
        </div>
        <div className="h-[132px] overflow-y-auto p-2 font-mono text-[10.5px] leading-[1.5]">
          {logs.map((l, i) => (
            <div key={i} className="whitespace-pre-wrap break-words">
              <span className="text-neutral-700">{l.slice(0, 8)} </span>
              <span
                className={cx(
                  l.includes('429') || l.includes('ERR')
                    ? 'text-term-red'
                    : l.includes('206') || l.includes('error')
                      ? 'text-term-amber'
                      : 'text-neutral-400',
                )}
              >
                {l.slice(9)}
              </span>
            </div>
          ))}
          <div>
            <span className="text-term-green">$ </span>
            <span className="caret" />
          </div>
        </div>
      </div>
    </Panel>
  );
}

const ts = (d) => new Date(d).toTimeString().slice(0, 8);
function ago(d) {
  const s = Math.max(0, Math.round((Date.now() - d) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ago`;
}

/* ------------------------------------------------------------------ */
/* Panel B — analytics                                                 */
/* ------------------------------------------------------------------ */
function Analytics() {
  const [range, setRange] = React.useState('6H');
  const [on, setOn] = React.useState({ ingested: true, p95: true, errors: true, queue: false });

  const data = React.useMemo(() => {
    const n = RANGES.find((r) => r.id === range).n;
    return ANALYTICS.slice(-n);
  }, [range]);

  const sum = data.reduce((s, d) => s + d.ingested, 0);
  const errs = data.reduce((s, d) => s + d.errors, 0);
  const p95avg = data.reduce((s, d) => s + d.p95, 0) / data.length;
  const spark = data.map((d) => d.ingested);

  return (
    <Panel
      title="analytics · ingest throughput"
      accent="cyan"
      right={
        <>
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r.id)}
              className={cx('btn focus-ring', range === r.id && 'btn-on')}
            >
              {r.id}
            </button>
          ))}
        </>
      }
      bodyClass="flex min-w-0 flex-col"
    >
      <div className="grid grid-cols-2 gap-px border-b border-neutral-800 bg-neutral-900 lg:grid-cols-4">
        {[
          { k: 'ingested', v: sum.toLocaleString(), t: 'text-term-green', s: spark },
          { k: 'errors', v: `${errs} (${((errs / Math.max(sum, 1)) * 100).toFixed(2)}%)`, t: errs / Math.max(sum, 1) > 0.02 ? 'text-term-amber' : 'text-neutral-100' },
          { k: 'p95 latency', v: `${p95avg.toFixed(1)} ms`, t: p95avg > 70 ? 'text-term-amber' : 'text-neutral-100' },
          { k: 'queue depth', v: data[data.length - 1].queue, t: 'text-term-cyan' },
        ].map((m) => (
          <div key={m.k} className="bg-black px-2 py-1">
            <div className="flex items-center justify-between gap-2">
              <span className="label">{m.k}</span>
              {m.s && (
                <span className="w-14 shrink-0">
                  <Sparkline data={m.s} h={10} color="#22c55e" />
                </span>
              )}
            </div>
            <div className={cx('num font-mono text-[12.5px]', m.t)}>{m.v}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b border-neutral-800 bg-[#0d0d0d] px-2 py-1.5">
        {SERIES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setOn((o) => ({ ...o, [s.id]: !o[s.id] }))}
            className={cx('btn focus-ring', on[s.id] && 'btn-on')}
            style={on[s.id] ? { borderColor: `${s.color}66`, color: s.color } : undefined}
          >
            <span className="inline-block h-[6px] w-[6px]" style={{ background: s.color }} />
            {s.label}
          </button>
        ))}
      </div>

      <div className="min-w-0 p-2">
        <div className="h-[196px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="gi" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1c1c1c" strokeDasharray="2 3" vertical={false} />
              <XAxis dataKey="ts" {...axis} minTickGap={34} stroke="#333" />
              <YAxis yAxisId="l" {...axis} stroke="#333" width={40} />
              <YAxis yAxisId="r" orientation="right" {...axis} stroke="#333" width={36} />
              <Tooltip content={<Tip />} cursor={{ stroke: '#444' }} />
              {on.ingested && (
                <Area
                  yAxisId="l"
                  type="monotone"
                  dataKey="ingested"
                  stroke="#22c55e"
                  strokeWidth={1.2}
                  fill="url(#gi)"
                  isAnimationActive={false}
                />
              )}
              {on.errors && (
                <Bar yAxisId="l" dataKey="errors" fill="#ef4444" isAnimationActive={false} barSize={range === '24H' ? 2 : 4} />
              )}
              {on.p95 && (
                <Line
                  yAxisId="r"
                  type="monotone"
                  dataKey="p95"
                  stroke="#f59e0b"
                  strokeWidth={1.1}
                  dot={false}
                  isAnimationActive={false}
                />
              )}
              {on.queue && (
                <Line
                  yAxisId="r"
                  type="monotone"
                  dataKey="queue"
                  stroke="#06b6d4"
                  strokeWidth={1}
                  dot={false}
                  isAnimationActive={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-px border-t border-neutral-800 bg-neutral-900 lg:grid-cols-2">
        <div className="min-w-0 bg-black p-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="label">records by source</span>
            <span className="font-mono text-[9px] text-neutral-600">n={SOURCE_MIX.reduce((s, x) => s + x.n, 0).toLocaleString()}</span>
          </div>
          <div className="h-[140px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={SOURCE_MIX} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid stroke="#1c1c1c" strokeDasharray="2 3" horizontal={false} />
                <XAxis type="number" {...axis} stroke="#333" />
                <YAxis type="category" dataKey="src" width={92} {...axis} stroke="#333" />
                <Tooltip
                  cursor={{ fill: '#151515' }}
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <div className="border border-neutral-700 bg-black px-2 py-1 font-mono text-[10px]">
                        <div className="text-neutral-400">{payload[0].payload.src}</div>
                        <div className="text-term-green">{payload[0].payload.n.toLocaleString()} rec</div>
                        <div className="text-neutral-500">lang: {payload[0].payload.lang}</div>
                      </div>
                    ) : null
                  }
                />
                <Bar dataKey="n" isAnimationActive={false} barSize={9}>
                  {SOURCE_MIX.map((s, i) => (
                    <Cell key={s.src} fill={['#22c55e', '#06b6d4', '#f59e0b', '#a78bfa', '#22c55e', '#ef4444'][i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="min-w-0 bg-black">
          <div className="border-b border-neutral-900 px-2 py-1">
            <span className="label">source mix</span>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th>source</th>
                <th>lang</th>
                <th>records</th>
                <th>share</th>
                <th className="w-[80px]" />
              </tr>
            </thead>
            <tbody>
              {SOURCE_MIX.map((s) => (
                <tr key={s.src}>
                  <td className="truncate text-neutral-300">{s.src}</td>
                  <td className="text-neutral-500">{s.lang}</td>
                  <td className="num">{s.n.toLocaleString()}</td>
                  <td className="num">{s.pct}%</td>
                  <td>
                    <div className="h-1 w-full bg-[#171717]">
                      <div className="h-full bg-term-cyan" style={{ width: `${s.pct * 4}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Panel C — raw inspector                                             */
/* ------------------------------------------------------------------ */
function RawInspector() {
  const tabs = [
    { id: 'json', label: 'run_manifest.json', text: RAW_JSON },
    { id: 'csv', label: 'pipeline_runs.csv', text: RAW_CSV },
    { id: 'sql', label: 'schema.sql', text: RAW_SCHEMA },
  ];
  const [t, setT] = React.useState('json');
  const [wrap, setWrap] = React.useState(false);
  const cur = tabs.find((x) => x.id === t);
  const lines = cur.text.split('\n');

  return (
    <Panel
      title="raw_output_inspector"
      accent="amber"
      right={
        <>
          <button type="button" onClick={() => setWrap((w) => !w)} className={cx('btn focus-ring', wrap && 'btn-on')}>
            [WRAP]
          </button>
          <CopyBtn text={cur.text} />
        </>
      }
      bodyClass="flex min-w-0 flex-col"
    >
      <div className="flex items-stretch overflow-x-auto border-b border-neutral-800 bg-[#0d0d0d] ticker-mask">
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setT(x.id)}
            className={cx(
              'focus-ring shrink-0 border-r border-neutral-900 px-2.5 py-1.5 font-mono text-[10px] transition-colors duration-75',
              t === x.id
                ? 'bg-black text-term-amber'
                : 'text-neutral-500 hover:bg-[#131313] hover:text-neutral-300',
            )}
          >
            {x.label}
          </button>
        ))}
        <span className="ml-auto hidden shrink-0 items-center gap-2 px-2 font-mono text-[9px] text-neutral-600 sm:flex">
          {lines.length} lines · {cur.text.length} B · utf-8
        </span>
      </div>

      <div className="max-h-[420px] overflow-auto bg-black">
        <div className="flex min-w-full font-mono text-[11px] leading-[1.55]">
          <div className="sticky left-0 shrink-0 select-none border-r border-neutral-900 bg-[#0a0a0a] px-2 py-2 text-right text-neutral-700">
            {lines.map((_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
          <pre className={cx('min-w-0 flex-1 px-3 py-2', wrap ? 'whitespace-pre-wrap break-words' : 'overflow-x-auto')}>
            <code>
              {lines.map((l, i) => (
                <div key={i} className={cx('whitespace-pre', wrap && 'whitespace-pre-wrap')}>
                  <ColorLine line={l} kind={t} />
                </div>
              ))}
            </code>
          </pre>
        </div>
      </div>
    </Panel>
  );
}

// primitive syntax tinting: keys, strings, numbers, comments
function ColorLine({ line, kind }) {
  if (kind === 'sql') {
    if (line.trim().startsWith('--')) return <span className="text-neutral-600">{line}</span>;
    return <span className="text-neutral-400">{line.replace(/^(\s*)(CREATE|SELECT|INSERT|INDEX)/, '$1$2')}</span>;
  }
  if (kind === 'csv') {
    const cells = line.split(',');
    return (
      <>
        {cells.map((c, i) => (
          <span key={i}>
            <span className={i === 0 ? 'text-term-amber' : /^-?\d+(\.\d+)?$/.test(c) ? 'text-term-cyan' : 'text-neutral-400'}>
              {c}
            </span>
            {i < cells.length - 1 && <span className="text-neutral-700">,</span>}
          </span>
        ))}
      </>
    );
  }
  const m = line.match(/^(\s*)("[^"]+")(:?)(.*)$/);
  if (m) {
    return (
      <>
        <span>{m[1]}</span>
        <span className="text-term-cyan">{m[2]}</span>
        <span className="text-neutral-600">{m[3]}</span>
        <span className={/^-?\d+(\.\d+)?,?$/.test(m[4].trim()) ? 'text-term-amber' : 'text-neutral-400'}>{m[4]}</span>
      </>
    );
  }
  return <span className="text-neutral-400">{line}</span>;
}

/* ------------------------------------------------------------------ */

export default function Dashboards() {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 border border-neutral-800 bg-[#0a0a0a] px-2.5 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-400">
          dashboards // live scraper fleet + analysis
        </span>
        <Chip tone="green">
          <StatusDot tone="green" /> streaming
        </Chip>
        <span className="ml-auto font-mono text-[9.5px] text-neutral-600">
          refresh {(REFRESH_MS / 1000).toFixed(1)}s · retention 30d · duckdb warehouse · grafana-compatible json
        </span>
      </div>
      <PipelineMonitor />
      <Analytics />
      <RawInspector />
    </div>
  );
}
