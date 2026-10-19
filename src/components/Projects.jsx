import React from 'react';
import { PROJECTS } from '../config/projects.config';
import { Panel, Chip, StatusDot, ExtLink, cx } from './ui';
import RagHarness from './RagHarness';
import DqnPanel from './DqnPanel';
import CursorPanel from './CursorPanel';

const WIDGET = {
  'trilingual-rag': { el: <RagHarness />, label: 'eval_harness.py' },
  'dqn-flappy': { el: <DqnPanel />, label: 'train_monitor.py' },
  'handsfree-cursor': { el: <CursorPanel />, label: 'pose_probe.py' },
};

const toneOf = (s) => (s === 'ONLINE' ? 'green' : s === 'TRAINED' ? 'cyan' : 'amber');

export default function Projects() {
  const [open, setOpen] = React.useState(() => PROJECTS.map((p) => p.id));
  const toggle = (id) => setOpen((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));

  return (
    <div className="flex flex-col gap-2">
      {PROJECTS.map((p) => {
        const w = WIDGET[p.slug];
        const collapsed = !open.includes(p.id);
        return (
          <Panel
            key={p.id}
            id={p.slug}
            title={`${p.id} :: ${p.name}`}
            accent={toneOf(p.status)}
            right={
              <>
                <Chip tone="default">{p.version}</Chip>
                <Chip tone={toneOf(p.status)}>
                  <StatusDot tone={toneOf(p.status) === 'cyan' ? 'cyan' : 'green'} live={p.status === 'ONLINE'} />
                  {p.status}
                </Chip>
                <button
                  type="button"
                  onClick={() => toggle(p.id)}
                  className="btn focus-ring px-1.5"
                  aria-expanded={!collapsed}
                >
                  {collapsed ? '[+]' : '[–]'}
                </button>
              </>
            }
            bodyClass={cx('grid min-w-0', !collapsed && 'lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]')}
          >
            {/* ---- spec column ---- */}
            <div className={cx('min-w-0', !collapsed && 'border-b border-neutral-800 lg:border-b-0 lg:border-r')}>
              <div className="border-b border-neutral-900 p-2.5">
                <p className="prose-tech mb-2 text-neutral-300">{p.tagline}</p>
                {!collapsed && <p className="prose-tech">{p.body}</p>}
              </div>
              <div className="grid grid-cols-2 gap-px bg-neutral-900">
                {p.metrics.map((m) => (
                  <div key={m.k} className="bg-black px-2 py-1">
                    <div className="label truncate">{m.k}</div>
                    <div className="num truncate font-mono text-[11.5px] text-neutral-200">{m.v}</div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 border-t border-neutral-900 p-2">
                {p.tags.map((t) => (
                  <span key={t} className="font-mono text-[9.5px] text-neutral-600">
                    {t}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5 border-t border-neutral-900 p-2">
                {p.links.map((l) => (
                  <ExtLink
                    key={l.label}
                    href={l.href}
                    className={cx(
                      'border px-1.5 py-[2px] no-underline transition-colors duration-75',
                      l.tone === 'cyan'
                        ? 'border-term-cyan/30 text-term-cyan hover:bg-term-cyan/10'
                        : l.tone === 'amber'
                          ? 'border-term-amber/30 text-term-amber hover:bg-term-amber/10'
                          : 'border-neutral-800 text-neutral-400 hover:bg-[#131313]',
                    )}
                  >
                    {l.label}
                  </ExtLink>
                ))}
              </div>
              <div className="border-t border-neutral-900 px-2 py-1.5 font-mono text-[9.5px] text-neutral-600">
                <div>
                  <span className="text-neutral-700">runtime: </span>
                  {p.runtime}
                </div>
                <div>
                  <span className="text-neutral-700">lang: </span>
                  {p.lang}
                </div>
              </div>
            </div>

            {/* ---- instrumented widget ---- */}
            {!collapsed && (
              <div className="flex min-w-0 flex-col">
                <div className="flex h-7 items-center gap-2 border-b border-neutral-800 bg-[#0c0c0c] px-2.5">
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-neutral-500">
                    {w?.label ?? 'module.unregistered'}
                  </span>
                  <Chip tone={w ? 'green' : 'amber'} className="ml-auto">
                    <StatusDot tone={w ? 'green' : 'amber'} />
                    {w ? 'live' : 'no widget'}
                  </Chip>
                </div>
                {w?.el ?? (
                  <div className="px-2.5 py-2 font-mono text-[10px] leading-4 text-neutral-500">
                    <span className="text-term-amber">slug &ldquo;{p.slug}&rdquo;</span> has no entry in{' '}
                    <span className="text-neutral-300">WIDGET</span> in{' '}
                    <span className="text-neutral-300">src/components/Projects.jsx</span>. Add one there
                    (or reuse an existing slug) to give this module an interactive panel — the rest of
                    this module renders normally.
                  </div>
                )}
              </div>
            )}
          </Panel>
        );
      })}
    </div>
  );
}
