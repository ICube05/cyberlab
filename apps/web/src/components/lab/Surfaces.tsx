import { useEffect, useState } from 'react';
import type { FsEntry, LabInspectView, SqlResultView } from '@cyberlab/core';
import { useStore } from '../../store.js';
import { api } from '../../api.js';
import { Icon } from '../../icons.js';
import { languageForPath } from '../../syntax.js';
import { CodeEditor, CodeViewer } from './CodeEditor.js';

/** Direct SQL console over the lab database. Real queries, real errors. */
export function SqlConsole() {
  const runAction = useStore((s) => s.runAction);
  const busy = useStore((s) => s.labBusy);
  const [sql, setSql] = useState('SELECT name FROM sqlite_master WHERE type = \'table\';');
  const [result, setResult] = useState<SqlResultView | null>(null);

  const run = async () => {
    const res = await runAction({ type: 'sql.query', sql });
    if (res?.result.type === 'sql.result') setResult(res.result.result);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--color-line)] p-2.5">
        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={(e) => (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) && run()}
          spellCheck={false}
          rows={3}
          className="mono w-full text-[12.5px]"
          placeholder="SELECT …    (⌘/Ctrl+Enter per eseguire)"
        />
        <div className="mt-2 flex items-center gap-2">
          <button className="btn btn-primary" onClick={run} disabled={busy}>
            <Icon.play size={13} /> Esegui
          </button>
          <span className="text-[11px] text-[var(--color-ink-500)]">Database SQLite reale del laboratorio</span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2.5">
        {!result ? (
          <div className="grid h-full place-items-center text-[12.5px] text-[var(--color-ink-500)]">Esegui una query.</div>
        ) : result.error ? (
          <div className="rounded-lg border border-[var(--color-breach-dim)] bg-[color-mix(in_oklab,var(--color-breach)_10%,transparent)] p-3 text-[12.5px] text-[var(--color-ink-200)]">
            <span className="mono text-[var(--color-breach)]">error:</span> {result.error}
          </div>
        ) : (
          <SqlTable result={result} />
        )}
      </div>
    </div>
  );
}

function SqlTable({ result }: { result: SqlResultView }) {
  return (
    <div>
      <div className="mono mb-2 text-[11px] text-[var(--color-ink-500)]">{result.executedSql}</div>
      <div className="overflow-x-auto rounded-lg border border-[var(--color-line)]">
        <table className="mono w-full border-collapse text-[11.5px]">
          <thead>
            <tr>
              {result.columns.map((c) => (
                <th key={c} className="border-b border-[var(--color-line)] bg-[var(--color-abyss-800)] px-2.5 py-1.5 text-left font-semibold text-[var(--color-ink-400)]">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, i) => (
              <tr key={i} className="odd:bg-[var(--color-abyss-900)]">
                {row.map((cell, j) => (
                  <td key={j} className="border-b border-[var(--color-line)] px-2.5 py-1.5 text-[var(--color-ink-200)]">
                    {cell === null ? <span className="text-[var(--color-ink-500)]">NULL</span> : String(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-1 text-[10.5px] text-[var(--color-ink-500)]">{result.rowCount} riga/e</div>
    </div>
  );
}

/** The "browser" surface — navigate the target, render its HTML in a sandbox. */
export function BrowserView() {
  const runAction = useStore((s) => s.runAction);
  const lastAction = useStore((s) => s.lastAction);
  const [url, setUrl] = useState('/');

  const go = (path: string) => {
    setUrl(path);
    void runAction({ type: 'browser.navigate', path });
  };
  useEffect(() => {
    go('/');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const response = lastAction?.result.type === 'http.response' ? lastAction.result.response : undefined;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 border-b border-[var(--color-line)] p-2">
        <button className="btn btn-ghost !px-1.5 !py-1" onClick={() => go(url)} title="Ricarica"><Icon.refresh size={13} /></button>
        <div className="flex flex-1 items-center gap-1.5 rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-abyss-900)] px-2.5 py-1">
          <Icon.lock size={11} className="text-[var(--color-ink-500)]" />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && go(url)}
            className="mono flex-1 !border-0 !bg-transparent !p-0 text-[12px] focus:!ring-0 focus:!shadow-none"
          />
        </div>
      </div>
      {response && response.contentType.includes('html') ? (
        // allow-scripts is required for the nav/form bridge below; allow-same-origin
        // is deliberately withheld, so the (intentionally vulnerable) lab page runs
        // in a null origin and cannot reach the parent's cookies, storage or DOM.
        <iframe title="lab-browser-full" sandbox="allow-scripts allow-forms" srcDoc={rewriteLinks(response.body)} className="flex-1 bg-white" />
      ) : (
        <div className="grid flex-1 place-items-center text-[12.5px] text-[var(--color-ink-500)]">
          {response ? <pre className="mono max-w-full overflow-auto p-4 text-[11.5px] text-[var(--color-ink-300)]">{response.body}</pre> : 'Naviga verso una pagina.'}
        </div>
      )}
    </div>
  );
}

/** Intercept in-page links so navigation stays inside the lab surface. */
function rewriteLinks(html: string): string {
  return html.replace(
    '</body>',
    `<script>
      document.addEventListener('click', function(e){
        var a = e.target.closest && e.target.closest('a');
        if(a && a.getAttribute('href')){ e.preventDefault(); parent.postMessage({cyberlabNav:a.getAttribute('href')}, '*'); }
      });
      document.addEventListener('submit', function(e){
        e.preventDefault();
        var f=e.target, fd=new FormData(f), o={};
        fd.forEach(function(v,k){o[k]=v;});
        parent.postMessage({cyberlabSubmit:{action:f.getAttribute('action')||location.pathname, method:(f.getAttribute('method')||'GET').toUpperCase(), fields:o}}, '*');
      });
    </script></body>`,
  );
}

/**
 * File explorer + editor.
 *
 * Two things were wrong here and both were about honesty. The panel decided
 * whether a file could be saved from its POSIX mode bits, so Save appeared on
 * files the target would always refuse — you typed, pressed Save, and nothing
 * happened. And when the write *was* refused, the reason went into a toast that
 * faded before you could read it. Now the target declares `writable` per entry
 * and the refusal is rendered in the editor, under the code, until you fix it.
 */
export function FileExplorer({ editable }: { editable?: boolean }) {
  const lab = useStore((s) => s.lab);
  const runAction = useStore((s) => s.runAction);
  const pushToast = useStore((s) => s.pushToast);
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [current, setCurrent] = useState<FsEntry | null>(null);
  const [content, setContent] = useState('');
  const [original, setOriginal] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!lab) return;
    const res = await api.labAction(lab.instanceId, { type: 'lab.inspect', what: 'files' });
    if (res.result.type === 'inspect' && res.result.view.kind === 'files') setEntries(res.result.view.root);
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lab?.instanceId]);

  const open = async (entry: FsEntry) => {
    if (entry.type === 'dir') return;
    const res = await runAction({ type: 'fs.read', path: entry.path });
    if (res?.result.type === 'fs.content') {
      setCurrent(entry);
      setContent(res.result.content);
      setOriginal(res.result.content);
      setProblem(null);
      setSaved(false);
    }
  };

  const save = async () => {
    if (!current || saving) return;
    setSaving(true);
    setProblem(null);
    try {
      const res = await api.labAction(lab!.instanceId, { type: 'editor.write', path: current.path, content });
      useStore.setState({ lab: res.state, lastAction: res });

      // A refused action is *not* a transport failure: the lab answers 200 with
      // an error result. Missing that distinction is what made Save look like
      // it did nothing — the request succeeded, the write did not.
      if (res.result.type === 'error') {
        setProblem(res.result.message);
        return;
      }

      setOriginal(content);
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
      pushToast({ kind: 'success', title: 'File salvato', detail: current.path });
      await load();
    } catch (error) {
      // The target refuses writes for real reasons — invalid JSON, a read-only
      // path, a permission bit. Those are part of the lesson, so they stay on
      // screen instead of flashing past in a toast.
      setProblem(messageOf(error));
    } finally {
      setSaving(false);
    }
  };

  const files = entries.filter((e) => e.type === 'file');
  const dirty = content !== original;
  const canWrite = Boolean(editable && current?.writable);
  const language = current ? languageForPath(current.path) : 'text';

  return (
    <div className="flex h-full">
      <div className="w-56 shrink-0 overflow-y-auto border-r border-[var(--color-line)] p-1.5">
        <div className="px-2 py-1 text-[10.5px] uppercase tracking-wider text-[var(--color-ink-500)]">Files</div>
        {files.length === 0 && <div className="px-2 py-1 text-[11.5px] text-[var(--color-ink-500)]">Nessun file esposto.</div>}
        {files.map((entry) => (
          <button
            key={entry.path}
            onClick={() => open(entry)}
            className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11.5px] ${current?.path === entry.path ? 'bg-[var(--color-abyss-600)] text-[var(--color-ink-100)]' : 'text-[var(--color-ink-300)] hover:bg-[var(--color-abyss-700)]'}`}
            title={`${entry.path}${entry.writable ? '' : ' — ' + (entry.readOnlyReason ?? 'read-only')}`}
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${entry.writable ? 'bg-[var(--color-flux)]' : 'bg-[var(--color-ink-500)]'}`}
              title={entry.writable ? 'scrivibile' : 'sola lettura'}
            />
            <span className="mono truncate">{entry.name}</span>
            {dirty && current?.path === entry.path && <span className="ml-auto text-[var(--color-amber)]">●</span>}
          </button>
        ))}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {!current ? (
          <div className="grid flex-1 place-items-center text-[12.5px] text-[var(--color-ink-500)]">Seleziona un file.</div>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-[var(--color-line)] bg-[var(--color-abyss-800)] px-3 py-1.5">
              <span className="mono truncate text-[11.5px] text-[var(--color-ink-300)]">{current.path}</span>
              {dirty && <span className="chip !border-[var(--color-amber)] !py-0 !text-[9.5px] !text-[var(--color-amber)]">modificato</span>}
              <span className="mono ml-auto text-[10.5px] text-[var(--color-ink-500)]">{language}</span>
              {canWrite ? (
                <button className="btn btn-primary !py-1 text-[11px]" onClick={save} disabled={!dirty || saving}>
                  {saved ? (
                    <><Icon.check size={12} /> Salvato</>
                  ) : saving ? (
                    'Salvataggio…'
                  ) : (
                    <>Salva <kbd className="!border-0 !bg-transparent !px-0 !text-[10px] opacity-60">⌘S</kbd></>
                  )}
                </button>
              ) : (
                <span className="chip !py-0 !text-[10px]" title={current.readOnlyReason ?? 'Questo file non è modificabile in questo lab.'}>
                  read-only
                </span>
              )}
            </div>

            {!canWrite && current.readOnlyReason && (
              <div className="border-b border-[var(--color-line)] bg-[var(--color-abyss-800)] px-3 py-1.5 text-[11px] text-[var(--color-ink-500)]">
                {current.readOnlyReason}
              </div>
            )}

            {canWrite ? (
              <CodeEditor
                value={content}
                language={language}
                onChange={(v) => { setContent(v); setProblem(null); }}
                onSave={save}
                problem={problem}
              />
            ) : (
              <CodeViewer value={content} language={language} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Read-only "what the server sees" database inspector. */
export function DatabaseViewer() {
  const lab = useStore((s) => s.lab);
  const [view, setView] = useState<Extract<LabInspectView, { kind: 'database' }> | null>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!lab) return;
    void api.labAction(lab.instanceId, { type: 'lab.inspect', what: 'database' }).then((res) => {
      if (res.result.type === 'inspect' && res.result.view.kind === 'database') setView(res.result.view);
    });
  }, [lab?.instanceId, lab?.eventCount]);

  if (!view) return <div className="grid h-full place-items-center text-[12.5px] text-[var(--color-ink-500)]">Caricamento schema…</div>;
  const table = view.tables[active];

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-1 overflow-x-auto border-b border-[var(--color-line)] p-1.5">
        {view.tables.map((t, i) => (
          <button
            key={t.name}
            onClick={() => setActive(i)}
            className={`mono shrink-0 rounded px-2.5 py-1 text-[11.5px] ${active === i ? 'bg-[var(--color-abyss-600)] text-[var(--color-ink-100)]' : 'text-[var(--color-ink-400)] hover:bg-[var(--color-abyss-700)]'}`}
          >
            {t.name} <span className="text-[var(--color-ink-500)]">{t.rows.length}</span>
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2.5">
        {table && (
          <div className="overflow-x-auto rounded-lg border border-[var(--color-line)]">
            <table className="mono w-full border-collapse text-[11px]">
              <thead>
                <tr>
                  {table.columns.map((c) => (
                    <th key={c} className="border-b border-[var(--color-line)] bg-[var(--color-abyss-800)] px-2 py-1.5 text-left font-semibold text-[var(--color-ink-400)]">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, i) => (
                  <tr key={i} className="odd:bg-[var(--color-abyss-900)]">
                    {row.map((cell, j) => (
                      <td key={j} className="border-b border-[var(--color-line)] px-2 py-1 text-[var(--color-ink-200)]">
                        {cell === null ? <span className="text-[var(--color-ink-500)]">NULL</span> : String(cell).length > 40 ? String(cell).slice(0, 40) + '…' : String(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/** Server-side log stream — the blue-team window. */
export function LogViewer() {
  const lab = useStore((s) => s.lab);
  const [entries, setEntries] = useState<Extract<LabInspectView, { kind: 'logs' }>['entries']>([]);

  useEffect(() => {
    if (!lab) return;
    void api.labAction(lab.instanceId, { type: 'lab.inspect', what: 'logs' }).then((res) => {
      if (res.result.type === 'inspect' && res.result.view.kind === 'logs') setEntries(res.result.view.entries);
    });
  }, [lab?.instanceId, lab?.eventCount]);

  const color: Record<string, string> = {
    debug: 'var(--color-ink-500)',
    info: 'var(--color-ink-300)',
    warn: 'var(--color-amber)',
    error: 'var(--color-breach)',
  };

  return (
    <div className="h-full overflow-auto p-2.5">
      {entries.length === 0 ? (
        <div className="grid h-full place-items-center text-[12.5px] text-[var(--color-ink-500)]">Nessun log ancora. Interagisci con il target.</div>
      ) : (
        <div className="mono space-y-0.5 text-[11.5px]">
          {entries.map((e, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-[var(--color-ink-500)]">{new Date(e.at).toISOString().slice(11, 19)}</span>
              <span style={{ color: color[e.level] }} className="w-10 uppercase">{e.level}</span>
              <span className="text-[var(--color-ink-500)]">[{e.source}]</span>
              <span className="text-[var(--color-ink-200)]">{e.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
