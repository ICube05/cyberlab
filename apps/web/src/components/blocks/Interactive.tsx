import { useEffect, useRef, useState } from 'react';
import type {
  HttpExchangeBlock,
  PermissionBitsBlock,
  QuizBlock,
  SqlBuilderBlock,
} from '@cyberlab/core';
import { api } from '../../api.js';
import { useStore } from '../../store.js';
import { Icon } from '../../icons.js';
import { renderInline } from './inline.js';

/** Clickable HTTP request/response with per-header explanations. */
export function HttpExchange({ block }: { block: HttpExchangeBlock }) {
  const [selected, setSelected] = useState<string | null>(null);
  const explanation =
    block.request.headers.find((h) => `req:${h.name}` === selected)?.explain ??
    block.response?.headers.find((h) => `res:${h.name}` === selected)?.explain ??
    null;

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-[var(--color-line)]">
      {block.title && (
        <div className="border-b border-[var(--color-line)] bg-[var(--color-abyss-800)] px-4 py-2 text-[12px] font-medium text-[var(--color-ink-300)]">
          {block.title}
        </div>
      )}
      <div className="grid gap-px bg-[var(--color-line)] md:grid-cols-2">
        <div className="bg-[var(--color-abyss-900)] p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="chip !border-[var(--color-signal-dim)] !text-[var(--color-signal)]">{block.request.method}</span>
            <span className="mono text-[12.5px] text-[var(--color-ink-100)]">{block.request.path}</span>
            {block.request.version && <span className="mono text-[10px] text-[var(--color-ink-500)]">{block.request.version}</span>}
          </div>
          <div className="space-y-0.5">
            {block.request.headers.map((h) => (
              <HeaderRow
                key={h.name}
                name={h.name}
                value={h.value}
                clickable={Boolean(h.explain)}
                active={selected === `req:${h.name}`}
                onClick={() => h.explain && setSelected(selected === `req:${h.name}` ? null : `req:${h.name}`)}
              />
            ))}
          </div>
          {block.request.body && (
            <pre className="mono mt-2 overflow-x-auto rounded bg-[var(--color-abyss-800)] p-2 text-[11.5px] text-[var(--color-ink-300)]">{block.request.body}</pre>
          )}
        </div>
        {block.response && (
          <div className="bg-[var(--color-abyss-900)] p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className={`chip ${block.response.status < 400 ? '!border-[var(--color-flux-dim)] !text-[var(--color-flux)]' : '!border-[var(--color-breach-dim)] !text-[var(--color-breach)]'}`}>
                {block.response.status} {block.response.statusText}
              </span>
            </div>
            <div className="space-y-0.5">
              {block.response.headers.map((h) => (
                <HeaderRow
                  key={h.name}
                  name={h.name}
                  value={h.value}
                  clickable={Boolean(h.explain)}
                  active={selected === `res:${h.name}`}
                  onClick={() => h.explain && setSelected(selected === `res:${h.name}` ? null : `res:${h.name}`)}
                />
              ))}
            </div>
            {block.response.body && (
              <pre className="mono mt-2 overflow-x-auto rounded bg-[var(--color-abyss-800)] p-2 text-[11.5px] text-[var(--color-ink-300)]">{block.response.body}</pre>
            )}
          </div>
        )}
      </div>
      {explanation && (
        <div className="animate-fade-in flex gap-2 border-t border-[var(--color-line)] bg-[color-mix(in_oklab,var(--color-signal)_8%,var(--color-abyss-800))] px-4 py-2.5 text-[12.5px] text-[var(--color-ink-200)]">
          <span className="mt-0.5 text-[var(--color-signal)]"><Icon.info size={14} /></span>
          <span>{explanation}</span>
        </div>
      )}
      {block.takeaway && !explanation && (
        <div className="border-t border-[var(--color-line)] bg-[var(--color-abyss-800)] px-4 py-2.5 text-[12.5px] text-[var(--color-ink-300)]">
          {renderInline(block.takeaway)}
        </div>
      )}
    </div>
  );
}

function HeaderRow({ name, value, clickable, active, onClick }: { name: string; value: string; clickable: boolean; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={!clickable}
      className={[
        'mono flex w-full items-baseline gap-1 rounded px-1.5 py-1 text-left text-[11.5px]',
        clickable ? 'cursor-pointer hover:bg-[var(--color-abyss-700)]' : 'cursor-default',
        active ? 'bg-[color-mix(in_oklab,var(--color-signal)_16%,transparent)]' : '',
      ].join(' ')}
    >
      <span className="text-[var(--color-signal)]">{name}:</span>
      <span className="truncate text-[var(--color-ink-300)]">{value}</span>
      {clickable && <span className="ml-auto text-[var(--color-ink-500)]"><Icon.info size={11} /></span>}
    </button>
  );
}

/** Inline comprehension check. Reports to the server, which credits recognition. */
export function Quiz({ block }: { block: QuizBlock; lessonId: string }) {
  const answerQuiz = useStore((s) => s.answerQuiz);
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<{ correct: boolean } | null>(null);

  const toggle = (id: string) => {
    if (result) return;
    setSelected((prev) => (block.multi ? (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]) : [id]));
  };

  const submit = async () => {
    if (selected.length === 0) return;
    const res = await answerQuiz(block.id, selected);
    setResult({ correct: res.correct });
  };

  return (
    <div className="my-4 rounded-xl border border-[var(--color-line)] bg-[var(--color-abyss-800)] p-4">
      <div className="mb-3 flex items-start gap-2">
        <span className="mt-0.5 text-[var(--color-violet)]"><Icon.brain size={16} /></span>
        <p className="text-[13.5px] font-medium text-[var(--color-ink-100)]">{block.question}</p>
      </div>
      <div className="space-y-1.5">
        {block.options.map((opt) => {
          const chosen = selected.includes(opt.id);
          const isCorrect = block.correct.includes(opt.id);
          const showState = result !== null;
          return (
            <button
              key={opt.id}
              onClick={() => toggle(opt.id)}
              disabled={showState}
              className={[
                'flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-[12.5px] transition-colors',
                showState && isCorrect
                  ? 'border-[var(--color-flux-dim)] bg-[color-mix(in_oklab,var(--color-flux)_12%,transparent)] text-[var(--color-ink-100)]'
                  : showState && chosen && !isCorrect
                    ? 'border-[var(--color-breach-dim)] bg-[color-mix(in_oklab,var(--color-breach)_12%,transparent)] text-[var(--color-ink-100)]'
                    : chosen
                      ? 'border-[var(--color-signal)] bg-[color-mix(in_oklab,var(--color-signal)_10%,transparent)] text-[var(--color-ink-100)]'
                      : 'border-[var(--color-line)] text-[var(--color-ink-300)] hover:border-[var(--color-line-strong)]',
              ].join(' ')}
            >
              <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-${block.multi ? 'md' : 'full'} border ${chosen ? 'border-[var(--color-signal)]' : 'border-[var(--color-line-strong)]'}`}>
                {showState && isCorrect && <Icon.check size={13} className="text-[var(--color-flux)]" />}
                {showState && chosen && !isCorrect && <Icon.x size={12} className="text-[var(--color-breach)]" />}
                {!showState && chosen && <Icon.dot size={10} className="text-[var(--color-signal)]" />}
              </span>
              <span>{opt.text}</span>
            </button>
          );
        })}
      </div>
      {!result ? (
        <button className="btn btn-primary mt-3" onClick={submit} disabled={selected.length === 0}>
          Verifica
        </button>
      ) : (
        <div className={`animate-fade-in mt-3 rounded-lg border px-3 py-2.5 text-[12.5px] ${result.correct ? 'border-[var(--color-flux-dim)] text-[var(--color-ink-200)]' : 'border-[var(--color-breach-dim)] text-[var(--color-ink-200)]'}`}>
          <span className={`font-semibold ${result.correct ? 'text-[var(--color-flux)]' : 'text-[var(--color-breach)]'}`}>
            {result.correct ? '✓ Corretto. ' : '✗ Non proprio. '}
          </span>
          {renderInline(block.explanation)}
        </div>
      )}
    </div>
  );
}

/**
 * SQL builder — type an input, watch the query the backend assembles, and run
 * it for real against the lab's SQLite database. This is the same engine the
 * labs use, so `' OR '1'='1` genuinely returns hidden rows here too.
 */
export function SqlBuilder({ block }: { block: SqlBuilderBlock }) {
  const [input, setInput] = useState(block.initialInput);
  const [safe, setSafe] = useState(false);
  const [rows, setRows] = useState<{ columns: string[]; rows: (string | number | null)[][]; error?: string; executed: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const labRef = useRef<string | null>(null);

  const built = (safe ? block.safeTemplate : block.template).replace('{{input}}', input);

  const run = async () => {
    setBusy(true);
    try {
      if (!labRef.current) {
        const lab = await api.createLab(block.labSpecId, 'builder');
        labRef.current = lab.state.instanceId;
      }
      // The safe path is illustrative (bound param), so we only *run* the
      // vulnerable concatenated query — that is the one that demonstrates injection.
      const sql = safe ? block.safeTemplate.replace('?', `'%${input}%'`) : built;
      const res = await api.labAction(labRef.current, { type: 'sql.query', sql });
      if (res.result.type === 'sql.result') {
        const r = res.result.result;
        setRows({ columns: r.columns, rows: r.rows, error: r.error, executed: r.executedSql });
      }
    } catch (e) {
      setRows({ columns: [], rows: [], error: String(e), executed: built });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    return () => {
      if (labRef.current) void fetch(`/api/labs/${labRef.current}`, { method: 'DELETE', headers: { 'x-cyberlab-user': 'local' } });
    };
  }, []);

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-abyss-900)]">
      <div className="flex items-center justify-between border-b border-[var(--color-line)] bg-[var(--color-abyss-800)] px-3 py-2">
        <span className="text-[12px] font-medium text-[var(--color-ink-300)]">SQL playground · database reale</span>
        <label className="flex cursor-pointer items-center gap-1.5 text-[11.5px] text-[var(--color-ink-400)]">
          <input type="checkbox" checked={safe} onChange={(e) => setSafe(e.target.checked)} className="!h-3.5 !w-3.5 accent-[var(--color-flux)]" />
          parametrizzato
        </label>
      </div>
      <div className="p-3">
        <label className="mb-1 block text-[11px] uppercase tracking-wider text-[var(--color-ink-500)]">Input utente</label>
        <div className="flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} className="mono flex-1 text-[12.5px]" onKeyDown={(e) => e.key === 'Enter' && run()} />
          <button className="btn btn-primary" onClick={run} disabled={busy}>
            {busy ? '…' : <><Icon.play size={13} /> Esegui</>}
          </button>
        </div>
        {block.suggestions && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {block.suggestions.map((s) => (
              <button key={s.value} className="chip cursor-pointer hover:border-[var(--color-signal)] hover:text-[var(--color-ink-200)]" onClick={() => setInput(s.value)}>
                {s.label}
              </button>
            ))}
          </div>
        )}
        <div className="mt-3">
          <div className="mb-1 text-[11px] uppercase tracking-wider text-[var(--color-ink-500)]">Query {safe ? 'eseguita (bound)' : 'assemblata'}</div>
          <pre className="mono overflow-x-auto rounded-lg border border-[var(--color-line)] bg-[var(--color-abyss-800)] p-2.5 text-[12px] leading-relaxed">
            <SqlHighlight template={safe ? block.safeTemplate : block.template} input={input} safe={safe} />
          </pre>
        </div>
        {rows && (
          <div className="animate-fade-in mt-3">
            {rows.error ? (
              <div className="rounded-lg border border-[var(--color-breach-dim)] bg-[color-mix(in_oklab,var(--color-breach)_10%,transparent)] p-2.5 text-[12px] text-[var(--color-ink-200)]">
                <span className="mono text-[var(--color-breach)]">SQL error:</span> {rows.error}
                <div className="mt-1 text-[11px] text-[var(--color-ink-400)]">Un errore verboso è già informazione: rivela struttura.</div>
              </div>
            ) : (
              <ResultTable columns={rows.columns} rows={rows.rows} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SqlHighlight({ template, input, safe }: { template: string; input: string; safe: boolean }) {
  const [before, after] = template.split(safe ? '?' : '{{input}}');
  return (
    <span>
      <span className="text-[var(--color-ink-300)]">{colorSql(before ?? '')}</span>
      {safe ? (
        <span className="rounded bg-[color-mix(in_oklab,var(--color-flux)_18%,transparent)] px-1 text-[var(--color-flux)]">?</span>
      ) : (
        <span className="rounded bg-[color-mix(in_oklab,var(--color-breach)_20%,transparent)] px-1 text-[var(--color-breach)]">{input || '∅'}</span>
      )}
      <span className="text-[var(--color-ink-300)]">{colorSql(after ?? '')}</span>
    </span>
  );
}

function colorSql(sql: string): React.ReactNode {
  const parts = sql.split(/(\b(?:SELECT|FROM|WHERE|AND|OR|UNION|LIKE|INSERT|UPDATE|DELETE|NULL|LIMIT)\b)/gi);
  return parts.map((p, i) =>
    /^(SELECT|FROM|WHERE|AND|OR|UNION|LIKE|INSERT|UPDATE|DELETE|NULL|LIMIT)$/i.test(p) ? (
      <span key={i} className="text-[var(--color-signal)]">{p}</span>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

function ResultTable({ columns, rows }: { columns: string[]; rows: (string | number | null)[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--color-line)]">
      <table className="mono w-full border-collapse text-[11.5px]">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} className="border-b border-[var(--color-line)] bg-[var(--color-abyss-800)] px-2.5 py-1.5 text-left font-semibold text-[var(--color-ink-400)]">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length || 1} className="px-2.5 py-2 text-[var(--color-ink-500)]">Nessuna riga.</td></tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i} className="odd:bg-[var(--color-abyss-900)] even:bg-[var(--color-abyss-800)]">
                {row.map((cell, j) => (
                  <td key={j} className="border-b border-[var(--color-line)] px-2.5 py-1.5 text-[var(--color-ink-200)]">
                    {cell === null ? <span className="text-[var(--color-ink-500)]">NULL</span> : String(cell)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
      <div className="bg-[var(--color-abyss-800)] px-2.5 py-1 text-[10.5px] text-[var(--color-ink-500)]">{rows.length} riga/e</div>
    </div>
  );
}

/**
 * Permission calculator. Evaluates the *real* rule — first matching class wins
 * (owner → group → other), root exempt — client-side, mirroring the VFS. The
 * learner toggles the mode bits and sees who can do what, live.
 */
export function PermissionBits({ block }: { block: PermissionBitsBlock }) {
  const [mode, setMode] = useState(block.initialMode);
  const triads: [number, string][] = [
    [(mode >> 6) & 7, 'owner'],
    [(mode >> 3) & 7, 'group'],
    [mode & 7, 'other'],
  ];

  const toggleBit = (triadIndex: number, bit: number) => {
    const shift = (2 - triadIndex) * 3;
    setMode((m) => m ^ (bit << shift));
  };

  const can = (user: { user: string; groups: string[] }, access: 'r' | 'w' | 'x') => {
    if (user.user === 'root') return true;
    const bit = access === 'r' ? 4 : access === 'w' ? 2 : 1;
    let triad: number;
    if (block.owner === user.user) triad = (mode >> 6) & 7;
    else if (user.groups.includes(block.group)) triad = (mode >> 3) & 7;
    else triad = mode & 7;
    return (triad & bit) === bit;
  };

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-abyss-900)]">
      <div className="border-b border-[var(--color-line)] bg-[var(--color-abyss-800)] px-4 py-2 text-[12px] font-medium text-[var(--color-ink-300)]">
        Permessi di <span className="mono text-[var(--color-ink-100)]">{block.path}</span> · owner <span className="mono">{block.owner}</span>, group <span className="mono">{block.group}</span>
      </div>
      <div className="flex flex-wrap items-center gap-6 p-4">
        <div>
          <div className="mono mb-2 text-[22px] tracking-tight text-[var(--color-ink-100)]">
            <span className="text-[var(--color-ink-500)]">-</span>
            {triads.map(([t], i) => (
              <span key={i}>
                {['r', 'w', 'x'].map((label, bi) => {
                  const bit = [4, 2, 1][bi]!;
                  const on = (t & bit) === bit;
                  return (
                    <button
                      key={label}
                      onClick={() => toggleBit(i, bit)}
                      className={on ? 'text-[var(--color-flux)]' : 'text-[var(--color-ink-500)]'}
                      title={`${['owner', 'group', 'other'][i]} ${label}`}
                    >
                      {on ? label : '-'}
                    </button>
                  );
                })}
              </span>
            ))}
          </div>
          <div className="mono text-center text-[13px] text-[var(--color-signal)]">
            {((mode >> 6) & 7)}{((mode >> 3) & 7)}{mode & 7}
          </div>
          <div className="mt-1 text-center text-[10.5px] text-[var(--color-ink-500)]">clicca i bit</div>
        </div>
        <div className="min-w-[220px] flex-1">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-[var(--color-ink-500)]">
                <th className="pb-1 text-left font-medium">chi</th>
                <th className="pb-1 font-medium">read</th>
                <th className="pb-1 font-medium">write</th>
                <th className="pb-1 font-medium">exec</th>
              </tr>
            </thead>
            <tbody>
              {block.actors.map((actor) => (
                <tr key={actor.id} className="border-t border-[var(--color-line)]">
                  <td className="py-1.5 text-[var(--color-ink-200)]">{actor.label}</td>
                  {(['r', 'w', 'x'] as const).map((a) => (
                    <td key={a} className="py-1.5 text-center">
                      {can(actor, a) ? (
                        <Icon.check size={14} className="mx-auto text-[var(--color-flux)]" />
                      ) : (
                        <Icon.x size={12} className="mx-auto text-[var(--color-ink-500)]" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
