import { useRef, useState } from 'react';
import { PROFILE } from '../config/portfolio.config';
import { copyEmail } from '../lib/nav';
import { ProfileLinks } from './Hero';
import { Section, SectionHeader } from './Section';

export default function Contact() {
  const [label, setLabel] = useState('copy address');
  const mailRef = useRef(null);

  const onCopy = () =>
    copyEmail()
      .then(() => {
        setLabel('copied');
        setTimeout(() => setLabel('copy address'), 1600);
      })
      .catch(() => {
        const range = document.createRange();
        range.selectNodeContents(mailRef.current);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        setLabel('selected, press Ctrl C');
      });

  return (
    <Section id="contact" className="pb-14 pt-[104px]">
      <SectionHeader name="contact" />
      <div className="mt-7 rounded-[10px] border border-line bg-panel p-[22px]">
        <p className="font-mono text-sm text-fg-dim">
          <span className="mr-2 text-term-green">$</span>email is the fastest way to reach me
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-3">
          <a
            ref={mailRef}
            href={`mailto:${PROFILE.email}`}
            className="break-all font-mono text-[clamp(1.4rem,4.6vw,3.25rem)] font-bold leading-tight tracking-[-0.04em] no-underline hover:text-term-green"
          >
            {PROFILE.email}
          </a>
          <button
            type="button"
            onClick={onCopy}
            className="rounded-md border border-line px-2.5 py-1.5 font-mono text-[13px] text-fg-dim hover:border-neutral-600 hover:text-neutral-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-term-green"
          >
            {label}
          </button>
        </div>
        <ProfileLinks className="mt-6" />
      </div>
    </Section>
  );
}
