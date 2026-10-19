import React from 'react';

// Minimal, strict markdown -> React renderer for the syslog viewer.
// Supports: h2/h3, fenced code, tables, blockquotes, lists, hr, paragraphs,
// inline code and bold. Anything else is rendered verbatim as text.

const inline = (text, keyBase = 0) => {
  const out = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let last = 0;
  let m;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('`')) {
      out.push(
        <code
          key={`${keyBase}-c${i++}`}
          className="border border-neutral-800 bg-black px-1 py-[1px] font-mono text-[11px] text-term-amber"
        >
          {tok.slice(1, -1)}
        </code>,
      );
    } else {
      out.push(
        <strong key={`${keyBase}-b${i++}`} className="font-semibold text-neutral-100">
          {tok.slice(2, -2)}
        </strong>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
};

export default function Markdown({ source }) {
  const lines = source.split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
      i++;
      blocks.push({ t: 'code', lang, lines: buf });
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      blocks.push({ t: 'hr' });
      i++;
      continue;
    }

    if (line.startsWith('### ')) {
      blocks.push({ t: 'h3', text: line.slice(4) });
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      blocks.push({ t: 'h2', text: line.slice(3) });
      i++;
      continue;
    }

    if (line.trimStart().startsWith('> ')) {
      const buf = [];
      while (i < lines.length && lines[i].trimStart().startsWith('> ')) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      blocks.push({ t: 'quote', text: buf.join(' ') });
      continue;
    }

    if (line.trimStart().startsWith('- ')) {
      const buf = [];
      while (i < lines.length && /^\s*- /.test(lines[i])) buf.push(lines[i++].replace(/^\s*-\s*/, ''));
      blocks.push({ t: 'ul', items: buf });
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        rows.push(lines[i++].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
      }
      const head = rows[0];
      const body = rows.slice(2);
      blocks.push({ t: 'table', head, body });
      continue;
    }

    if (line.trim() === '') {
      i++;
      continue;
    }

    const buf = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('##') &&
      !lines[i].startsWith('```') &&
      !lines[i].trimStart().startsWith('> ') &&
      !/^\s*\|.*\|\s*$/.test(lines[i]) &&
      !/^\s*- /.test(lines[i])
    ) {
      buf.push(lines[i++]);
    }
    blocks.push({ t: 'p', text: buf.join(' ') });
  }

  return (
    <div className="font-sans text-[12.5px] leading-[1.7] text-neutral-400">
      {blocks.map((b, bi) => {
        if (b.t === 'h2')
          return (
            <h4
              key={bi}
              className="mb-1.5 mt-4 border-l-2 border-term-green/60 pl-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-200 first:mt-0"
            >
              {b.text}
            </h4>
          );
        if (b.t === 'h3')
          return (
            <h5 key={bi} className="mb-1 mt-3 font-mono text-[11px] font-medium text-term-cyan">
              {b.text}
            </h5>
          );
        if (b.t === 'hr') return <hr key={bi} className="my-3 border-neutral-800" />;
        if (b.t === 'p')
          return (
            <p key={bi} className="mb-2.5">
              {inline(b.text, bi)}
            </p>
          );
        if (b.t === 'ul')
          return (
            <ul key={bi} className="mb-3 space-y-1 pl-1">
              {b.items.map((it, ii) => (
                <li key={ii} className="flex gap-2">
                  <span className="mt-[6px] text-term-green">▸</span>
                  <span>{inline(it, `${bi}-${ii}`)}</span>
                </li>
              ))}
            </ul>
          );
        if (b.t === 'quote')
          return (
            <blockquote
              key={bi}
              className="mb-3 border-l-2 border-term-amber/60 bg-[#0d0d0d] py-1.5 pl-3 pr-2 text-[12px] italic text-neutral-400"
            >
              {inline(b.text, bi)}
            </blockquote>
          );
        if (b.t === 'code')
          return (
            <div key={bi} className="mb-3 border border-neutral-800 bg-black">
              <div className="flex items-center justify-between border-b border-neutral-800 bg-[#0d0d0d] px-2 py-1">
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-neutral-500">
                  {b.lang || 'text'}
                </span>
                <span className="font-mono text-[9px] text-neutral-600">{b.lines.length}L</span>
              </div>
              <pre className="overflow-x-auto p-2.5">
                <code className="font-mono text-[11px] leading-[1.55] text-neutral-300">
                  {b.lines.join('\n')}
                </code>
              </pre>
            </div>
          );
        if (b.t === 'table')
          return (
            <div key={bi} className="mb-3 overflow-x-auto border border-neutral-800">
              <table className="tbl">
                <thead>
                  <tr>
                    {b.head.map((h, hi) => (
                      <th key={hi}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.body.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((c, ci) => (
                        <td key={ci} className="num whitespace-nowrap">
                          {inline(c, `${bi}-${ri}-${ci}`)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        return null;
      })}
    </div>
  );
}
