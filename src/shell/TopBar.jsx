// Sticky 48px bar: home link, buffer tabs (real links), command button, CV.
import { PROFILE } from '../config/portfolio.config';
import { BASE, CV_HREF, PAGES } from '../lib/nav';

const isMac = () => /mac|iphone|ipad/i.test(navigator.userAgentData?.platform || navigator.platform || '');

export default function TopBar({ page, cmdOpen, onCommand }) {
  const mac = isMac();
  return (
    <header className="sticky top-0 z-30 h-12 border-b border-line bg-bg">
      <div className="wrap flex h-full items-stretch gap-2 font-mono text-[12px] sm:gap-5 sm:text-[13px]">
        <a
          href={BASE}
          className="flex shrink-0 items-center text-fg no-underline transition-colors hover:text-signal"
        >
          <span className="text-fg-faint">~</span>
          <span className="max-[399px]:sr-only">
            <span className="text-fg-faint">/</span>
            {PROFILE.handle}
          </span>
        </a>

        <nav aria-label="Buffers" className="flex min-w-0">
          <ul className="flex items-stretch">
            {Object.entries(PAGES).map(([key, p]) => {
              const active = key === page;
              return (
                <li key={key} className="flex">
                  <a
                    href={p.href}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center border-x px-2 no-underline transition-colors sm:px-3.5 ${
                      active
                        ? 'border-line bg-surface text-fg shadow-[inset_0_-2px_0_rgb(var(--signal))]'
                        : 'border-transparent text-fg-dim hover:bg-surface hover:text-fg'
                    }`}
                  >
                    {p.buffer}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onCommand}
            aria-haspopup="dialog"
            aria-expanded={cmdOpen}
            aria-keyshortcuts={mac ? 'Meta+K :' : 'Control+K :'}
            aria-label="Open command line"
            className="btn h-8 gap-2 px-2.5 text-[12px]"
          >
            <span aria-hidden className="font-semibold text-fg">:</span>
            <span aria-hidden className="hidden text-fg-dim md:inline">command</span>
            <kbd aria-hidden className="kbd hidden sm:inline-flex">{mac ? '⌘ K' : 'Ctrl K'}</kbd>
          </button>
          <a href={CV_HREF} className="btn hidden h-8 px-2.5 text-[12px] sm:inline-flex" type="application/pdf">
            cv.pdf <span aria-hidden className="text-fg-dim">↓</span>
          </a>
        </div>
      </div>
    </header>
  );
}
