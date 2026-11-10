/* ## 01 projects: GitHub-style pinned cards (two columns when the column is
 * wide enough), then archived projects as a compact list. Each card has a
 * "details" disclosure with the config YAML and the results panel. In the
 * grid a card's details sit full width under its row (grid-auto-flow:
 * dense lets the next card fill the slot beside it).
 * #project-<id> opens that project and scrolls to it; opening one writes the
 * hash back with history.replaceState so the URL can be shared. */
import { useCallback, useEffect, useState } from 'react';
import { LANG_COLORS, PROJECTS } from '../config/portfolio.config';
import ProjectStats from './ProjectStats';
import Section from './Section';
import Yaml from './Yaml';

const STATUS = {
  complete: { glyph: '✓', cls: 'text-ok' },
  running: { glyph: '●', cls: 'text-info' },
  archived: { glyph: '○', cls: 'text-fg-faint' },
};

const stackOf = (p) => p.stack ?? p.input?.stack ?? [];
const repoUrl = (p) => (p.input?.repo ? `https://github.com/${p.input.repo}` : null);
const PINNED = PROJECTS.filter((p) => p.status !== 'archived');
const ARCHIVED = PROJECTS.filter((p) => p.status === 'archived');

const hashId = () => {
  const m = window.location.hash.match(/^#project-(.+)$/);
  return m && PROJECTS.some((p) => p.id === m[1]) ? m[1] : null;
};

function Status({ status }) {
  const s = STATUS[status] ?? STATUS.archived;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-line px-2 font-mono text-[12px] leading-[1.6] ${s.cls}`}>
      <span aria-hidden>{s.glyph}</span>
      <span className="sr-only">status: </span>
      {status}
    </span>
  );
}

function StackDots({ items }) {
  if (!items.length) return null;
  return (
    <ul aria-label="stack" className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[12px] text-fg-dim">
      {items.map((t) => {
        const color = LANG_COLORS[t.toLowerCase()];
        return (
          <li key={t} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className={`inline-block size-2.5 rounded-full ${color ? '' : 'border border-fg-faint'}`}
              style={color ? { backgroundColor: color } : undefined}
            />
            {t}
          </li>
        );
      })}
    </ul>
  );
}

function Toggle({ p, open, onToggle, className = '' }) {
  return (
    <button
      id={`project-${p.id}-button`}
      type="button"
      aria-expanded={open}
      aria-controls={`project-${p.id}-panel`}
      onClick={() => onToggle(p.id)}
      className={`btn h-8 shrink-0 gap-1.5 px-2.5 text-[12px] ${open ? 'border-fg-dim bg-surface-2' : ''} ${className}`}
    >
      <span aria-hidden className={`inline-block transition-transform duration-150 ease-out ${open ? 'rotate-90' : ''}`}>
        ▸
      </span>
      details<span className="sr-only"> for {p.name}</span>
    </button>
  );
}

// The disclosed details: config YAML, the results panel, the repo link.
function Details({ p, open, className = '' }) {
  const repo = p.input?.repo;
  return (
    <div
      id={`project-${p.id}-panel`}
      role="region"
      aria-label={`${p.name} details`}
      hidden={!open}
      className={className}
    >
      {open && (
        <div className="anim-disclose rounded border border-line bg-bg p-4">
          <p className="mb-3 font-mono text-[12px] text-fg-faint">
            <span className="text-fg-dim">{p.name}</span> / details
          </p>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-5 min-[1180px]:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            {p.input && (
              <Yaml title={p.inputFile ?? 'input.yaml'} value={p.input} link={repo ? { repo: repoUrl(p) } : {}} />
            )}
            <div className="min-w-0">
              <p className="label mb-2">{p.statsFile ?? 'results'}</p>
              <ProjectStats stats={p.stats} />
            </div>
          </div>
          {repo ? (
            <a href={repoUrl(p)} target="_blank" rel="noopener noreferrer" className="btn mt-5">
              open repo{' '}
              <span className="min-w-0 truncate text-fg-dim">
                {/* Kept in the accessible name; only hidden visually on phones. */}
                <span className="sr-only sm:not-sr-only">github.com/</span>
                {repo}
              </span>{' '}
              <span aria-hidden>↗</span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : (
            <p className="mt-5 font-mono text-[12px] text-fg-faint">no public repo yet</p>
          )}
        </div>
      )}
    </div>
  );
}

function Card({ p, open, onToggle }) {
  const url = repoUrl(p);
  return (
    <article
      id={`project-${p.id}`}
      aria-labelledby={`project-${p.id}-name`}
      className={`flex min-w-0 scroll-mt-16 flex-col rounded border bg-bg p-4 transition-colors ${open ? 'border-line-strong' : 'border-line'}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <h4 id={`project-${p.id}-name`} className="min-w-0 font-mono text-[14px] font-semibold leading-snug [overflow-wrap:anywhere]">
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-info no-underline hover:underline">
              {p.name}
              <span className="sr-only"> (GitHub: {p.input.repo}, opens in a new tab)</span>
            </a>
          ) : (
            <span className="text-fg">{p.name}</span>
          )}
        </h4>
        <Status status={p.status} />
      </div>
      <p className="mt-2 flex-1 text-[14px] leading-[1.55] text-fg-dim">{p.description}</p>
      <p className="mt-3 font-mono text-[12px] leading-relaxed">
        <span className="text-fg-faint">result: </span>
        <span className="text-fg">{p.result}</span>
      </p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <StackDots items={stackOf(p)} />
        <Toggle p={p} open={open} onToggle={onToggle} />
      </div>
    </article>
  );
}

function ArchivedRow({ p, open, onToggle }) {
  return (
    <li id={`project-${p.id}`} className="scroll-mt-16 border-b border-line-soft py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h4 className="min-w-0 font-mono text-[13px] font-medium text-fg">{p.name}</h4>
        <span className="font-mono text-[12px] text-fg-faint">
          <span aria-hidden>{STATUS.archived.glyph} </span>
          <span className="sr-only">status: </span>
          {p.status}
        </span>
        <span className="min-w-0 flex-1 basis-[16rem] text-[14px] text-fg-dim">
          {p.description} <span className="font-mono text-[12px] text-fg-faint">({p.result})</span>
        </span>
        <Toggle p={p} open={open} onToggle={onToggle} />
      </div>
      <Details p={p} open={open} className="mt-3" />
    </li>
  );
}

export default function Projects({ n, children }) {
  const [open, setOpen] = useState(() => {
    const ids = new Set(PROJECTS.filter((p) => p.defaultOpen).map((p) => p.id));
    const h = typeof window === 'undefined' ? null : hashId();
    if (h) ids.add(h);
    return ids;
  });

  // Deep links: #project-<id> (on load or later) opens the project and scrolls to it.
  useEffect(() => {
    const onHash = (first) => {
      const id = hashId();
      if (!id) return;
      setOpen((s) => (s.has(id) ? s : new Set(s).add(id)));
      requestAnimationFrame(() =>
        document.getElementById(`project-${id}`)?.scrollIntoView({ block: 'start', behavior: first === true ? 'auto' : undefined }),
      );
    };
    onHash(true);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const toggle = useCallback(
    (id) => {
      const willOpen = !open.has(id);
      setOpen((s) => {
        const next = new Set(s);
        if (willOpen) next.add(id);
        else next.delete(id);
        return next;
      });
      const { pathname, search, hash } = window.location;
      const self = `#project-${id}`;
      if (willOpen) window.history.replaceState(null, '', `${pathname}${search}${self}`);
      else if (hash === self) window.history.replaceState(null, '', `${pathname}${search}`);
    },
    [open],
  );

  return (
    <Section id="projects" n={n} title="projects" aside={`${PINNED.length} pinned · ${ARCHIVED.length} archived`}>
      <h3 className="label mb-3">pinned</h3>
      <div className="pinned-grid">
        {PINNED.flatMap((p) => [
          <Card key={p.id} p={p} open={open.has(p.id)} onToggle={toggle} />,
          <Details key={`${p.id}-details`} p={p} open={open.has(p.id)} className="pinned-details" />,
        ])}
      </div>

      {ARCHIVED.length > 0 && (
        <>
          <h3 className="label mb-1 mt-10">archived</h3>
          <ul className="border-t border-line-soft">
            {ARCHIVED.map((p) => (
              <ArchivedRow key={p.id} p={p} open={open.has(p.id)} onToggle={toggle} />
            ))}
          </ul>
        </>
      )}
      {children}
    </Section>
  );
}
