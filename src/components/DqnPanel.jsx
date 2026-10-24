import React from 'react';
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import { DQN_SERIES, DQN_CHECKPOINTS } from '../lib/series';
import { DQN } from '../config/experiments.config';
import { Chip, Bar, cx } from './ui';

const DATA = DQN_SERIES.filter((_, i) => i % 8 === 0);

const Tip = ({ active, payload, label, unit = '' }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="border border-neutral-700 bg-black/95 px-2 py-1 font-mono text-[10px]">
      <div className="mb-0.5 text-neutral-500">ep {label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color }}>
          {p.dataKey}: <span className="num">{typeof p.value === 'number' ? p.value.toFixed(3) : p.value}</span>
          {unit}
        </div>
      ))}
    </div>
  );
};

const axis = {
  stroke: '#333',
  tick: { fill: '#666', fontSize: 9, fontFamily: 'JetBrains Mono, monospace' },
};

export default function DqnPanel() {
  const [ep, setEp] = React.useState(1199);
  const [live, setLive] = React.useState(false);
  const [window, setWindow] = React.useState(25);

  const cur = DQN_SERIES[Math.min(ep, DQN_SERIES.length - 1)];
  const slice = React.useMemo(() => {
    const w = window;
    const out = [];
    for (const d of DQN_SERIES) {
      const start = Math.max(0, d.ep - w + 1);
      const seg = DQN_SERIES.slice(start, d.ep + 1);
      out.push({
        ep: d.ep,
        reward: +(seg.reduce((s, x) => s + x.reward, 0) / seg.length).toFixed(2),
        pipes: +(seg.reduce((s, x) => s + x.pipes, 0) / seg.length).toFixed(2),
      });
    }
    return out.filter((_, i) => i % 8 === 0);
  }, [window]);

  React.useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setEp((e) => (e >= 1199 ? 0 : e + 8)), 90);
    return () => clearInterval(id);
  }, [live]);

  const qFlap = cur.qmax;
  const qIdle = +(cur.qmax - (cur.pipes > 0 ? 1.8 : -2.6)).toFixed(2);

  return (
    <div className="flex min-w-0 flex-col">
      {/* ---- controls ---- */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-neutral-800 bg-[#0d0d0d] p-2">
        <button type="button" onClick={() => setLive((v) => !v)} className={cx('btn focus-ring', live && 'btn-on')}>
          {live ? '[■ STOP]' : '[▶ REPLAY]'}
        </button>
        <input
          type="range"
          min="0"
          max="1199"
          step="1"
          value={ep}
          onChange={(e) => {
            setLive(false);
            setEp(+e.target.value);
          }}
          className="h-1 min-w-[120px] flex-1 accent-[#22c55e]"
        />
        <span className="num font-mono text-[11px] text-term-green">ep {String(ep).padStart(4, '0')}</span>
        <span className="mx-0.5 h-3 w-px bg-neutral-800" />
        <span className="label">smooth</span>
        {[1, 25, 100].map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => setWindow(w)}
            className={cx('btn focus-ring', window === w && 'btn-on')}
          >
            {w}
          </button>
        ))}
        {DQN_CHECKPOINTS.map((c) => (
          <button
            key={c.tag}
            type="button"
            onClick={() => {
              setLive(false);
              setEp(c.ep);
            }}
            className="btn focus-ring"
          >
            {c.tag}
          </button>
        ))}
      </div>

      {/* ---- charts ---- */}
      <div className="grid gap-px bg-neutral-900 lg:grid-cols-2">
        <div className="min-w-0 bg-black p-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="label">reward / episode (ma-{window})</span>
            <span className="flex gap-2 font-mono text-[9px]">
              <span className="text-term-green">■ reward</span>
              <span className="text-term-amber">■ pipes</span>
            </span>
          </div>
          <div className="h-[150px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={slice} margin={{ top: 4, right: 6, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="#1c1c1c" strokeDasharray="2 3" vertical={false} />
                <XAxis dataKey="ep" {...axis} tickLine={false} minTickGap={28} />
                <YAxis {...axis} tickLine={false} width={38} />
                <Tooltip content={<Tip />} cursor={{ stroke: '#444', strokeWidth: 1 }} />
                <ReferenceLine x={ep - (ep % 8)} stroke="#22c55e" strokeWidth={1} />
                <ReferenceLine y={0} stroke="#333" />
                <Line type="monotone" dataKey="reward" stroke="#22c55e" strokeWidth={1.4} dot={false} />
                <Line type="monotone" dataKey="pipes" stroke="#f59e0b" strokeWidth={1} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="min-w-0 bg-black p-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="label">td-loss (huber) · ε decay</span>
            <span className="flex gap-2 font-mono text-[9px]">
              <span className="text-term-cyan">■ loss</span>
              <span className="text-term-violet">■ ε</span>
            </span>
          </div>
          <div className="h-[150px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={DATA} margin={{ top: 4, right: 6, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="gl" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.32} />
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1c1c1c" strokeDasharray="2 3" vertical={false} />
                <XAxis dataKey="ep" {...axis} tickLine={false} minTickGap={28} />
                <YAxis {...axis} tickLine={false} width={38} />
                <Tooltip content={<Tip />} cursor={{ stroke: '#444', strokeWidth: 1 }} />
                <ReferenceLine x={ep - (ep % 8)} stroke="#22c55e" strokeWidth={1} />
                <Area
                  type="monotone"
                  dataKey="loss"
                  stroke="#06b6d4"
                  strokeWidth={1.3}
                  fill="url(#gl)"
                  dot={false}
                />
                <Line type="monotone" dataKey="eps" stroke="#a78bfa" strokeWidth={1} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ---- live state readout ---- */}
      <div className="grid grid-cols-3 gap-px border-t border-neutral-800 bg-neutral-900 sm:grid-cols-6">
        {[
          { k: 'reward', v: cur.reward.toFixed(1), t: 'text-term-green' },
          { k: 'pipes', v: cur.pipes, t: 'text-neutral-100' },
          { k: 'loss', v: cur.loss.toFixed(4), t: 'text-term-cyan' },
          { k: 'epsilon', v: cur.eps.toFixed(3), t: 'text-term-violet' },
          { k: 'steps', v: cur.steps, t: 'text-neutral-300' },
          { k: 'q_max', v: cur.qmax.toFixed(2), t: 'text-term-amber' },
        ].map((m) => (
          <div key={m.k} className="bg-black px-2 py-1">
            <div className="label">{m.k}</div>
            <div className={cx('num font-mono text-[12px]', m.t)}>{m.v}</div>
          </div>
        ))}
      </div>

      {/* ---- q-values + checkpoints ---- */}
      <div className="grid gap-px border-t border-neutral-800 bg-neutral-900 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="bg-black p-2">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="label">q(s, ·) @ ep {ep}</span>
            <Chip tone="amber">ε-greedy</Chip>
          </div>
          <div className="space-y-1.5">
            {[
              { a: 'FLAP', v: qFlap },
              { a: 'IDLE', v: qIdle },
            ].map((q) => (
              <div key={q.a} className="flex items-center gap-2">
                <span className="w-9 shrink-0 font-mono text-[10px] text-neutral-400">{q.a}</span>
                <div className="min-w-0 flex-1">
                  <Bar value={Math.max(0, q.v)} max={Math.max(qFlap, qIdle, 1)} tone={q.v >= qIdle ? 'green' : 'cyan'} h={7} />
                </div>
                <span className="num w-12 shrink-0 text-right font-mono text-[10px] text-neutral-300">
                  {q.v.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 font-mono text-[9.5px] leading-4 text-neutral-600">{DQN.footerParams}</p>
        </div>

        <div className="min-w-0 bg-black">
          <div className="border-b border-neutral-900 px-2 py-1">
            <span className="label">checkpoints</span>
          </div>
          <div className="max-h-[132px] overflow-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>ep</th>
                  <th>tag</th>
                  <th>reward</th>
                  <th>pipes</th>
                  <th>loss</th>
                  <th>ε</th>
                  <th>note</th>
                </tr>
              </thead>
              <tbody>
                {DQN_CHECKPOINTS.map((c) => (
                  <tr
                    key={c.ep}
                    onClick={() => {
                      setLive(false);
                      setEp(c.ep);
                    }}
                    className={cx('cursor-pointer', ep === c.ep && 'bg-term-green/[0.07]')}
                  >
                    <td className="num text-neutral-500">{c.ep}</td>
                    <td className={cx(ep === c.ep ? 'text-term-green' : 'text-term-cyan')}>{c.tag}</td>
                    <td className="num">{c.reward}</td>
                    <td className="num">{c.pipes}</td>
                    <td className="num">{c.loss}</td>
                    <td className="num">{c.eps}</td>
                    <td className="truncate text-neutral-500">{c.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
