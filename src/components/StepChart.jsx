/* Step chart for "best reward so far" logs: the value only changes at a
 * checkpoint, so the line steps instead of interpolating.
 * series: [{ key, name, points: [[x, y], ...], color, dashed, label }] */
import { useRef, useState } from 'react';
import { stepPath, valueAt } from '../lib/chart';

const fmt = (n) => n.toLocaleString('en-US');

export default function StepChart({ series, xDomain, yDomain, xTicks, yTicks, label, width = 640, height = 260 }) {
  const m = { l: 30, r: 96, t: 14, b: 34 };
  const sx = (x) => m.l + ((x - xDomain[0]) / (xDomain[1] - xDomain[0])) * (width - m.l - m.r);
  const sy = (y) => m.t + ((yDomain[1] - y) / (yDomain[1] - yDomain[0])) * (height - m.t - m.b);
  const maxX = Math.max(...series.map((s) => s.points.at(-1)[0]));
  const svgRef = useRef(null);
  const [hover, setHover] = useState(null);

  const onMove = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * width;
    const x = xDomain[0] + ((px - m.l) / (width - m.l - m.r)) * (xDomain[1] - xDomain[0]);
    setHover({ x: Math.round(Math.max(xDomain[0], Math.min(maxX, x))), scale: r.width / width, w: r.width });
  };

  const live = hover ? series.filter((s) => hover.x <= s.points.at(-1)[0]) : [];
  const top = Math.min(...live.map((s) => sy(valueAt(s.points, hover.x))));

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={label}
        className="block h-auto w-full overflow-visible font-mono text-[11px]"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={width - m.r} y1={sy(t)} y2={sy(t)} stroke={t === 0 ? '#262626' : '#1a1a1a'} />
            <text x={m.l - 8} y={sy(t) + 4} textAnchor="end" fill="#8a8a8a">
              {t}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={t} x={sx(t)} y={height - m.b + 18} textAnchor="middle" fill="#8a8a8a">
            {t ? `${t / 1000}k` : '0'}
          </text>
        ))}
        <text x={m.l} y={height - 2} fill="#8a8a8a">
          episodes
        </text>

        {series.map((s) => {
          const [ex, ey] = s.points.at(-1);
          return (
            <g key={s.key}>
              <path
                d={stepPath(s.points, sx, sy)}
                fill="none"
                stroke={s.color}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeDasharray={s.dashed ? '5 4' : undefined}
              />
              <circle cx={sx(ex)} cy={sy(ey)} r="4.5" fill={s.color} stroke="#0a0a0a" strokeWidth="2" />
              <text x={sx(ex) + 10} y={sy(ey) + (s.labelDy ?? 4)} fill="#e5e5e5" fontSize="12">
                {s.label}
              </text>
            </g>
          );
        })}

        {hover && (
          <g pointerEvents="none">
            <line x1={sx(hover.x)} x2={sx(hover.x)} y1={m.t} y2={height - m.b} stroke="#8a8a8a" strokeDasharray="2 3" />
            {live.map((s) => (
              <circle key={s.key} cx={sx(hover.x)} cy={sy(valueAt(s.points, hover.x))} r="4" fill={s.color} stroke="#0a0a0a" strokeWidth="2" />
            ))}
          </g>
        )}
        <rect x={m.l} y="0" width={width - m.l - m.r} height={height} fill="transparent" className="cursor-crosshair" />
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute whitespace-nowrap rounded-md border border-line bg-black px-2.5 py-1.5 font-mono text-xs leading-normal"
          style={{
            left: Math.min(Math.max(sx(hover.x) * hover.scale, 80), hover.w - 80),
            top: top * hover.scale,
            transform: 'translate(-50%, calc(-100% - 12px))',
          }}
        >
          <div className="text-fg-dim">episode {fmt(hover.x)}</div>
          {live.map((s) => (
            <div key={s.key}>
              <span className="mr-1.5 inline-block h-0.5 w-2.5 align-middle" style={{ background: s.color }} />
              {s.name} best {valueAt(s.points, hover.x)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
