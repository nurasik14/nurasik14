/* ## 01 projects: an experiments ledger. Each row is a disclosure button;
 * #project-<id> opens a row, and opening one writes that hash back with
 * history.replaceState so the URL can be shared. */
import { useCallback, useEffect, useState } from 'react';
import { PROJECTS } from '../config/portfolio.config';
import ProjectStats from './ProjectStats';
import Section from './Section';
import Yaml from './Yaml';

const STATUS = {
  complete: { glyph: '✓', cls: 'text-ok' },
  running: { glyph: '●', cls: 'text-info' },
  archived: { glyph: '○', cls: 'text-fg-faint' },
};

const COLS = 'grid-cols-[2ch_minmax(0,1fr)_auto] lg:grid-cols-[2ch_6ch_16ch_10ch_17ch_minmax(0,1fr)]';
const stackOf = (p) => p.stack ?? p.input?.stack ?? [];
const hashId = () => {
  const m = window.location.hash.match(/^#project-(.+)$/);
  return m && PROJECTS.some((p) => p.id === m[1]) ? m[1] : null;
};

function Row({ p, open, onToggle }) {
  const s = STATUS[p.status] ?? STATUS.archived;
  const repo = p.input?.repo;
  const btnId = `project-${p.id}-button`;
  const panelId = `project-${p.id}-panel`;
  return (
    <li id={`project-${p.id}`} className="scroll-mt-16 border-b border-line-soft">
      <h3 className="m-0">
        <button
          id={btnId}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => onToggle(p.id)}
          className={`grid w-full ${COLS} items-baseline gap-x-3 gap-y-0.5 rounded px-2 py-3 text-left font-mono text-[13px] transition-colors hover:bg-surface lg:gap-x-4 ${
            open ? 'bg-surface' : ''
          }`}
        >
          <span aria-hidden className={`col-start-1 row-start-1 inline-block transition-transform duration-150 ease-out ${open ? 'rotate-90 text-signal' : 'text-fg-faint'}`}>
            ▸
          </span>
          <span className="col-start-2 row-start-1 truncate font-medium text-fg lg:col-start-3">{p.name}</span>
          <span className={`col-start-3 row-start-1 whitespace-nowrap text-right lg:col-start-4 lg:text-left ${s.cls}`}>
            <span aria-hidden>{s.glyph}</span> {p.status}
          </span>
          <span className="col-span-2 col-start-2 row-start-2 flex min-w-0 gap-2 text-fg-faint lg:contents">
            <span className="lg:col-start-2 lg:row-start-1">
              <span className="sr-only">id </span>#{p.id}
            </span>
            <span aria-hidden className="lg:hidden">·</span>
            <span className="truncate lg:col-start-5 lg:row-start-1 lg:whitespace-normal lg:text-fg-dim">
              <span className="sr-only">stack </span>
              {stackOf(p).join(', ')}
            </span>
          </span>
          <span className="col-span-2 col-start-2 row-start-3 text-fg-dim lg:col-span-1 lg:col-start-6 lg:row-start-1">{p.result}</span>
        </button>
      </h3>
      <div id={panelId} role="region" aria-labelledby={btnId} hidden={!open}>
        {open && (
          <div className="anim-disclose pb-8 pl-[calc(2ch+1.25rem)] pr-2 pt-3">
            <p className="max-w-[65ch] text-fg">{p.description}</p>
            <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
              <Yaml
                title={p.inputFile ?? 'input.yaml'}
                value={p.input}
                link={repo ? { repo: `https://github.com/${repo}` } : {}}
              />
              <div>
                <p className="label mb-2">{p.statsFile ?? 'results'}</p>
                <ProjectStats stats={p.stats} />
              </div>
            </div>
            {repo ? (
              <a
                href={`https://github.com/${repo}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn mt-5"
              >
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
    </li>
  );
}

export default function Projects({ n }) {
  const [open, setOpen] = useState(() => {
    const ids = new Set(PROJECTS.filter((p) => p.defaultOpen).map((p) => p.id));
    const h = typeof window === 'undefined' ? null : hashId();
    if (h) ids.add(h);
    return ids;
  });

  // Deep links: #project-<id> (on load or later) opens the row and scrolls to it.
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

  const repos = PROJECTS.filter((p) => p.input?.repo).length;

  return (
    <Section id="projects" n={n} title="projects" aside={`${PROJECTS.length} experiments · ${repos} public repos`}>
      <div
        aria-hidden
        // Same font as the rows: COLS is sized in `ch`, which depends on the container font.
        className={`hidden ${COLS} items-baseline gap-x-4 border-b border-line px-2 pb-2 font-mono text-[13px] lg:grid`}
      >
        {['', 'id', 'name', 'status', 'stack', 'result'].map((h) => (
          <span key={h} className="label text-[11px]">
            {h}
          </span>
        ))}
      </div>
      <ol className="border-t border-line lg:border-t-0">
        {PROJECTS.map((p) => (
          <Row key={p.id} p={p} open={open.has(p.id)} onToggle={toggle} />
        ))}
      </ol>
    </Section>
  );
}
