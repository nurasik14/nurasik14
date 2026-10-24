export function SectionHeader({ name, aside }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2 border-b border-line pb-3.5">
      <h2 className="font-mono text-[30px] font-bold leading-tight tracking-[-0.03em]">
        <span className="font-normal text-neutral-600">./</span>
        {name}
      </h2>
      {aside && <span className="ml-auto font-mono text-[13px] text-fg-dim">{aside}</span>}
    </div>
  );
}

export function Section({ id, className = 'pt-[88px]', children }) {
  return (
    <section id={id} className={`scroll-mt-16 ${className}`}>
      <div className="wrap">{children}</div>
    </section>
  );
}
