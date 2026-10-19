import React from 'react';
import { POSTS, TAGS } from '../config/blog.config';
import { Panel, Chip, cx } from './ui';
import Markdown from './Markdown';

const LEVEL = {
  INFO: 'text-term-green',
  WARN: 'text-term-amber',
  ERR: 'text-term-red',
  NOTE: 'text-term-cyan',
};

export default function Blog() {
  const [tags, setTags] = React.useState([]);
  const [q, setQ] = React.useState('');
  const [open, setOpen] = React.useState(POSTS[0].id);

  const toggleTag = (t) => setTags((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t]));

  const list = POSTS.filter((p) => {
    const tagOk = tags.length === 0 || tags.some((t) => p.tags.includes(t));
    const qOk =
      !q ||
      (p.subject + p.body + p.hash + p.tags.join(' ')).toLowerCase().includes(q.toLowerCase());
    return tagOk && qOk;
  });

  return (
    <div className="flex flex-col gap-2">
      <Panel
        title="/var/log/research.log — technical notes & experiment logs"
        accent="cyan"
        right={
          <>
            <Chip tone="cyan">{list.length}/{POSTS.length} entries</Chip>
            <button
              type="button"
              onClick={() => {
                setTags([]);
                setQ('');
              }}
              className="btn focus-ring"
            >
              [RESET]
            </button>
          </>
        }
        bodyClass="p-2"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[10px] text-term-green">grep</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="-i pattern"
            spellCheck={false}
            className="focus-ring min-w-[140px] flex-1 border border-neutral-800 bg-black px-2 py-1 font-mono text-[11px] text-neutral-200 placeholder:text-neutral-700"
          />
          <span className="mx-1 h-3 w-px bg-neutral-800" />
          {TAGS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => toggleTag(t)}
              className={cx(
                'border px-1.5 py-[1px] font-mono text-[10px] transition-colors duration-75',
                tags.includes(t)
                  ? 'border-term-amber/50 bg-term-amber/10 text-term-amber'
                  : 'border-neutral-800 text-neutral-500 hover:border-neutral-600 hover:text-neutral-300',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="commit_log" accent="green" bodyClass="p-0">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th className="w-[136px]">timestamp</th>
                <th className="w-[64px]">commit</th>
                <th className="w-[46px]">lvl</th>
                <th className="w-[136px]">tags</th>
                <th>subject</th>
                <th className="w-[52px]">diff</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const on = open === p.id;
                return (
                  <React.Fragment key={p.id}>
                    <tr
                      onClick={() => setOpen(on ? null : p.id)}
                      className={cx('cursor-pointer', on && 'bg-term-green/[0.06]')}
                    >
                      <td className="num text-neutral-500">{p.ts}</td>
                      <td className="num text-term-cyan">{p.hash}</td>
                      <td className={cx('font-mono text-[9.5px]', LEVEL[p.level])}>{p.level}</td>
                      <td className="text-neutral-600">{p.tags.join(' ')}</td>
                      <td className={cx('text-neutral-300', on && 'text-neutral-100')}>
                        <span className="mr-1.5 select-none text-neutral-600">{on ? '▼' : '▶'}</span>
                        {p.subject}
                      </td>
                      <td className="num text-neutral-600">{p.files}F</td>
                    </tr>
                    {on && (
                      <tr>
                        <td colSpan={6} className="bg-[#0b0b0b] p-0">
                          <div className="border-l-2 border-term-green/50 px-3 py-2.5">
                            <div className="mb-2 flex flex-wrap items-center gap-1.5 border-b border-neutral-900 pb-2 font-mono text-[9.5px]">
                              <Chip tone="cyan">commit {p.hash}</Chip>
                              <Chip>{p.level}</Chip>
                              {p.tags.map((t) => (
                                <Chip key={t} tone="amber">
                                  {t}
                                </Chip>
                              ))}
                              <Chip>{p.files} files changed</Chip>
                              <span className="ml-auto text-neutral-600">{p.ts} UTC+8</span>
                            </div>
                            <div className="max-w-[78ch]">
                              <Markdown source={p.body} />
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {list.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center font-mono text-[11px] text-neutral-600">
                    no matching entries — try relaxing the filter
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
