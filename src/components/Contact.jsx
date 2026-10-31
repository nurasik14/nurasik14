// ## 05 contact: a real mailto, a copy button that reports in the statusline.
import { useRef } from 'react';
import { PROFILE } from '../config/portfolio.config';
import { copyText } from '../lib/nav';
import { useShell } from '../shell/AppShell';
import ProfileLinks from './ProfileLinks';
import Section from './Section';

export default function Contact({ n }) {
  const { flash } = useShell();
  const mailRef = useRef(null);

  const onCopy = () =>
    copyText(PROFILE.email).then(
      () => flash('yanked email', 'ok'),
      () => {
        // Clipboard blocked: select the address so Ctrl/Cmd+C works.
        const range = document.createRange();
        range.selectNodeContents(mailRef.current);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        flash('copy blocked; address selected, press Ctrl+C', 'warn');
      },
    );

  return (
    <Section id="contact" n={n} title="contact">
      <p className="max-w-[60ch] text-fg-dim">
        {PROFILE.contactNote} I&apos;m {PROFILE.status}.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3">
        <a
          ref={mailRef}
          href={`mailto:${PROFILE.email}`}
          className="font-mono text-[clamp(1.05rem,3.6vw,1.75rem)] font-medium tracking-[-0.02em] text-fg underline decoration-line-strong decoration-1 underline-offset-[6px] transition-colors [overflow-wrap:anywhere] hover:decoration-fg"
        >
          {PROFILE.email}
        </a>
        <button type="button" onClick={onCopy} className="btn h-8 px-2.5 text-[12px]">
          copy<span className="sr-only"> email address</span>
        </button>
      </div>
      <ProfileLinks className="mt-6" />
    </Section>
  );
}
