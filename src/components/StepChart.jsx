/* Step chart for "best reward so far" logs: the value only changes at a
 * checkpoint, so the line steps instead of interpolating. Pointer or
 * keyboard (focus, then ←/→/Home/End) moves a crosshair across checkpoints.
 * series: [{ key, name, points: [[x, y], ...], stroke, fill, dashed }]
 * stroke/fill are token classes (e.g. 'stroke-fg', 'fill-fg'). */
import { useEffect, useMemo, useRef, useState } from 'react';
import { stepPath, valueAt } from '../lib/chart';

const fmt = (n) => n.toLocaleString('en-US');
const kfmt = (t) => (t ? `${t / 1000}k` : '0');

// The viewBox follows the rendered width, so axis text stays at its real
// 11-12px instead of scaling down with the figure.
function useWidth(ref, initial) {
  const [w, setW] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el || !('ResizeObserver' in window)) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

export default function StepChart({ series, xDomain, yDomain, xTicks, yTicks, xLabel, yLabel, label }) {
  const boxRef = useRef(null);
  const width = useWidth(boxRef, 480);
  const narrow = width < 420;
  const height = Math.round(Math.min(312, Math.max(222, width * 0.62)));
  // r fits the direct label (swatch + "double 53.1"; two lines when narrow);
  // b fits the tick labels plus the axis title on its own row below them.
  const m = { l: 34, r: narrow ? 78 : 112, t: 22, b: 46 };
  const sx = (x) => m.l + ((x - xDomain[0]) / (xDomain[1] - xDomain[0])) * (width - m.l - m.r);
  const sy = (y) => m.t + ((yDomain[1] - y) / (yDomain[1] - yDomain[0])) * (height - m.t - m.b);
  const stops = useMemo(() => [...new Set(series.flatMap((s) => s.points.map((p) => p[0])))].sort((a, b) => a - b), [series]);
  const maxX = stops.at(-1);
  const svgRef = useRef(null);
  const [x, setX] = useState(null);

  const onMove = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * width;
    const raw = xDomain[0] + ((px - m.l) / (width - m.l - m.r)) * (xDomain[1] - xDomain[0]);
    setX(Math.round(Math.max(xDomain[0], Math.min(maxX, raw))));
  };
  const onKey = (e) => {
    const i = x === null ? -1 : stops.findLastIndex((s) => s <= x);
    let next = null;
    if (e.key === 'ArrowRight') next = stops[Math.min(i + 1, stops.length - 1)];
    else if (e.key === 'ArrowLeft') next = stops[Math.max(i - 1, 0)];
    else if (e.key === 'Home') next = stops[0];
    else if (e.key === 'End') next = maxX;
    else if (e.key === 'Escape') return setX(null);
    else return undefined;
    e.preventDefault();
    return setX(next);
  };

  const live = x === null ? [] : series.filter((s) => x <= s.points.at(-1)[0]);
  const bottom = height - m.b;

  return (
    <div ref={boxRef}>
      <div
        tabIndex={0}
        role="group"
        aria-label={`${label} Interactive: use the left and right arrow keys to step through checkpoints.`}
        onKeyDown={onKey}
        onBlur={() => setX(null)}
        className="rounded focus-visible:outline-offset-4"
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          aria-hidden
          className="block h-auto w-full touch-pan-y overflow-visible font-mono text-[11px]"
          onPointerMove={onMove}
          onPointerLeave={() => setX(null)}
        >
          {/* grid + y axis */}
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={m.l} x2={width - m.r} y1={sy(t)} y2={sy(t)} className={t === 0 ? 'stroke-line' : 'stroke-line-soft'} />
              <text x={m.l - 8} y={sy(t) + 4} textAnchor="end" className="fill-fg-faint">
                {t}
              </text>
            </g>
          ))}
          <text x={m.l - 8} y={m.t - 10} className="fill-fg-faint">
            {yLabel}
          </text>
          {/* x axis */}
          <line x1={m.l} x2={width - m.r} y1={bottom} y2={bottom} className="stroke-line" />
          {xTicks.map((t) => (
            <g key={t}>
              <line x1={sx(t)} x2={sx(t)} y1={bottom} y2={bottom + 4} className="stroke-line-strong" />
              <text x={sx(t)} y={bottom + 17} textAnchor="middle" className="fill-fg-faint">
                {kfmt(t)}
              </text>
            </g>
          ))}
          <text x={width - m.r} y={bottom + 34} textAnchor="end" className="fill-fg-faint">
            {xLabel} →
          </text>

          {series.map((s) => {
            const [ex, ey] = s.points.at(-1);
            const dash = s.dashed ? '5 4' : undefined;
            // Direct label: a line-style swatch, then name and final value.
            const lx = sx(ex) + 10;
            // labelY (data units) pins a label into free space when the line end is crowded.
            const ly = (s.labelY != null ? sy(s.labelY) : sy(ey) + (s.labelDy ?? 4)) - (narrow ? 6 : 0);
            return (
              <g key={s.key}>
                <path
                  d={stepPath(s.points, sx, sy)}
                  fill="none"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeDasharray={dash}
                  className={s.stroke}
                />
                <circle cx={sx(ex)} cy={sy(ey)} r="3.5" className={s.fill} />
                <line x1={lx} x2={lx + 14} y1={ly - 4} y2={ly - 4} strokeWidth="2" strokeDasharray={dash} className={s.stroke} />
                {narrow ? (
                  <text x={lx + 19} y={ly} className="fill-fg text-[12px]">
                    {s.name}
                    <tspan x={lx + 19} dy="14" className="fill-fg-dim">
                      {ey}
                    </tspan>
                  </text>
                ) : (
                  <text x={lx + 19} y={ly} className="fill-fg text-[12px]">
                    {s.name} <tspan className="fill-fg-dim">{ey}</tspan>
                  </text>
                )}
              </g>
            );
          })}

          {x !== null && (
            <g pointerEvents="none">
              <line x1={sx(x)} x2={sx(x)} y1={m.t} y2={bottom} className="stroke-signal" strokeDasharray="2 3" />
              {live.map((s) => (
                <circle key={s.key} cx={sx(x)} cy={sy(valueAt(s.points, x))} r="3.5" strokeWidth="2" className={`${s.fill} stroke-bg`} />
              ))}
            </g>
          )}
          <rect x={m.l} y="0" width={width - m.l - m.r} height={height} fill="transparent" className="cursor-crosshair" />
        </svg>
      </div>
      <p aria-live="polite" className="mt-2 min-h-[1.5em] font-mono text-[12px] text-fg-dim">
        {x === null ? (
          <span className="text-fg-faint">hover, or focus and press ←/→, to read checkpoints</span>
        ) : (
          <>
            <span className="text-fg">episode {fmt(x)}</span>
            {series.map((s) => (
              <span key={s.key}>
                {' · '}
                {s.name} {x <= s.points.at(-1)[0] ? valueAt(s.points, x) : 'run stopped'}
              </span>
            ))}
          </>
        )}
      </p>
    </div>
  );
}
