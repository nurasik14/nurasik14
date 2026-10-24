import React from 'react';

export const cx = (...a) => a.filter(Boolean).join(' ');

export const TONE = {
  green: 'text-term-green',
  amber: 'text-term-amber',
  cyan: 'text-term-cyan',
  red: 'text-term-red',
  dim: 'text-neutral-500',
  violet: 'text-term-violet',
};

export function StatusDot({ tone = 'green', live = true }) {
  const c = { green: 'bg-term-green', amber: 'bg-term-amber', red: 'bg-term-red', cyan: 'bg-term-cyan' }[
    tone
  ] || 'bg-term-green';
  return (
    <span
      className={cx('inline-block h-[6px] w-[6px] shrink-0', c, live && 'dot-live')}
      style={{ boxShadow: '0 0 6px currentColor' }}
    />
  );
}

export function Chip({ tone = 'default', children, className }) {
  const tones = {
    default: 'border-neutral-800 text-neutral-400',
    green: 'border-term-green/40 text-term-green',
    amber: 'border-term-amber/40 text-term-amber',
    red: 'border-term-red/40 text-term-red',
    cyan: 'border-term-cyan/40 text-term-cyan',
  };
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 border bg-black px-1.5 py-[1px] font-mono text-[10px] uppercase tracking-wider',
        tones[tone] || tones.default,
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Panel({ title, right, accent = 'neutral', children, className, bodyClass, id }) {
  const bar = {
    neutral: 'bg-neutral-700',
    green: 'bg-term-green',
    amber: 'bg-term-amber',
    cyan: 'bg-term-cyan',
    red: 'bg-term-red',
  }[accent];
  return (
    <section id={id} className={cx('flex min-w-0 flex-col border border-neutral-800 bg-[#0a0a0a]', className)}>
      <header className="flex h-8 shrink-0 items-center gap-2 border-b border-neutral-800 bg-[#0e0e0e] px-2.5">
        <span className={cx('h-3 w-[2px] shrink-0', bar)} />
        <h3 className="truncate font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-300">
          {title}
        </h3>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">{right}</div>
      </header>
      <div className={cx('min-w-0 flex-1', bodyClass)}>{children}</div>
    </section>
  );
}

export function Bar({ value, max = 1, tone = 'green', h = 4 }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const c = {
    green: 'bg-term-green',
    amber: 'bg-term-amber',
    cyan: 'bg-term-cyan',
    red: 'bg-term-red',
    violet: 'bg-term-violet',
  }[tone];
  return (
    <div className="w-full bg-[#171717]" style={{ height: h }}>
      <div className={cx('h-full', c)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Sparkline({ data, color = '#22c55e', fill = true, h = 22, strokeWidth = 1 }) {
  if (!data?.length) return <div style={{ height: h }} />;
  const w = 100;
  const lo = Math.min(...data);
  const hi = Math.max(...data);
  const span = hi - lo || 1;
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1 || 1)) * w;
    const y = h - ((d - lo) / span) * (h - 2) - 1;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const area = `${pts.join(' ')} ${w},${h} 0,${h}`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height: h, display: 'block' }}
      aria-hidden="true"
    >
      {fill && <polygon points={area} fill={color} opacity="0.16" />}
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={strokeWidth} />
    </svg>
  );
}

export function Metric({ k, v, sub, tone = 'default' }) {
  return (
    <div className="min-w-0 border border-neutral-900 bg-black px-2 py-1.5">
      <div className="label truncate">{k}</div>
      <div className={cx('num truncate font-mono text-[13px]', TONE[tone] || 'text-neutral-100')}>{v}</div>
      {sub && <div className="truncate font-mono text-[9px] text-neutral-600">{sub}</div>}
    </div>
  );
}

export function ExtLink({ href, children, className }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={cx('link font-mono text-[11px]', className)}
    >
      {children}
    </a>
  );
}

export function CopyBtn({ text, label }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className={cx('btn focus-ring', copied && 'btn-on')}
    >
      {copied ? '[COPIED]' : label || '[COPY]'}
    </button>
  );
}
