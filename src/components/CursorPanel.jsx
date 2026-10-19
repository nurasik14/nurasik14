import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { LAT_SAMPLES, histogram, percentile } from '../lib/series';
import { CURSOR } from '../config/experiments.config';
import { Chip, cx, Bar as Meter } from './ui';

const BASE_HIST = histogram(LAT_SAMPLES, 16);
const VIEW = { w: CURSOR.viewW, h: CURSOR.viewH };
const SCREEN = { w: CURSOR.screenW, h: CURSOR.screenH };

export default function CursorPanel() {
  const [pt, setPt] = React.useState({ x: 0.5, y: 0.5 });
  const [lat, setLat] = React.useState(31.4);
  const [samples, setSamples] = React.useState(() => LAT_SAMPLES.slice(-60));
  const [clicks, setClicks] = React.useState(0);
  const [dwell, setDwell] = React.useState(false);
  const lastRef = React.useRef(performance.now());
  const idleRef = React.useRef();

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    const now = performance.now();
    const frameDelta = Math.min(48, now - lastRef.current);
    lastRef.current = now;
    // pose + filter + injection + capture/convert — constants live in CURSOR.model
    const M = CURSOR.model;
    const total = M.pose + M.filter + M.inject + Math.min(M.frameCap, frameDelta) + (Math.random() * M.jitter - 1.4);
    setPt({ x, y });
    setLat(+total.toFixed(1));
    setSamples((s) => [...s.slice(-119), total]);
    setDwell(false);
    clearTimeout(idleRef.current);
    idleRef.current = setTimeout(() => setDwell(true), 260);
  };

  React.useEffect(() => () => clearTimeout(idleRef.current), []);

  const hist = React.useMemo(() => {
    const merged = histogram(samples, 16);
    return BASE_HIST.map((b, i) => ({ ...b, live: merged[i]?.n ?? 0 }));
  }, [samples]);

  const p50 = percentile(samples, 50);
  const p95 = percentile(samples, 95);
  const sx = Math.round(pt.x * SCREEN.w);
  const sy = Math.round(pt.y * SCREEN.h);
  const wx = pt.x * VIEW.w;
  const wy = pt.y * VIEW.h;
  const shoulder = { x: 120, y: 300 };
  const elbow = { x: shoulder.x + (wx - shoulder.x) * 0.45, y: shoulder.y - 40 + (wy - shoulder.y) * 0.3 };

  return (
    <div className="flex min-w-0 flex-col">
      <div className="grid gap-px bg-neutral-900 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        {/* ---- camera frame ---- */}
        <div className="min-w-0 bg-black p-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="label">camera_frame · 640x480 @30fps · cpu-only</span>
            <Chip tone={dwell ? 'amber' : 'green'}>{dwell ? 'dwell: armed' : 'tracking'}</Chip>
          </div>
          <div
            onMouseMove={onMove}
            onMouseDown={() => setClicks((c) => c + 1)}
            className="relative w-full cursor-none overflow-hidden border border-neutral-800 bg-[#050505] grid-bg"
            style={{ aspectRatio: '4 / 3' }}
          >
            <svg viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} className="absolute inset-0 h-full w-full">
              {/* pose skeleton */}
              <polyline
                points={`${shoulder.x},${shoulder.y} ${elbow.x},${elbow.y} ${wx},${wy}`}
                stroke="#22c55e"
                strokeWidth={2}
                fill="none"
              />
              {[
                { x: shoulder.x, y: shoulder.y, id: '12' },
                { x: elbow.x, y: elbow.y, id: '14' },
                { x: wx, y: wy, id: '16' },
              ].map((l) => (
                <g key={l.id}>
                  <circle cx={l.x} cy={l.y} r={4} fill="#000" stroke="#22c55e" strokeWidth={1.5} />
                  <text x={l.x + 8} y={l.y - 6} fill="#6b6b6b" fontSize="9" fontFamily="JetBrains Mono, monospace">
                    {l.id}
                  </text>
                </g>
              ))}
              {/* pinch vector: thumb(4) -> index(8) */}
              <line
                x1={wx - 14}
                y1={wy + 10}
                x2={wx + 10}
                y2={wy - 8}
                stroke="#f59e0b"
                strokeWidth={1.5}
                strokeDasharray="3 2"
              />
              <circle cx={wx - 14} cy={wy + 10} r={2.5} fill="#f59e0b" />
              <circle cx={wx + 10} cy={wy - 8} r={2.5} fill="#f59e0b" />
              <text x={wx + 14} y={wy + 4} fill="#8a8a8a" fontSize="9" fontFamily="JetBrains Mono, monospace">
                pinch d={dwell ? '12.4 [GATE]' : '31.8'}
              </text>
              {/* mapped cursor */}
              <g>
                <line x1={wx} y1={0} x2={wx} y2={VIEW.h} stroke="#06b6d4" strokeOpacity={0.22} strokeWidth={1} />
                <line x1={0} y1={wy} x2={VIEW.w} y2={wy} stroke="#06b6d4" strokeOpacity={0.22} strokeWidth={1} />
                <path
                  d={`M ${wx} ${wy} l 0 16 l 4.5 -4 l 3 7 l 3 -1.5 l -3 -7 l 6.5 -1 z`}
                  fill="#06b6d4"
                  stroke="#000"
                  strokeWidth={0.6}
                />
              </g>
            </svg>
            <div className="pointer-events-none absolute left-1.5 top-1.5 font-mono text-[9px] leading-3 text-neutral-500">
              <div>
                landmark <span className="text-term-green">16</span> ({wx.toFixed(0)}, {wy.toFixed(0)})
              </div>
              <div>
                mapped <span className="text-term-cyan">{sx}</span>, <span className="text-term-cyan">{sy}</span>
              </div>
            </div>
            <div className="pointer-events-none absolute bottom-1.5 left-1.5 font-mono text-[9px] text-neutral-600">
              move pointer → drives wrist landmark · click → fires pinch
            </div>
            <div className="pointer-events-none absolute bottom-1.5 right-1.5 font-mono text-[9px]">
              <span className={cx(lat > 50 ? 'text-term-amber' : 'text-term-green')}>{lat.toFixed(1)} ms</span>
            </div>
          </div>
        </div>

        {/* ---- latency + state ---- */}
        <div className="flex min-w-0 flex-col bg-black p-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="label">latency distribution (n={samples.length})</span>
            <Chip tone="green">
              p50 {p50}ms
            </Chip>
          </div>
          <div className="h-[132px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hist} margin={{ top: 4, right: 2, bottom: 0, left: -22 }}>
                <CartesianGrid stroke="#1c1c1c" strokeDasharray="2 3" vertical={false} />
                <XAxis dataKey="bin" tick={{ fill: '#666', fontSize: 8 }} tickLine={false} interval={3} />
                <YAxis tick={{ fill: '#666', fontSize: 8 }} tickLine={false} width={34} />
                <Tooltip
                  cursor={{ fill: '#151515' }}
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <div className="border border-neutral-700 bg-black px-2 py-1 font-mono text-[10px]">
                        <div className="text-neutral-500">{payload[0].payload.edge} ms</div>
                        <div className="text-term-green">n = {payload[0].payload.n}</div>
                      </div>
                    ) : null
                  }
                />
                <Bar dataKey="n" isAnimationActive={false}>
                  {hist.map((b) => (
                    <Cell key={b.bin} fill={b.bin > 50 ? '#ef4444' : b.bin > 43 ? '#f59e0b' : '#22c55e'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-px bg-neutral-900">
            {[
              { k: 'p50', v: `${p50}ms`, t: 'text-term-green' },
              { k: 'p95', v: `${p95}ms`, t: p95 > 50 ? 'text-term-amber' : 'text-term-green' },
              { k: 'live', v: `${lat.toFixed(1)}ms`, t: lat > 50 ? 'text-term-amber' : 'text-term-green' },
              { k: 'clicks', v: clicks, t: 'text-neutral-100' },
            ].map((m) => (
              <div key={m.k} className="bg-black px-2 py-1">
                <div className="label">{m.k}</div>
                <div className={cx('num font-mono text-[12px]', m.t)}>{m.v}</div>
              </div>
            ))}
          </div>
          <div className="mt-1.5 space-y-1 border-t border-neutral-900 pt-1.5">
            {CURSOR.stages.map((s) => (
              <div key={s.k} className="flex items-center gap-2">
                <span className="w-[112px] shrink-0 truncate font-mono text-[9.5px] text-neutral-500">{s.k}</span>
                <div className="min-w-0 flex-1">
                  <Meter value={s.v} max={22} tone={s.v > 15 ? 'amber' : 'green'} h={4} />
                </div>
                <span className="num w-9 shrink-0 text-right font-mono text-[9.5px] text-neutral-500">
                  {s.v.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-1.5 font-mono text-[9px] leading-[13px] text-neutral-600">
{CURSOR.note}
          </p>
        </div>
      </div>
    </div>
  );
}
