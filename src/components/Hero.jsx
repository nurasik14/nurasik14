import { PROFILE } from '../config/portfolio.config';
import AgentRun from './AgentRun';

export function ProfileLinks({ className = '' }) {
  return (
    <div className={`flex flex-wrap gap-x-5 gap-y-1.5 font-mono text-[13px] ${className}`}>
      {PROFILE.links.map((l) => (
        <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="text-fg-dim no-underline hover:text-neutral-200">
          <span className="text-neutral-600">{l.prefix}</span>
          {l.label}
        </a>
      ))}
    </div>
  );
}

export default function Hero() {
  const [first, last] = PROFILE.name.split(' ');
  return (
    <header className="wrap grid grid-cols-[minmax(0,1fr)] items-start gap-12 pb-12 pt-14 lg:grid-cols-2">
      <div>
        <span className="inline-flex items-center gap-2.5 rounded-full border border-line bg-black py-1 pl-2.5 pr-3 font-mono text-[13px] text-fg-dim">
          <i aria-hidden className="size-[7px] rounded-full bg-term-green shadow-[0_0_0_3px_rgba(34,197,94,.18)]" />
          {PROFILE.status}
        </span>
        <h1 className="mt-7 font-mono text-[clamp(3rem,8.4vw,7rem)] font-extrabold leading-[0.92] tracking-[-0.055em]">
          {first}
          <br />
          {last}
          <span aria-hidden className="ml-[0.08em] inline-block h-[0.82em] w-[0.5em] bg-term-green align-[-0.04em]" />
        </h1>
        <p className="mt-5 font-mono text-[15px] text-fg-dim">
          {PROFILE.focus.map((f, i) => (
            <span key={f}>
              {i > 0 && <span className="text-neutral-600"> / </span>}
              <b className="font-medium text-neutral-200">{f}</b>
            </span>
          ))}
        </p>
        <p className="mt-5 max-w-[32em] font-sans text-[19px] leading-[1.55] text-neutral-300">{PROFILE.lede}</p>
        <div className="mt-7 flex flex-wrap gap-2.5">
          <a href="#projects" className="btn btn-primary">
            See projects <kbd className="text-[11px] opacity-70">1</kbd>
          </a>
          <a href={`${import.meta.env.BASE_URL}${PROFILE.cv}`} target="_blank" rel="noopener noreferrer" className="btn">
            Download CV
          </a>
        </div>
        <ProfileLinks className="mt-6" />
      </div>
      <AgentRun />
    </header>
  );
}
