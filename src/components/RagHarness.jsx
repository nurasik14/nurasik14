import React from 'react';
import { CORPUS, PRESET_QUERIES, LANG_META } from '../config/rag.config';
import { buildIndex, search, evaluate, latencyFor, ablate } from '../lib/retrieval';
import { Chip, Bar, cx, StatusDot } from './ui';

const MODES = [
  { id: 'bm25', label: 'BM25', hint: 'sparse / lexical' },
  { id: 'dense', label: 'DENSE', hint: 'multilingual e5' },
  { id: 'hybrid', label: 'HYBRID', hint: 'weighted sum' },
  { id: 'rrf', label: 'RRF', hint: 'k=60' },
];

export default function RagHarness() {
  const index = React.useMemo(() => buildIndex(CORPUS), []);
  const ablation = React.useMemo(() => ablate(index, PRESET_QUERIES, 5), [index]);

  const [qi, setQi] = React.useState(0);
  const [query, setQuery] = React.useState(PRESET_QUERIES[0].q);
  const [mode, setMode] = React.useState('hybrid');
  const [alpha, setAlpha] = React.useState(0.55);
  const [topK, setTopK] = React.useState(5);
  const [run, setRun] = React.useState(() => search(index, PRESET_QUERIES[0].q, { mode: 'hybrid', topK: 5 }));
  const [t0, setT0] = React.useState(26.4);
  const [runId, setRunId] = React.useState('a3f9c21');
  const [openDoc, setOpenDoc] = React.useState(null);

  const execute = React.useCallback(
    (q, m, a, k) => {
      const r = search(index, q, { mode: m, alpha: a, topK: k });
      setRun(r);
      setT0(latencyFor(m, q.length, r.results.length));
      setRunId(Math.floor(Math.random() * 0xfffffff).toString(16).padStart(7, '0'));
      setOpenDoc(null);
    },
    [index],
  );

  React.useEffect(() => {
    execute(query, mode, alpha, topK);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, alpha, topK]);

  const gold = PRESET_QUERIES.find((p) => p.q === query)?.gold;
  const ev = gold ? evaluate(run.results, gold, topK) : null;
  const maxFused = Math.max(...run.results.map((r) => r.fused), 0.0001);

  return (
    <div className="flex min-w-0 flex-col">
      {/* ---- controls ---- */}
      <div className="border-b border-neutral-800 bg-[#0d0d0d] p-2">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] text-term-green">λ</span>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setQi(-1);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') execute(query, mode, alpha, topK);
            }}
            spellCheck={false}
            className="focus-ring min-w-0 flex-1 border border-neutral-800 bg-black px-2 py-1 font-mono text-[11px] text-neutral-200 placeholder:text-neutral-700"
            placeholder="query: қазақ тілінің морфологиясы …"
          />
          <button type="button" onClick={() => execute(query, mode, alpha, topK)} className="btn btn-on focus-ring">
            [RUN]
          </button>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              title={m.hint}
              onClick={() => setMode(m.id)}
              className={cx('btn focus-ring', mode === m.id && 'btn-on')}
            >
              {m.label}
            </button>
          ))}
          <span className="mx-1 h-3 w-px bg-neutral-800" />
          <label className="flex items-center gap-1.5">
            <span className={cx('label', mode !== 'hybrid' && 'text-neutral-700')}>α</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={alpha}
              disabled={mode !== 'hybrid'}
              onChange={(e) => setAlpha(+e.target.value)}
              className="h-1 w-20 accent-[#22c55e] disabled:opacity-30"
            />
            <span className={cx('num font-mono text-[10px]', mode !== 'hybrid' ? 'text-neutral-700' : 'text-term-amber')}>
              {alpha.toFixed(2)}
            </span>
          </label>
          <span className="mx-1 h-3 w-px bg-neutral-800" />
          <span className="label">top-k</span>
          {[3, 5, 10].map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTopK(k)}
              className={cx('btn focus-ring', topK === k && 'btn-on')}
            >
              {k}
            </button>
          ))}
        </div>

        <div className="mt-1.5 flex flex-wrap gap-1">
          {PRESET_QUERIES.map((p, i) => (
            <button
              key={p.q}
              type="button"
              onClick={() => {
                setQi(i);
                setQuery(p.q);
                execute(p.q, mode, alpha, topK);
              }}
              className={cx(
                'max-w-full truncate border px-1.5 py-[1px] font-mono text-[9.5px] transition-colors duration-75',
                qi === i
                  ? 'border-term-cyan/50 bg-term-cyan/10 text-term-cyan'
                  : 'border-neutral-800 text-neutral-500 hover:border-neutral-600 hover:text-neutral-300',
              )}
            >
              <span className="text-neutral-600">[{p.lang}] </span>
              {p.q.length > 34 ? `${p.q.slice(0, 34)}…` : p.q}
            </button>
          ))}
        </div>
      </div>

      {/* ---- run metrics ---- */}
      <div className="grid grid-cols-2 gap-px border-b border-neutral-800 bg-neutral-900 sm:grid-cols-3 xl:grid-cols-6">
        {[
          { k: 'latency', v: `${t0} ms`, tone: t0 > 40 ? 'text-term-amber' : 'text-term-green' },
          { k: 'recall@k', v: ev ? ev.recall.toFixed(3) : '— n/qrels', tone: 'text-neutral-100' },
          { k: 'mrr', v: ev ? ev.mrr.toFixed(3) : '—', tone: 'text-neutral-100' },
          { k: 'ndcg', v: ev ? ev.ndcg.toFixed(3) : '—', tone: 'text-neutral-100' },
          { k: 'hits', v: ev ? `${ev.hits}/${ev.goldTotal}` : '—', tone: 'text-term-cyan' },
          { k: 'run_id', v: runId, tone: 'text-neutral-500' },
        ].map((m) => (
          <div key={m.k} className="bg-black px-2 py-1">
            <div className="label">{m.k}</div>
            <div className={cx('num truncate font-mono text-[12px]', m.tone)}>{m.v}</div>
          </div>
        ))}
      </div>

      {/* ---- results ---- */}
      <div className="max-h-[280px] min-h-0 flex-1 overflow-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th className="w-7">#</th>
              <th className="w-[68px]">doc</th>
              <th className="w-[62px]">lang</th>
              <th className="w-14">sparse</th>
              <th className="w-14">dense</th>
              <th className="w-[86px]">fused</th>
              <th>passage</th>
            </tr>
          </thead>
          <tbody>
            {run.results.map((r) => {
              const isGold = gold?.includes(r.doc.id);
              const open = openDoc === r.doc.id;
              return (
                <React.Fragment key={r.doc.id}>
                  <tr
                    onClick={() => setOpenDoc(open ? null : r.doc.id)}
                    className={cx('cursor-pointer', isGold && 'bg-term-green/[0.06]')}
                  >
                    <td className="num text-neutral-600">{r.rank}</td>
                    <td className={cx('num', isGold ? 'text-term-green' : 'text-neutral-300')}>{r.doc.id}</td>
                    <td>
                      <span className={cx('font-mono text-[9.5px]', LANG_META[r.doc.lang].color)}>
                        {LANG_META[r.doc.lang].label}
                      </span>
                    </td>
                    <td className="num text-neutral-500">{r.sparse.toFixed(2)}</td>
                    <td className="num text-neutral-500">{r.dense.toFixed(3)}</td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <div className="w-9 shrink-0">
                          <Bar value={r.fused} max={maxFused} tone={isGold ? 'green' : 'cyan'} h={4} />
                        </div>
                        <span className="num text-[10px] text-neutral-300">
                          {r.fused > 1 ? r.fused.toFixed(4) : r.fused.toFixed(3)}
                        </span>
                      </div>
                    </td>
                    <td className="max-w-0 truncate text-neutral-400">
                      <span className="text-neutral-200">{r.doc.title}</span>
                      <span className="text-neutral-600"> — </span>
                      {r.doc.text.slice(0, 70)}…
                      {isGold && <span className="ml-1.5 text-[9px] text-term-green">GOLD</span>}
                    </td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={7} className="bg-[#0c0c0c] p-0">
                        <div className="border-l-2 border-term-cyan/50 px-2.5 py-2">
                          <div className="mb-1 flex flex-wrap items-center gap-1.5">
                            <Chip tone="cyan">{r.doc.src}</Chip>
                            <Chip>{r.doc.lang}</Chip>
                            <Chip>{r.doc.tokens?.length ?? '—'} tok</Chip>
                            <Chip>id={r.doc.id}</Chip>
                          </div>
                          <p className="prose-tech">{r.doc.text}</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ---- ablation ---- */}
      <div className="border-t border-neutral-800 bg-[#0d0d0d] px-2 py-1.5">
        <div className="mb-1 flex items-center gap-2">
          <span className="label">ablation · 6 gold-labelled queries · k=5</span>
          <Chip tone="green">
            <StatusDot tone="green" live={false} /> pinned
          </Chip>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>mode</th>
              <th>recall@5</th>
              <th>mrr@5</th>
              <th>ndcg@10</th>
              <th className="w-[120px]">rel.</th>
            </tr>
          </thead>
          <tbody>
            {ablation.map((a) => (
              <tr key={a.mode} className={cx(a.mode === mode && 'bg-[#131313]')}>
                <td className={cx('uppercase', a.mode === mode ? 'text-term-green' : 'text-neutral-400')}>
                  {a.mode}
                </td>
                <td className="num">{a.recall.toFixed(3)}</td>
                <td className="num">{a.mrr.toFixed(3)}</td>
                <td className="num">{a.ndcg.toFixed(3)}</td>
                <td>
                  <Bar value={a.recall} max={1} tone={a.mode === 'hybrid' ? 'green' : 'cyan'} h={4} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
