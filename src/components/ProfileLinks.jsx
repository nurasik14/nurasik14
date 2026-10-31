import { PROFILE } from '../config/portfolio.config';

export default function ProfileLinks({ className = '' }) {
  return (
    <ul className={`flex flex-wrap gap-x-5 gap-y-1.5 font-mono text-[13px] ${className}`}>
      {PROFILE.links.map((l) => (
        <li key={l.href}>
          <a
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-fg-dim no-underline transition-colors hover:text-fg"
          >
            <span className="text-fg-faint">{l.prefix}</span>
            {l.label}
            <span aria-hidden className="ml-0.5 text-fg-faint">↗</span>
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
