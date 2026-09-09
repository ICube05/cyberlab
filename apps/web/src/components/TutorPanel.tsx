import { useEffect, useRef, useState } from 'react';
import { TUTOR_MODE_META, TUTOR_MODES, type TutorMode } from '@cyberlab/core';
import { useStore } from '../store.js';
import { Icon } from '../icons.js';
import { renderInline } from './blocks/inline.js';

/**
 * The AI tutor.
 *
 * Not a generic chatbot bolted on the side: it opens with the lesson's context
 * already loaded, its mode buttons change *what the server assembles* (a hint
 * turn sees the sealed hints, an explain turn sees the solution), and it streams
 * token by token. When no provider is reachable it answers from the authored
 * pedagogy and labels itself "offline", so it is never dead.
 */
export function TutorPanel() {
  const messages = useStore((s) => s.tutorMessages);
  const streaming = useStore((s) => s.tutorStreaming);
  const provider = useStore((s) => s.tutorProvider);
  const mode = useStore((s) => s.tutorMode);
  const ask = useStore((s) => s.askTutor);
  const setMode = useStore((s) => s.setTutorMode);
  const lab = useStore((s) => s.lab);
  const lesson = useStore((s) => s.lesson);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = () => {
    const text = draft.trim();
    if (!text || streaming) return;
    setDraft('');
    void ask(text, 'ask');
  };

  const runMode = (m: TutorMode) => {
    setMode(m);
    void ask(undefined, m);
  };

  return (
    <div className="flex h-full flex-col bg-[var(--color-abyss-800)]">
      {/* header */}
      <div className="flex items-center gap-2 border-b border-[var(--color-line)] px-3 py-2">
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-[color-mix(in_oklab,var(--color-violet)_20%,transparent)] text-[var(--color-violet)]">
          <Icon.sparkles size={14} />
        </span>
        <span className="text-[12.5px] font-semibold text-[var(--color-ink-100)]">Tutor</span>
        <span className={`chip !text-[9.5px] ${provider === 'offline' ? '' : '!border-[var(--color-flux-dim)] !text-[var(--color-flux)]'}`} title={provider === 'offline' ? 'Nessun provider AI attivo: risposte deterministiche dalla pedagogia della lezione' : ''}>
          {provider === 'offline' ? 'offline' : provider}
        </span>
      </div>

      {/* mode chips */}
      <div className="flex flex-wrap gap-1 border-b border-[var(--color-line)] px-2 py-1.5">
        {TUTOR_MODES.map((m) => {
          const meta = TUTOR_MODE_META[m];
          const disabled = streaming || (meta.needsLab && !lab);
          const IconCmp = Icon[meta.icon as keyof typeof Icon] ?? Icon.message;
          return (
            <button
              key={m}
              onClick={() => runMode(m)}
              disabled={disabled}
              title={meta.blurb + (meta.needsLab && !lab ? ' (richiede un lab attivo)' : '')}
              className={[
                'flex items-center gap-1 rounded-md px-1.5 py-1 text-[10.5px] transition-colors',
                mode === m ? 'bg-[var(--color-abyss-600)] text-[var(--color-ink-100)]' : 'text-[var(--color-ink-400)] hover:bg-[var(--color-abyss-700)]',
                disabled ? 'opacity-40' : '',
              ].join(' ')}
            >
              <IconCmp size={11} /> {meta.label}
            </button>
          );
        })}
      </div>

      {/* messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="mt-4 text-center">
            <div className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-xl bg-[var(--color-abyss-700)] text-[var(--color-violet)]"><Icon.compass size={18} /></div>
            <p className="text-[12px] text-[var(--color-ink-400)]">
              {lesson ? 'Sono già dentro questa lezione.' : 'Apri una lezione per iniziare.'} Usa i pulsanti sopra o scrivimi una domanda.
            </p>
            {lab && (
              <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                {['Perché qui è 403?', 'Come funziona un IDOR?', 'Sono bloccato'].map((q) => (
                  <button key={q} className="chip cursor-pointer hover:border-[var(--color-signal)] hover:text-[var(--color-ink-200)]" onClick={() => void ask(q, 'ask')}>
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {messages.map((m) => (
          <Message key={m.id} role={m.role} content={m.content} mode={m.mode} streaming={streaming && m === messages[messages.length - 1] && m.role === 'tutor'} />
        ))}
      </div>

      {/* composer */}
      <div className="border-t border-[var(--color-line)] p-2">
        <div className="flex items-end gap-1.5 rounded-xl border border-[var(--color-line-strong)] bg-[var(--color-abyss-900)] p-1.5 focus-within:border-[var(--color-signal)]">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Chiedi al tutor…"
            rows={1}
            className="mono max-h-28 min-h-0 flex-1 resize-none !border-0 !bg-transparent !p-1.5 text-[12.5px] focus:!ring-0 focus:!shadow-none"
          />
          <button className="btn btn-primary !px-2 !py-1.5" onClick={send} disabled={streaming || !draft.trim()}>
            <Icon.send size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

function Message({ role, content, mode, streaming }: { role: 'user' | 'tutor'; content: string; mode?: TutorMode; streaming: boolean }) {
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-xl rounded-br-sm bg-[color-mix(in_oklab,var(--color-signal)_18%,var(--color-abyss-700))] px-3 py-2 text-[12.5px] text-[var(--color-ink-100)]">
          {content}
        </div>
      </div>
    );
  }
  return (
    <div className="animate-fade-in">
      {mode && (
        <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-[var(--color-violet)]">
          <Icon.sparkles size={10} /> {TUTOR_MODE_META[mode]?.label ?? mode}
        </div>
      )}
      <div className="text-[12.5px] leading-relaxed text-[var(--color-ink-200)]">
        <TutorMarkdown text={content} />
        {streaming && <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-[blink_1s_steps(1)_infinite] bg-[var(--color-violet)]" />}
      </div>
    </div>
  );
}

/** Light markdown for tutor replies: paragraphs, bullet lists, `code`, **bold**. */
function TutorMarkdown({ text }: { text: string }) {
  const blocks = text.split(/\n\n+/);
  return (
    <div className="space-y-2">
      {blocks.map((block, i) => {
        const lines = block.split('\n');
        if (lines.every((l) => /^\s*[-*]\s+/.test(l) || l.trim() === '')) {
          return (
            <ul key={i} className="space-y-0.5">
              {lines.filter((l) => l.trim()).map((l, j) => (
                <li key={j} className="flex gap-1.5">
                  <span className="text-[var(--color-violet)]">•</span>
                  <span>{renderInline(l.replace(/^\s*[-*]\s+/, ''))}</span>
                </li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{renderInline(block)}</p>;
      })}
    </div>
  );
}
