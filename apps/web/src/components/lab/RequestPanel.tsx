import { useState } from 'react';
import type { HttpResponseView } from '@cyberlab/core';
import { useStore } from '../../store.js';
import { Icon } from '../../icons.js';

/**
 * The HTTP request editor and response viewer — a small Burp-Repeater-shaped
 * surface, in our own visual language.
 *
 * The learner edits a raw request and hits SEND; the server runs it against the
 * real target and returns the real response, its status, its headers, and — the
 * teaching device — the target's own "server notes" explaining what it did
 * internally. Nothing is faked: change the id, get the other user's 200.
 */
export function RequestPanel() {
  const runAction = useStore((s) => s.runAction);
  const lastAction = useStore((s) => s.lastAction);
  const busy = useStore((s) => s.labBusy);
  const lab = useStore((s) => s.lab);

  const [method, setMethod] = useState('GET');
  const [path, setPath] = useState('/profile.php?id=15');
  const [headers, setHeaders] = useState('');
  const [body, setBody] = useState('');
  const [tab, setTab] = useState<'pretty' | 'raw' | 'notes'>('pretty');

  const response = lastAction?.result.type === 'http.response' ? lastAction.result.response : undefined;

  const send = () => {
    const parsedHeaders: Record<string, string> = {};
    for (const line of headers.split('\n')) {
      const idx = line.indexOf(':');
      if (idx > 0) parsedHeaders[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    void runAction({
      type: 'http.request',
      method,
      path,
      headers: parsedHeaders,
      ...(body.trim() ? { body } : {}),
      useCookieJar: true,
      followRedirects: true,
    });
  };

  const cookies = lab?.cookies ?? [];

  return (
    <div className="flex h-full flex-col">
      {/* request line */}
      <div className="border-b border-[var(--color-line)] p-2.5">
        <div className="flex gap-1.5">
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="mono !py-1.5 text-[12px] font-semibold text-[var(--color-signal)]">
            {['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
            spellCheck={false}
            className="mono flex-1 !py-1.5 text-[12.5px]"
            placeholder="/path?query"
          />
          <button className="btn btn-primary" onClick={send} disabled={busy}>
            {busy ? '…' : <><Icon.send size={13} /> Send</>}
          </button>
        </div>
        {cookies.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[10.5px] uppercase tracking-wider text-[var(--color-ink-500)]">Cookie jar:</span>
            {cookies.map((c) => (
              <span key={c.name} className="chip mono !text-[10.5px]" title={Object.keys(c.attributes).join(' ')}>
                {c.name}={c.value.length > 14 ? c.value.slice(0, 14) + '…' : c.value}
              </span>
            ))}
          </div>
        )}
        <details className="mt-2 text-[11.5px]">
          <summary className="cursor-pointer text-[var(--color-ink-500)] hover:text-[var(--color-ink-300)]">headers & body</summary>
          <textarea
            value={headers}
            onChange={(e) => setHeaders(e.target.value)}
            placeholder={'X-Header: value\nAnother: value'}
            spellCheck={false}
            rows={2}
            className="mono mt-1.5 w-full text-[11.5px]"
          />
          {(method === 'POST' || method === 'PUT' || method === 'PATCH') && (
            <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="request body" spellCheck={false} rows={2} className="mono mt-1.5 w-full text-[11.5px]" />
          )}
        </details>
      </div>

      {/* response */}
      <div className="flex min-h-0 flex-1 flex-col">
        {!response ? (
          <div className="grid flex-1 place-items-center text-center">
            <div className="text-[var(--color-ink-500)]">
              <Icon.send size={22} className="mx-auto mb-2 opacity-50" />
              <div className="text-[12.5px]">Invia una richiesta per vedere la risposta reale del target.</div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-[var(--color-line)] px-3 py-1.5">
              <StatusBadge status={response.status} text={response.statusText} />
              <span className="mono text-[11px] text-[var(--color-ink-500)]">{response.body.length} B</span>
              <span className="mono text-[11px] text-[var(--color-ink-500)]">{lastAction?.result.durationMs}ms</span>
              {response.finalPath && response.redirectChain && response.redirectChain.length > 0 && (
                <span className="chip !text-[10px]" title="redirect seguiti">↪ {response.finalPath}</span>
              )}
              <div className="ml-auto flex gap-0.5">
                {(['pretty', 'raw', 'notes'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`rounded px-2 py-0.5 text-[11px] ${tab === t ? 'bg-[var(--color-abyss-600)] text-[var(--color-ink-100)]' : 'text-[var(--color-ink-500)] hover:text-[var(--color-ink-300)]'}`}
                  >
                    {t === 'notes' ? `notes${response.serverNotes ? ` (${response.serverNotes.length})` : ''}` : t}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {tab === 'notes' ? <ServerNotes response={response} /> : tab === 'raw' ? <RawResponse response={response} /> : <PrettyResponse response={response} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status, text }: { status: number; text: string }) {
  const color = status < 300 ? 'var(--color-flux)' : status < 400 ? 'var(--color-signal)' : status < 500 ? 'var(--color-breach)' : 'var(--color-amber)';
  return (
    <span className="mono flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color }}>
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {status} {text}
    </span>
  );
}

function PrettyResponse({ response }: { response: HttpResponseView }) {
  const isHtml = response.contentType.includes('html');
  return (
    <div>
      {isHtml ? (
        <iframe
          title="lab-browser"
          sandbox=""
          srcDoc={response.body}
          className="h-64 w-full border-b border-[var(--color-line)] bg-white"
        />
      ) : null}
      <pre className="mono overflow-x-auto p-3 text-[12px] leading-relaxed text-[var(--color-ink-200)]">{response.body}</pre>
    </div>
  );
}

function RawResponse({ response }: { response: HttpResponseView }) {
  const raw = [
    `HTTP/1.1 ${response.status} ${response.statusText}`,
    ...response.headers.map((h) => `${h.name}: ${h.value}`),
    '',
    response.body,
  ].join('\n');
  return <pre className="mono overflow-x-auto p-3 text-[11.5px] leading-relaxed text-[var(--color-ink-300)]">{raw}</pre>;
}

function ServerNotes({ response }: { response: HttpResponseView }) {
  if (!response.serverNotes || response.serverNotes.length === 0) {
    return <div className="p-4 text-[12.5px] text-[var(--color-ink-500)]">Nessuna nota dal server per questa risposta.</div>;
  }
  return (
    <div className="p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-[var(--color-ink-500)]">
        <Icon.info size={13} className="text-[var(--color-signal)]" /> Cosa ha fatto il server (visibile perché è un lab)
      </div>
      <ol className="space-y-1.5">
        {response.serverNotes.map((note, i) => (
          <li key={i} className="flex gap-2 text-[12.5px] text-[var(--color-ink-300)]">
            <span className="mono text-[var(--color-signal)]">{i + 1}.</span>
            <span className="mono">{note}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
