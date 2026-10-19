import React from 'react';
import { PROFILE } from '../config/site.config';
import {
  README,
  SYSTEM_PROFILE,
  STATS,
  STACK,
  COMPETITIONS,
  TIMELINE,
} from '../config/about.config';
import { Panel, Chip, Bar, StatusDot, ExtLink, cx } from './ui';

const WinControls = () => (
  <div className="flex items-center gap-1.5">
    <span className="h-2.5 w-2.5 border border-neutral-700 transition-colors duration-75 hover:border-term-red hover:bg-term-red/30" />
    <span className="h-2.5 w-2.5 border border-neutral-700 transition-colors duration-75 hover:border-term-amber hover:bg-term-amber/30" />
    <span className="h-2.5 w-2.5 border border-neutral-700 transition-colors duration-75 hover:border-term-green hover:bg-term-green/30" />
  </div>
);

const Line = ({ children }) => <div className="whitespace-pre-wrap break-words">{children}</div>;
const Prompt = ({ cmd }) => (
  <div className="pt-2.5">
    <span className="text-term-green">{PROFILE.handle}@{PROFILE.host}</span>
    <span className="text-neutral-600">:</span>
    <span className="text-term-cyan">~</span>
    <span className="text-neutral-600">$ </span>
    <span className="text-neutral-200">{cmd}</span>
  </div>
);

const LINK_KEYS = ['github', 'hf', 'linkedin', 'email'];

export default function About() {
  const [openComp, setOpenComp] = React.useState(COMPETITIONS[1]?.id ?? COMPETITIONS[0]?.id);

  return (
    <div className="grid gap-2 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
      {/* ---------------- README terminal ---------------- */}
      <Panel
        title="README.md — 100x32"
        accent="green"
        right={
          <>
            <Chip tone="green">
              <StatusDot tone="green" /> attached
            </Chip>
            <WinControls />
          </>
        }
        bodyClass="overflow-hidden"
      >
        <div className="overflow-x-auto bg-black p-3 font-mono text-[11.5px] leading-[1.6]">
          <Prompt cmd="cat README.md" />
          <Line>
            <span className="text-neutral-600">{'│ '}</span>
            <span className="text-xl font-semibold tracking-tight text-neutral-100">{README.headline}</span>
            <span className="text-neutral-600"> // </span>
            <span className="text-term-cyan">{README.headlineRole}</span>
          </Line>
          <Line>
            <span className="text-neutral-600">{'│ '}</span>
            <span className="text-term-amber">{README.programLine}</span>
          </Line>
          <Line>
            <span className="text-neutral-600">{'└─'}</span>{' '}
            <span className="text-neutral-300">{README.availabilityLine}</span>
          </Line>

          <div className="pt-3">
            <span className="text-neutral-500">## focus</span>
            <div className="pl-3 text-neutral-300">
              {README.focus.map((f) => (
                <div key={f}>
                  <span className="text-term-green">▸</span> {f}
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3">
            <span className="text-neutral-500">## bio</span>
            <p className="prose-tech max-w-[62ch] pt-1 text-neutral-400">{README.bio}</p>
          </div>

          <div className="pt-3">
            <span className="text-neutral-500">## operating_notes</span>
            <div className="pl-3 text-neutral-400">
              {README.operatingNotes.map((n) => (
                <div key={n}>
                  <span className="text-neutral-600">$ </span>
                  {n}
                </div>
              ))}
            </div>
          </div>

          <Prompt cmd="ls ./links" />
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
            {LINK_KEYS.map((k) => (
              <ExtLink key={k} href={PROFILE.links[k]}>
                {PROFILE.links[`${k}Text`]}
              </ExtLink>
            ))}
          </div>

          <Prompt cmd="_" />
          <div className="pb-1">
            <span className="caret" />
          </div>
        </div>
      </Panel>

      {/* ---------------- right rail ---------------- */}
      <div className="flex min-w-0 flex-col gap-2">
        <Panel title="system_profile" accent="cyan" right={<Chip tone="cyan">host</Chip>}>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-[3px] p-2.5 font-mono text-[11px]">
            {SYSTEM_PROFILE.map(([k, v]) => (
              <React.Fragment key={k}>
                <dt className="text-term-cyan/80">{k}</dt>
                <dd className="truncate text-neutral-400">{v}</dd>
              </React.Fragment>
            ))}
          </dl>
        </Panel>

        <Panel title="core_stack" accent="amber" right={<Chip tone="amber">self-reported</Chip>}>
          <div className="space-y-[5px] p-2.5">
            {STACK.map((s) => (
              <div key={s.name} className="flex items-center gap-2">
                <span
                  className={cx(
                    'w-[86px] shrink-0 truncate font-mono text-[10.5px]',
                    s.group === 'core' ? 'text-neutral-200' : 'text-neutral-500',
                  )}
                >
                  {s.name}
                </span>
                <div className="min-w-0 flex-1">
                  <Bar value={s.lvl} max={100} tone={s.group === 'core' ? 'green' : 'cyan'} h={4} />
                </div>
                <span className="num w-6 shrink-0 text-right font-mono text-[9.5px] text-neutral-500">
                  {s.lvl}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="competitions" accent="amber">
          <table className="tbl">
            <tbody>
              {COMPETITIONS.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setOpenComp(c.id)}
                  className={cx('cursor-pointer', openComp === c.id && 'bg-[#131313]')}
                >
                  <td className="w-[68px] font-medium text-neutral-200">{c.id}</td>
                  <td className="w-[62px]">
                    <span
                      className={cx(
                        'font-mono text-[10px] font-semibold',
                        c.tone === 'green' ? 'text-term-green' : 'text-term-amber',
                      )}
                    >
                      {c.award}
                    </span>
                  </td>
                  <td className="w-10 text-neutral-500">{c.year}</td>
                  <td className="truncate text-neutral-500">{c.track}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-neutral-900 bg-black p-2.5">
            <p className="prose-tech text-[12px] text-neutral-400">
              {COMPETITIONS.find((c) => c.id === openComp)?.note}
            </p>
          </div>
        </Panel>
      </div>

      {/* ---------------- stats matrix ---------------- */}
      <Panel title="quick_stats" accent="green" className="lg:col-span-2" bodyClass="p-2">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-6">
          {STATS.map((s) => (
            <div key={s.k} className="border border-neutral-900 bg-black px-2 py-1.5">
              <div className="label truncate">{s.k}</div>
              <div className="num truncate font-mono text-[14px] text-neutral-100">{s.v}</div>
              <div className="truncate font-mono text-[9.5px] text-neutral-600">{s.sub}</div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="event_log" accent="cyan" className="lg:col-span-2" bodyClass="p-0">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th className="w-20">ts</th>
                <th className="w-12">lvl</th>
                <th>event</th>
              </tr>
            </thead>
            <tbody>
              {TIMELINE.map((t) => (
                <tr key={t.t}>
                  <td className="num text-neutral-500">{t.t}</td>
                  <td>
                    <span
                      className={cx(
                        'font-mono text-[9px]',
                        t.tone === 'green'
                          ? 'text-term-green'
                          : t.tone === 'amber'
                            ? 'text-term-amber'
                            : t.tone === 'cyan'
                              ? 'text-term-cyan'
                              : 'text-neutral-500',
                      )}
                    >
                      ●
                    </span>
                  </td>
                  <td className="text-neutral-300">{t.e}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
