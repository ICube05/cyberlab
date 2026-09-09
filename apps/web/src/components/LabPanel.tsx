import { useEffect, useMemo, useState } from 'react';
import type { LabSurface } from '@cyberlab/core';
import { useStore } from '../store.js';
import { Icon } from '../icons.js';
import { RequestPanel } from './lab/RequestPanel.js';
import { Terminal } from './lab/Terminal.js';
import { BrowserView, DatabaseViewer, FileExplorer, LogViewer, SqlConsole } from './lab/Surfaces.js';

/**
 * The Live Lab — Section C.
 *
 * A tabbed workbench whose available surfaces are dictated by the lab spec, so a
 * web lab shows a request editor and a browser while a Linux lab shows a
 * terminal and a file tree. The header carries the honest lab status: which
 * target, which seed (reproducible), how many signals the target has raised,
 * and a real reset that rebuilds the world from that seed.
 */

const SURFACE_META: Record<LabSurface, { label: string; icon: keyof typeof Icon }> = {
  request: { label: 'Request', icon: 'send' },
  browser: { label: 'Browser', icon: 'globe' },
  terminal: { label: 'Terminal', icon: 'terminal' },
  sql: { label: 'SQL', icon: 'layers' },
  files: { label: 'Files', icon: 'book' },
  database: { label: 'Database', icon: 'layers' },
  logs: { label: 'Logs', icon: 'message' },
  editor: { label: 'Editor', icon: 'command' },
};

export function LabPanel() {
  const lesson = useStore((s) => s.lesson);
  const lab = useStore((s) => s.lab);
  const labBusy = useStore((s) => s.labBusy);
  const startLab = useStore((s) => s.startLab);
  const resetLab = useStore((s) => s.resetLab);
  const runAction = useStore((s) => s.runAction);
  const [active, setActive] = useState<LabSurface>('request');

  const surfaces = useMemo(() => lab?.surfaces ?? [], [lab]);

  useEffect(() => {
    if (surfaces.length && !surfaces.includes(active)) setActive(surfaces[0]!);
  }, [surfaces, active]);

  // Bridge the sandboxed browser iframe's clicks/submits back into lab actions.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { cyberlabNav?: string; cyberlabSubmit?: { action: string; method: 'GET' | 'POST'; fields: Record<string, string> } };
      if (data?.cyberlabNav) void runAction({ type: 'browser.navigate', path: data.cyberlabNav });
      else if (data?.cyberlabSubmit) {
        void runAction({ type: 'browser.submit', path: data.cyberlabSubmit.action, method: data.cyberlabSubmit.method, fields: data.cyberlabSubmit.fields });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [runAction]);

  if (!lesson?.lab) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div className="text-[var(--color-ink-500)]">
          <Icon.flask size={26} className="mx-auto mb-2 opacity-40" />
          <div className="text-[12.5px]">Questa lezione non ha un laboratorio.</div>
        </div>
      </div>
    );
  }

  if (!lab) {
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="max-w-sm text-center animate-fade-in">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl border border-[var(--color-line)] bg-[var(--color-abyss-800)] text-[var(--color-flux)]">
            <Icon.flask size={26} />
          </div>
          <h3 className="text-[15px] font-semibold text-[var(--color-ink-100)]">{lesson.lab.title}</h3>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--color-ink-400)]">{lesson.lab.scenario}</p>
          <div className="mt-3 space-y-1 text-left">
            {lesson.lab.initialState.map((line, i) => (
              <div key={i} className="flex gap-2 text-[11.5px] text-[var(--color-ink-500)]">
                <span className="mt-1 text-[var(--color-signal)]"><Icon.dot size={9} /></span> {line}
              </div>
            ))}
          </div>
          <button className="btn btn-primary mt-4 w-full justify-center" onClick={() => startLab(lesson.lab!.id)} disabled={labBusy}>
            <Icon.play size={14} /> {labBusy ? 'Avvio…' : 'Avvia laboratorio'}
          </button>
          {lesson.lab.credentials && lesson.lab.credentials.length > 0 && (
            <div className="mt-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-abyss-800)] p-2.5 text-left">
              <div className="text-[10.5px] uppercase tracking-wider text-[var(--color-ink-500)]">Credenziali fornite</div>
              {lesson.lab.credentials.map((c) => (
                <div key={c.username} className="mono mt-1 text-[11.5px] text-[var(--color-ink-200)]">
                  {c.username} : {c.password} {c.note && <span className="text-[var(--color-ink-500)]">({c.note})</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[var(--color-abyss-900)]">
      {/* lab header */}
      <div className="flex items-center gap-2 border-b border-[var(--color-line)] bg-[var(--color-abyss-800)] px-3 py-1.5">
        <span className={`h-2 w-2 rounded-full ${lab.status === 'ready' ? 'bg-[var(--color-flux)]' : lab.status === 'busy' ? 'bg-[var(--color-amber)]' : 'bg-[var(--color-breach)]'}`} title={lab.status} />
        <span className="mono text-[11.5px] text-[var(--color-ink-200)]">{lesson.lab.target.host}</span>
        <span className="chip mono !text-[10px]" title="Seed — riproducibile">seed:{lab.seed}</span>
        {lab.signals.length > 0 && (
          <span className="chip !border-[var(--color-signal-dim)] !text-[var(--color-signal)] !text-[10px]" title={lab.signals.map((s) => s.name).join('\n')}>
            {new Set(lab.signals.map((s) => s.name)).size} segnali
          </span>
        )}
        {lab.flags.length > 0 && <span className="chip !border-[var(--color-flux-dim)] !text-[var(--color-flux)] !text-[10px]">🚩 {lab.flags.length}</span>}
        <div className="ml-auto flex items-center gap-1">
          <button className="btn btn-ghost !px-2 !py-1 text-[11px]" onClick={resetLab} title="Reset — ricostruisce il lab dallo stesso seed">
            <Icon.refresh size={12} /> Reset
          </button>
        </div>
      </div>

      {/* surface tabs */}
      <div className="flex items-center gap-0.5 border-b border-[var(--color-line)] px-1.5 py-1">
        {surfaces.map((surface) => {
          const meta = SURFACE_META[surface];
          const IconCmp = Icon[meta.icon];
          return (
            <button
              key={surface}
              onClick={() => setActive(surface)}
              className={[
                'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11.5px] transition-colors',
                active === surface ? 'bg-[var(--color-abyss-600)] text-[var(--color-ink-100)]' : 'text-[var(--color-ink-400)] hover:bg-[var(--color-abyss-700)]',
              ].join(' ')}
            >
              <IconCmp size={13} /> {meta.label}
            </button>
          );
        })}
      </div>

      {/* active surface */}
      <div className="min-h-0 flex-1">
        <SurfaceView surface={active} />
      </div>
    </div>
  );
}

function SurfaceView({ surface }: { surface: LabSurface }) {
  switch (surface) {
    case 'request':
      return <RequestPanel />;
    case 'browser':
      return <BrowserView />;
    case 'terminal':
      return <Terminal />;
    case 'sql':
      return <SqlConsole />;
    case 'files':
      return <FileExplorer />;
    case 'editor':
      return <FileExplorer editable />;
    case 'database':
      return <DatabaseViewer />;
    case 'logs':
      return <LogViewer />;
  }
}
