import React from 'react';
import { PROFILE } from '../config/site.config';
import { AVAILABILITY, LOOKING_FOR } from '../config/about.config';
import { Panel, Chip, StatusDot, ExtLink, CopyBtn, cx } from './ui';

const ROWS = [
  { proto: 'SMTP', addr: PROFILE.links.emailText, href: PROFILE.links.email, act: '[MAIL]', tone: 'green' },
  { proto: 'HTTPS', addr: PROFILE.links.githubText, href: PROFILE.links.github, act: '[OPEN]', tone: 'cyan' },
  { proto: 'HTTPS', addr: PROFILE.links.hfText, href: PROFILE.links.hf, act: '[OPEN]', tone: 'amber' },
  { proto: 'HTTPS', addr: PROFILE.links.linkedinText, href: PROFILE.links.linkedin, act: '[OPEN]', tone: 'cyan' },
];

export default function Contact() {
  const [ping, setPing] = React.useState(null);
  const runPing = () => {
    setPing('...');
    setTimeout(() => setPing(`${(11 + Math.random() * 9).toFixed(1)} ms`), 420);
  };

  return (
    <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel title="contact_channels" accent="green" right={<Chip tone="green"><StatusDot tone="green" /> reachable</Chip>}>
        <table className="tbl">
          <thead>
            <tr>
              <th className="w-[54px]">proto</th>
              <th>address</th>
              <th className="w-[128px]">action</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.addr}>
                <td className="text-neutral-600">{r.proto}</td>
                <td className="truncate">
                  <ExtLink href={r.href} className={cx(r.tone === 'amber' ? 'text-term-amber' : '')}>
                    {r.addr}
                  </ExtLink>
                </td>
                <td>
                  <div className="flex gap-1">
                    <a href={r.href} target="_blank" rel="noreferrer noopener" className="btn focus-ring no-underline">
                      {r.act}
                    </a>
                    <CopyBtn text={r.addr} label="[CP]" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center gap-2 border-t border-neutral-800 bg-[#0d0d0d] px-2 py-1.5">
          <button type="button" onClick={runPing} className="btn focus-ring">
            [PING]
          </button>
          <span className="font-mono text-[10.5px] text-neutral-500">
            {ping === null ? 'icmp seq=0 — idle' : ping === '...' ? 'waiting for reply…' : `64 bytes from ${PROFILE.host}: icmp_seq=0 ttl=54 time=${ping}`}
          </span>
        </div>
      </Panel>

      <Panel title="availability" accent="amber" bodyClass="p-2">
        <div className="grid grid-cols-2 gap-1.5">
          {AVAILABILITY.map((a) => (
            <div key={a.k} className="border border-neutral-900 bg-black px-2 py-1.5">
              <div className="label">{a.k}</div>
              <div
                className={cx(
                  'num font-mono text-[13px]',
                  a.tone === 'green' ? 'text-term-green' : a.tone === 'cyan' ? 'text-term-cyan' : 'text-neutral-100',
                )}
              >
                {a.v}
              </div>
              <div className="truncate font-mono text-[9.5px] text-neutral-600">{a.sub}</div>
            </div>
          ))}
        </div>
        <div className="mt-2 border border-neutral-900 bg-black p-2.5">
          <div className="mb-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-neutral-500">
            what I am looking for
          </div>
          <p className="prose-tech">{LOOKING_FOR}</p>
        </div>
      </Panel>
    </div>
  );
}
