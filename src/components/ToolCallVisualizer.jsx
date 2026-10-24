/* ToolCallVisualizer, adapted for the portfolio:
 *  - the right panel shows `stats` (any React node: charts, figures)
 *    instead of a raw JSON result; `result` still works as a fallback
 *  - a third status, 'archived', for work without published code
 *  - an optional plain-English `description` under the signature
 *  - recoloured to the site palette */
import * as React from 'react';
import { Archive, Check, ChevronRight, LoaderCircle, Wrench } from './icons';
import JsonView from './JsonView';

const STATUS = {
  complete: { Icon: Check, label: 'finished', className: 'text-term-green' },
  running: { Icon: LoaderCircle, label: 'running', className: 'animate-spin text-term-amber motion-reduce:animate-none' },
  archived: { Icon: Archive, label: 'archived', className: 'text-neutral-500' },
};

export function ToolCallVisualizer({
  id,
  name,
  input,
  description,
  stats,
  result,
  status = 'complete',
  defaultOpen = false,
  inputLabel,
  statsLabel,
  className,
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const bodyId = `${id ?? name}-body`;
  const [firstKey, summary] = Object.entries(input)[0] ?? [];
  const { Icon, label, className: iconClass } = STATUS[status];

  // lets the command palette open a card from outside
  React.useEffect(() => {
    const onOpen = (e) => e.detail === id && setOpen(true);
    window.addEventListener('toolcall:open', onOpen);
    return () => window.removeEventListener('toolcall:open', onOpen);
  }, [id]);

  return (
    <article
      id={id}
      className={`w-full scroll-mt-20 overflow-hidden rounded-[10px] border bg-panel ${open ? 'border-[#333]' : 'border-line'} ${className ?? ''}`}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((value) => !value)}
        className="group flex w-full items-center gap-3.5 px-4 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-term-green sm:px-[18px]"
      >
        <span className="hidden size-8 shrink-0 place-items-center self-start rounded-lg border border-line text-neutral-500 sm:grid">
          <Wrench className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block break-words font-mono text-[14.5px] text-neutral-200">
            <span className="font-medium">{name}</span>
            <span className="text-neutral-600">(</span>
            <span className="text-term-cyan">
              {firstKey}={JSON.stringify(summary).replace(/","/g, '", "')}
            </span>
            <span className="text-neutral-600">)</span>
          </span>
          {description && (
            <span className="mt-1 block font-sans text-[15px] leading-normal text-fg-dim">{description}</span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-2 font-mono text-xs text-fg-dim">
          <Icon className={`size-4 ${iconClass}`} />
          <span className="hidden sm:inline">{label}</span>
        </span>
        <ChevronRight
          className={`size-4 shrink-0 text-fg-dim transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
        />
      </button>
      <div
        id={bodyId}
        inert={!open}
        className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="overflow-hidden">
          <div className="grid gap-px border-t border-line bg-line md:grid-cols-[5fr_7fr]">
            <Panel label="input" meta={inputLabel}>
              <JsonView value={input} />
            </Panel>
            <Panel label="stats" meta={statsLabel}>
              {stats ?? (
                <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-fg-dim">
                  {status === 'running' ? 'Waiting for response…' : JSON.stringify(result, null, 2)}
                </pre>
              )}
            </Panel>
          </div>
        </div>
      </div>
    </article>
  );
}

function Panel({ label, meta, children }) {
  return (
    <div className="min-w-0 bg-panel p-4 sm:p-[18px]">
      <p className="mb-3.5 flex justify-between gap-2 font-mono text-xs text-fg-dim">
        <span>{label}</span>
        {meta && <span>{meta}</span>}
      </p>
      {children}
    </div>
  );
}

export default ToolCallVisualizer;
