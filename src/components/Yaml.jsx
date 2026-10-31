/* Plain data rendered as syntax-tinted YAML: keys info, strings ok,
 * numbers signal, comments faint. Long values wrap with a hanging indent
 * so nothing scrolls sideways on a phone. */

const NUMERIC = /^-?\d+(\.\d+)?$/;
const PLAIN_UNSAFE = /^[\s\-?:,[\]{}#&*!|>'"%@`]|: | #|\s$/;

const fmtNum = (n) => (n !== 0 && Math.abs(n) < 1e-3 ? n.toExponential() : String(n));

function Scalar({ v }) {
  if (typeof v === 'number') return <span className="text-signal">{fmtNum(v)}</span>;
  if (typeof v === 'boolean') return <span className="text-signal">{String(v)}</span>;
  const s = String(v);
  if (NUMERIC.test(s)) return <span className="text-signal">{s}</span>;
  return <span className="text-ok">{PLAIN_UNSAFE.test(s) ? JSON.stringify(s) : s}</span>;
}

const P = ({ children }) => <span className="text-fg-faint">{children}</span>;

function Value({ v }) {
  if (Array.isArray(v)) {
    return (
      <>
        <P>[</P>
        {v.map((x, i) => (
          <span key={i}>
            <Scalar v={x} />
            {i < v.length - 1 && <P>, </P>}
          </span>
        ))}
        <P>]</P>
      </>
    );
  }
  if (v && typeof v === 'object') {
    const e = Object.entries(v);
    return (
      <>
        <P>{'{'}</P>
        {e.map(([k, x], i) => (
          <span key={k}>
            <span className="text-info">{k}</span>
            <P>: </P>
            <Scalar v={x} />
            {i < e.length - 1 && <P>, </P>}
          </span>
        ))}
        <P>{'}'}</P>
      </>
    );
  }
  return <Scalar v={v} />;
}

// One "key: value  # comment" line; wrapped text hangs under the value.
function YamlLine({ k, v, comment, depth = 0, render }) {
  return (
    <span className="flex">
      <span className="shrink-0 whitespace-pre">
        {'  '.repeat(depth)}
        <span className="text-info">{k}</span>
        <P>:</P>{' '}
      </span>
      <span className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">
        {render ? render(v) : <Value v={v} />}
        {comment && <span className="text-fg-faint">{`  # ${comment}`}</span>}
      </span>
    </span>
  );
}

/* value: a flat object; or pass `lines` as [{ k, v, comment, depth }] for
 * nested blocks. `link` maps a key to an href to make its value a link. */
export default function Yaml({ value, lines, title, link = {}, className = '' }) {
  const rows = lines ?? Object.entries(value).map(([k, v]) => ({ k, v }));
  return (
    <figure className={`m-0 overflow-hidden rounded border border-line bg-surface ${className}`}>
      {title && (
        <figcaption className="flex items-center justify-between border-b border-line-soft px-3 py-1.5 font-mono text-[12px] text-fg-faint">
          {title}
          <span>yaml</span>
        </figcaption>
      )}
      <pre className="m-0 whitespace-pre-wrap px-3 py-2.5 font-mono text-[13px] leading-[1.7] text-fg">
        <code>
          {rows.map((r, i) =>
            r.v === undefined ? (
              <span key={i} className="flex">
                {'  '.repeat(r.depth ?? 0)}
                <span className="text-info">{r.k}</span>
                <P>:</P>
              </span>
            ) : (
              <YamlLine
                key={i}
                k={r.k}
                v={r.v}
                comment={r.comment}
                depth={r.depth}
                render={
                  link[r.k]
                    ? (v) => (
                        <a href={link[r.k]} target="_blank" rel="noopener noreferrer" className="text-info underline decoration-info/50 underline-offset-[3px] hover:decoration-info">
                          {String(v)}
                        </a>
                      )
                    : undefined
                }
              />
            ),
          )}
        </code>
      </pre>
    </figure>
  );
}
