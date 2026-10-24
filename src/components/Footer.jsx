import React from 'react';
import { PROFILE, NAV, FOOTER, TOPBAR } from '../config/site.config';
import { ExtLink, cx } from './ui';

export default function Footer({ setTab }) {
  return (
    <footer className="mt-2 border-t border-neutral-800 bg-black">
      <div className="border-b border-neutral-900 px-2.5 py-3">
        <div className="flex flex-wrap items-baseline gap-1 font-mono text-[12px]">
          <span className="text-term-green">{PROFILE.handle}</span>
          <span className="text-neutral-600">@</span>
          <span className="text-term-cyan">portfolio</span>
          <span className="text-neutral-600">:</span>
          <span className="text-neutral-400">~</span>
          <span className="text-neutral-600">$ </span>
          <span className="text-neutral-200">./contact --all</span>
          <span className="caret ml-0.5" />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-3 font-mono text-[11px]">
          <ExtLink href={PROFILE.links.email} className="text-term-green">
            mailto:{PROFILE.links.emailText}
          </ExtLink>
          <span className="text-neutral-700">│</span>
          <ExtLink href={PROFILE.links.github}>{PROFILE.links.githubText}</ExtLink>
          <span className="text-neutral-700">│</span>
          <ExtLink href={PROFILE.links.linkedin}>{PROFILE.links.linkedinText}</ExtLink>
          <span className="text-neutral-700">│</span>
          <ExtLink href={PROFILE.links.hf} className="text-term-amber">
            {PROFILE.links.hfText}
          </ExtLink>
        </div>
        <div className="mt-2 flex flex-wrap gap-1 pl-3">
          {NAV.map((n) => (
            <button
              key={n.flag}
              type="button"
              onClick={() => setTab(n.label)}
              className="border border-neutral-800 px-1.5 py-[1px] font-mono text-[9.5px] text-neutral-500 transition-colors duration-75 hover:border-neutral-600 hover:text-neutral-200"
            >
              {n.flag}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 py-1.5 font-mono text-[9.5px] text-neutral-600">
        <span>© 2025 {PROFILE.name}</span>
        <span className="text-neutral-800">│</span>
        <span>built with {FOOTER.builtWith}</span>
        <span className="text-neutral-800">│</span>
        <span className="text-term-green">{FOOTER.privacyNote}</span>
        <span className="ml-auto">sha {TOPBAR.build} · region {FOOTER.region} · {PROFILE.tz}</span>
      </div>
    </footer>
  );
}
