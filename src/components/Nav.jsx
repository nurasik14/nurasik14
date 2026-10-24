import { PROFILE } from '../config/portfolio.config';
import { SECTIONS } from '../lib/nav';

export default function Nav({ onOpenPalette }) {
  return (
    <nav aria-label="Main" className="sticky top-0 z-20 border-b border-line bg-black/90 backdrop-blur">
      <div className="wrap flex h-14 items-center gap-6">
        <a href="#top" className="whitespace-nowrap font-mono text-sm font-bold no-underline">
          <span className="text-term-green">~/</span>
          {PROFILE.handle}
        </a>
        <ul className="ml-auto hidden gap-1 md:flex">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="block rounded px-2.5 py-1.5 font-mono text-[13px] text-fg-dim no-underline hover:bg-[#0d0d0d] hover:text-neutral-200">
                <kbd className="mr-1.5 font-mono text-neutral-600">{s.key}</kbd>
                {s.label}
              </a>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onOpenPalette}
          aria-haspopup="dialog"
          className="ml-auto flex items-center gap-2 whitespace-nowrap rounded-md border border-line px-2.5 py-1.5 font-mono text-xs text-fg-dim hover:border-neutral-600 hover:text-neutral-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-term-green md:ml-0"
        >
          Jump to <kbd className="rounded-[3px] border border-line px-1.5 py-0.5 text-[11px]">Ctrl K</kbd>
        </button>
      </div>
    </nav>
  );
}
