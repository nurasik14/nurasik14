/* Pretty-prints a plain object as syntax-coloured JSON.
 * Values under a `repo` key become links to GitHub. */

const pad = (n) => '  '.repeat(n);

function Value({ k, v, depth }) {
  if (Array.isArray(v)) {
    const flat = v.every((x) => typeof x !== 'object');
    if (flat) {
      return (
        <>
          [
          {v.map((x, i) => (
            <span key={i}>
              {i > 0 && ', '}
              <Value v={x} depth={depth} />
            </span>
          ))}
          ]
        </>
      );
    }
    return (
      <>
        [{'\n'}
        {v.map((x, i) => (
          <span key={i}>
            {pad(depth + 1)}
            <Value v={x} depth={depth + 1} />
            {i < v.length - 1 && ','}
            {'\n'}
          </span>
        ))}
        {pad(depth)}]
      </>
    );
  }
  if (v && typeof v === 'object') return <Obj obj={v} depth={depth} />;
  if (typeof v === 'number') return <span className="text-term-green">{String(v)}</span>;
  const str = <span className="text-neutral-300">{JSON.stringify(v)}</span>;
  if (k === 'repo') {
    return (
      <a
        href={`https://github.com/${v}`}
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-line underline-offset-[3px] hover:decoration-neutral-300"
      >
        {str}
      </a>
    );
  }
  return str;
}

function Obj({ obj, depth }) {
  const entries = Object.entries(obj);
  return (
    <>
      {'{'}
      {'\n'}
      {entries.map(([k, v], i) => (
        <span key={k}>
          {pad(depth + 1)}
          <span className="text-term-cyan">{JSON.stringify(k)}</span>: <Value k={k} v={v} depth={depth + 1} />
          {i < entries.length - 1 && ','}
          {'\n'}
        </span>
      ))}
      {pad(depth)}
      {'}'}
    </>
  );
}

export default function JsonView({ value }) {
  return (
    <pre className="m-0 overflow-x-auto font-mono text-[12.5px] leading-[1.75] text-neutral-200">
      <Obj obj={value} depth={0} />
    </pre>
  );
}
