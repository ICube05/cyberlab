import { useMemo, useState } from 'react';
import { useStore } from '../store.js';
import { Icon } from '../icons.js';

/**
 * Sfide — the AI sets the scene, the lab decides whether you solved it.
 *
 * The division of labour is the whole point, and it is the same one the
 * exercise generator argues for: a model cannot be trusted to invent something
 * *gradable*, because grading needs criteria that match signals a real target
 * raises. So the model writes the incident — who the client is, what happened —
 * and everything that decides your score (the lab, the objectives, the criteria)
 * is derived from an authored mission and evaluated by the same engine.
 *
 * That means a challenge is exactly as honest as a hand-written mission: you
 * solve it by actually exploiting a running target, not by convincing a chatbot.
 */
export function ChallengePanel() {
  const curriculum = useStore((s) => s.curriculum);
  const generate = useStore((s) => s.generateChallenge);
  const busy = useStore((s) => s.challengeBusy);
  const last = useStore((s) => s.lastChallenge);
  const attempt = useStore((s) => s.attempt);
  const provider = useStore((s) => s.tutorProvider);

  // Only lessons with a real lab and gradable missions can seed a challenge —
  // anything else would be a scenario with nothing behind it.
  const playable = useMemo(
    () => (curriculum?.lessons ?? []).filter((l) => l.hasLab && l.exerciseCount > 0),
    [curriculum],
  );

  const [lessonId, setLessonId] = useState<string>('');
  const [shift, setShift] = useState(1);
  const chosen = lessonId || playable[0]?.id || '';

  if (!curriculum) return null;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-[var(--color-line)] px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-500)]">
          <Icon.flame size={13} className="text-[var(--color-amber)]" /> Sfide
        </div>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--color-ink-400)]">
          Il tutor inventa una situazione nuova; il laboratorio è quello vero e la
          valutazione è la stessa delle missioni scritte a mano.
        </p>
      </div>

      <div className="space-y-3 p-3">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-[var(--color-ink-300)]">Terreno</label>
          <select
            className="w-full text-[12.5px]"
            value={chosen}
            onChange={(e) => setLessonId(e.target.value)}
            disabled={busy}
          >
            {playable.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
          {playable.length === 0 && (
            <p className="mt-1 text-[11px] text-[var(--color-ink-500)]">
              Nessuna lezione con laboratorio disponibile.
            </p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-[var(--color-ink-300)]">Difficoltà</label>
          <div className="flex gap-1">
            {[
              { v: 0, label: 'Come la lezione' },
              { v: 1, label: 'Più dura' },
              { v: 2, label: 'Senza rete' },
            ].map((opt) => (
              <button
                key={opt.v}
                onClick={() => setShift(opt.v)}
                disabled={busy}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] transition-colors ${
                  shift === opt.v
                    ? 'border-[var(--color-amber)] bg-[color-mix(in_oklab,var(--color-amber)_12%,transparent)] text-[var(--color-ink-100)]'
                    : 'border-[var(--color-line)] text-[var(--color-ink-400)] hover:border-[var(--color-line-strong)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-ink-500)]">
            Più è dura, meno indizi hai e più pesano gli obiettivi.
          </p>
        </div>

        <button
          className="btn btn-primary w-full justify-center"
          disabled={busy || !chosen}
          onClick={() => void generate(chosen, shift)}
        >
          {busy ? 'Sto preparando lo scenario…' : <><Icon.flame size={14} /> Genera sfida</>}
        </button>

        {attempt && last && (
          <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-abyss-800)] p-3">
            <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--color-amber)]">
              <Icon.target size={12} /> Sfida in corso
            </div>
            <div className="text-[12.5px] text-[var(--color-ink-100)]">{attempt.exercise.title}</div>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--color-ink-400)]">
              {attempt.exercise.mission.context}
            </p>
            <div className="mono mt-2 space-y-0.5 text-[10.5px] text-[var(--color-ink-500)]">
              <div>derivata da {last.derivedFrom}</div>
              <div>
                scenario:{' '}
                {last.scenarioBy === 'authored'
                  ? 'testo autoriale (nessun modello attivo)'
                  : `scritto da ${last.scenarioBy}`}
              </div>
            </div>
          </div>
        )}

        <div className="rounded-lg border-l-2 border-[var(--color-violet)] bg-[color-mix(in_oklab,var(--color-violet)_6%,transparent)] px-2.5 py-2 text-[11px] leading-relaxed text-[var(--color-ink-400)]">
          Il modello scrive solo l'ambientazione. Obiettivi, criteri e punteggio
          vengono dal motore, quindi una sfida si supera sfruttando davvero il
          bersaglio — non convincendo il tutor.
          {provider === 'offline' && (
            <> Ora il tutor è <span className="text-[var(--color-ink-200)]">offline</span>: le sfide restano giocabili, con il testo autoriale.</>
          )}
        </div>
      </div>
    </div>
  );
}
