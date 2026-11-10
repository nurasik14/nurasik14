/* The GitHub-style profile column on index.md. Desktop: a 296px sidebar,
 * sticky under the top bar only when it fits the viewport. Mobile: a top
 * block with a 64px avatar beside the name. cv.pdf is the page's one amber
 * action. */
import { useEffect, useRef, useState } from 'react';
import { AWARDS, LANG_CODES, LANGUAGES, PROFILE } from '../config/portfolio.config';
import { useGithub } from '../lib/github';
import { CV_HREF } from '../lib/nav';
import ProfileLinks from './ProfileLinks';

const GLYPH = { gold: '◆', bronze: '◇', merit: '★' };
const GH = `https://github.com/${PROFILE.github}`;
// Top bar (48px) + statusline (28px) + 16px of air under the sidebar.
const CHROME = 48 + 28 + 16;

// True when the element fits in the viewport, so making it sticky never
// hides its bottom part.
function useFits(ref) {
  const [fits, setFits] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const check = () => setFits(el.offsetHeight + CHROME <= window.innerHeight);
    check();
    const ro = 'ResizeObserver' in window ? new ResizeObserver(check) : null;
    ro?.observe(el);
    window.addEventListener('resize', check);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', check);
    };
  }, [ref]);
  return fits;
}

export function Avatar({ className = '' }) {
  const [failed, setFailed] = useState(false);
  const box = `aspect-square shrink-0 rounded-full border border-line ${className}`;
  if (failed) {
    return (
      <span
        aria-hidden
        className={`${box} flex items-center justify-center bg-surface font-mono text-[22px] font-medium text-fg-dim md:text-[64px]`}
      >
        {PROFILE.monogram}
      </span>
    );
  }
  return (
    <img
      src={PROFILE.avatar}
      alt=""
      width={260}
      height={260}
      loading="eager"
      decoding="async"
      onError={() => setFailed(true)}
      className={`${box} bg-surface object-cover`}
    />
  );
}

function GithubCounts() {
  const { status, data } = useGithub();
  if (status !== 'ready') return null;
  const items = [
    [data.followers, 'follower', 'followers', `${GH}?tab=followers`],
    [data.stars, 'star', 'stars', `${GH}?tab=repositories&sort=stargazers`],
    [data.public_repos, 'repo', 'repos', `${GH}?tab=repositories`],
  ].filter(([v]) => Number.isFinite(v));
  if (!items.length) return null;
  return (
    <p className="mt-4 font-mono text-[13px] text-fg-dim">
      {items.map(([v, one, many, href], i) => (
        <span key={many}>
          {i > 0 && <span aria-hidden className="text-fg-faint"> · </span>}
          <a href={href} target="_blank" rel="noopener noreferrer" className="no-underline transition-colors hover:text-fg">
            <span className="text-fg">{v}</span> {v === 1 ? one : many}
            <span className="sr-only"> on GitHub (opens in a new tab)</span>
          </a>
        </span>
      ))}
    </p>
  );
}

function Achievements() {
  return (
    <div className="mt-6 hidden border-t border-line-soft pt-4 md:block">
      <h2 className="label mb-3">achievements</h2>
      <ul className="space-y-2">
        {AWARDS.map((a) => (
          <li key={`${a.title}-${a.year}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-2">
            <span className="whitespace-nowrap font-mono text-[12px] text-fg-dim">
              <span aria-hidden className="mr-1 text-fg">{GLYPH[a.medal] ?? '·'}</span>
              {a.label}
            </span>
            <span className="text-[14px] leading-snug text-fg">{a.title}</span>
            <span className="font-mono text-[12px] tabular-nums text-fg-faint">{a.year}</span>
          </li>
        ))}
      </ul>
      <a href="#awards" className="link mt-3 inline-block font-mono text-[12px] text-fg-dim">
        notes in <span aria-hidden>## </span>04 awards
      </a>
    </div>
  );
}

export default function ProfileSidebar() {
  const ref = useRef(null);
  const fits = useFits(ref);
  const [what, when] = PROFILE.status.split(', ');
  return (
    // Sticky has to sit on the grid item itself to travel down the page.
    <aside ref={ref} aria-label="Profile" className={`min-w-0 pt-6 md:self-start ${fits ? 'md:sticky md:top-12' : ''}`}>
      <div>
        <div className="flex items-center gap-4 md:block">
          <Avatar className="h-16 w-16 md:h-auto md:w-full md:max-w-[260px]" />
          <div className="min-w-0 md:mt-4">
            <h1 className="font-sans text-[24px] font-semibold leading-tight tracking-[-0.02em] text-fg md:text-[26px]">
              {PROFILE.name}
              <span aria-hidden className="ml-[0.08em] inline-block h-[0.78em] w-[0.42em] translate-y-[0.1em] bg-signal" />
            </h1>
            <p className="font-mono text-[15px] text-fg-dim">
              <span className="sr-only">GitHub username: </span>
              {PROFILE.github}
            </p>
          </div>
        </div>

        <p className="mt-4 inline-flex max-w-full items-baseline gap-2 rounded border border-line bg-surface px-2.5 py-1 font-mono text-[12px] leading-relaxed text-fg">
          <span aria-hidden className="text-ok">●</span>
          <span>
            <span className="sr-only">Status: </span>
            {what}
            {when && (
              <span className="whitespace-nowrap md:block md:text-fg-dim">
                <span className="text-fg-faint md:sr-only"> · </span>
                {when}
              </span>
            )}
          </span>
        </p>

        <p className="mt-3 text-[15px] leading-[1.55] text-fg-dim">{PROFILE.bio}</p>

        <div className="mt-4 flex gap-2">
          <a href={CV_HREF} type="application/pdf" className="btn btn-primary h-9 flex-1 justify-center">
            cv.pdf <span aria-hidden>↓</span>
          </a>
          <a href={`mailto:${PROFILE.email}`} className="btn h-9 flex-1 justify-center">
            email<span className="sr-only"> {PROFILE.email}</span>
          </a>
        </div>

        <dl className="mt-4 grid grid-cols-[4.5ch_minmax(0,1fr)] gap-x-2 gap-y-1 text-[14px] leading-snug">
          <dt className="font-mono text-[12px] leading-[1.45rem] text-fg-faint">edu</dt>
          <dd className="text-fg-dim">
            {PROFILE.school}
            <span className="text-fg-faint"> · </span>
            {PROFILE.degree}
          </dd>
          <dt className="font-mono text-[12px] leading-[1.45rem] text-fg-faint">loc</dt>
          <dd className="text-fg-dim">{PROFILE.location}</dd>
          <dt className="font-mono text-[12px] leading-[1.45rem] text-fg-faint">lang</dt>
          <dd className="font-mono text-[13px] text-fg-dim">
            {LANGUAGES.map((l, i) => (
              <span key={l}>
                {i > 0 && <span className="text-fg-faint"> / </span>}
                <abbr title={l} className="no-underline">
                  <span aria-hidden>{LANG_CODES[l] ?? l}</span>
                  <span className="sr-only">{l}</span>
                </abbr>
              </span>
            ))}
          </dd>
        </dl>

        <ProfileLinks className="mt-3 flex-col gap-y-1" />
        <GithubCounts />
        <Achievements />
      </div>
    </aside>
  );
}
