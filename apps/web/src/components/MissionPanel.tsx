import { useState } from 'react';
import type { Exercise } from '@cyberlab/core';
import { useStore } from '../store.js';
import { Icon } from '../icons.js';

/**
 * The mission panel.
 *
 * Picks up the lesson's exercises, lets the learner start one, and then becomes
 * a live mission console: the briefing, an objective checklist that ticks off
 * *as the learner works the lab* (fed by the server's per-action preview), an
 * escalating hint ladder that costs evidence weight, an optional findings
 * report, and Submit. On success it shows the graded result — the "MISSION
 * COMPLETE / Score 92/100" moment — with the mastery it moved.
 */
export function MissionPanel() {
  const lesson = useStore((s) => s.lesson);
  const attempt = useStore((s) => s.attempt);
  const startAttempt = useStore((s) => s.startAttempt);

  if (!lesson) return null;
  const exercises = lesson.exercises;

  if (attempt?.result) return <MissionResult />;
  if (attempt) return <ActiveMission />;

  if (exercises.length === 0) {
    return <div className="p-4 text-[12.5px] text-[var(--color-ink-500)]">Nessuna missione per questa lezione.</div>;
  }

  return (
    <div className="space-y-2 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-500)]">
        <Icon.target size={13} className="text-[var(--color-signal)]" /> Missioni
      </div>
      {exercises.map((ex, i) => (
        <MissionCard key={ex.id} exercise={ex} index={i} onStart={() => startAttempt(ex)} state={lesson.progress?.exercises[ex.id]} />
      ))}
    </div>
  );
}

function MissionCard({
  exercise,
  index,
  onStart,
  state,
}: {
  exercise: Exercise;
  index: number;
  onStart: () => void;
  state?: { passed: boolean; bestScore: number; attempts: number };
}) {
  const kindColor: Record<string, string> = {
    guided: 'var(--color-ink-400)',
    mission: 'var(--color-signal)',
    challenge: 'var(--color-amber)',
    fix: 'var(--color-flux)',
    checkpoint: 'var(--color-violet)',
  };
  return (
    <button onClick={onStart} className="panel group flex w-full items-center gap-3 p-3 text-left transition-colors hover:border-[var(--color-line-strong)]">
      <span className="mono grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[var(--color-abyss-600)] text-[12px] text-[var(--color-ink-400)]">{index + 1}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium text-[var(--color-ink-100)]">{exercise.title}</span>
          {state?.passed && <Icon.checkCircle size={14} className="text-[var(--color-flux)]" />}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--color-ink-500)]">
          <span style={{ color: kindColor[exercise.kind] }}>{exercise.kind}</span>
          <span>·</span>
          <span>{exercise.xp} XP</span>
          {state && state.attempts > 0 && <><span>·</span><span>best {state.bestScore}%</span></>}
        </div>
      </div>
      <Icon.play size={14} className="shrink-0 text-[var(--color-ink-500)] transition-colors group-hover:text-[var(--color-signal)]" />
    </button>
  );
}

function ActiveMission() {
  const attempt = useStore((s) => s.attempt)!;
  const revealHint = useStore((s) => s.revealHint);
  const setReportField = useStore((s) => s.setReportField);
  const submitAttempt = useStore((s) => s.submitAttempt);
  const abandonAttempt = useStore((s) => s.abandonAttempt);
  const setTutor = useStore((s) => s.askTutor);
  const [confirmExit, setConfirmExit] = useState(false);
  const { exercise, hintsRevealed, liveObjectives, report, submitting } = attempt;

  const nextHint = exercise.hints.filter((h) => !hintsRevealed.some((r) => r.id === h.id)).sort((a, b) => a.level - b.level)[0];
  const passedCount = liveObjectives.filter((o) => o.passed).length;
  const started = passedCount > 0 || hintsRevealed.length > 0;

  // Leaving is cheap when nothing has happened yet and deliberate once it has,
  // so a half-solved mission is never thrown away by a stray click.
  const leave = () => {
    if (started && !confirmExit) {
      setConfirmExit(true);
      return;
    }
    void abandonAttempt();
  };

  return (
    <div className="flex h-full flex-col">
      {/* mission bar — the way out of a live mission */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-line)] bg-[var(--color-abyss-900)] px-2.5 py-1.5">
        <span className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--color-signal)]">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-signal)] opacity-70" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-signal)]" />
          </span>
          Missione in corso
        </span>
        <span className="mono ml-auto text-[10.5px] text-[var(--color-ink-500)]">{passedCount}/{liveObjectives.length}</span>
        {confirmExit ? (
          <div className="flex items-center gap-1">
            <span className="text-[10.5px] text-[var(--color-ink-400)]">Uscire?</span>
            <button className="btn btn-ghost !px-1.5 !py-0.5 !text-[10.5px] !text-[var(--color-breach)]" onClick={() => void abandonAttempt()}>
              Esci
            </button>
            <button className="btn btn-ghost !px-1.5 !py-0.5 !text-[10.5px]" onClick={() => setConfirmExit(false)}>
              Annulla
            </button>
          </div>
        ) : (
          <button
            className="btn btn-ghost !px-1.5 !py-0.5 text-[10.5px]"
            onClick={leave}
            title="Abbandona la missione — nessuna valutazione viene registrata"
          >
            <Icon.x size={12} /> Esci
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {/* briefing */}
        <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-abyss-800)] p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--color-signal)]">
            <Icon.target size={12} /> Mission · {exercise.kind}
          </div>
          <div className="text-[13px] font-medium text-[var(--color-ink-100)]">{exercise.mission.objective}</div>
          <p className="mt-1 text-[12px] text-[var(--color-ink-400)]">{exercise.mission.context}</p>
          {exercise.mission.known && exercise.mission.known.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {exercise.mission.known.map((k, i) => (
                <div key={i} className="mono flex gap-1.5 text-[11px] text-[var(--color-ink-500)]"><span>›</span>{k}</div>
              ))}
            </div>
          )}
          {exercise.mission.scope && (
            <div className="mt-2 flex gap-1.5 rounded-lg border-l-2 border-[var(--color-violet)] bg-[color-mix(in_oklab,var(--color-violet)_6%,transparent)] px-2 py-1.5 text-[11px] text-[var(--color-ink-400)]">
              <Icon.shield size={12} className="mt-0.5 shrink-0 text-[var(--color-violet)]" /> {exercise.mission.scope}
            </div>
          )}
        </div>

        {/* live objectives */}
        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-500)]">
            <span>Obiettivi</span>
            <span className="mono">{passedCount}/{liveObjectives.length}</span>
          </div>
          <div className="space-y-1">
            {liveObjectives.map((o) => (
              <div key={o.id} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12px] transition-colors ${o.passed ? 'border-[var(--color-flux-dim)] bg-[color-mix(in_oklab,var(--color-flux)_8%,transparent)] text-[var(--color-ink-100)]' : 'border-[var(--color-line)] text-[var(--color-ink-400)]'}`}>
                {o.passed ? <Icon.checkCircle size={15} className="text-[var(--color-flux)]" /> : <Icon.circle size={14} className="text-[var(--color-ink-500)]" />}
                <span className={o.passed ? '' : ''}>{o.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* report fields */}
        {exercise.report && exercise.report.length > 0 && (
          <div className="mt-3">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-500)]">Report</div>
            <div className="space-y-2">
              {exercise.report.map((field) => (
                <div key={field.id}>
                  <label className="mb-0.5 block text-[11.5px] text-[var(--color-ink-300)]">{field.label}</label>
                  {field.type === 'select' ? (
                    <select className="w-full text-[12.5px]" value={report[field.id] ?? ''} onChange={(e) => setReportField(field.id, e.target.value)}>
                      <option value="">—</option>
                      {field.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : (
                    <input className="w-full text-[12.5px]" placeholder={field.placeholder} value={report[field.id] ?? ''} onChange={(e) => setReportField(field.id, e.target.value)} />
                  )}
                  {field.help && <div className="mt-0.5 text-[10.5px] text-[var(--color-ink-500)]">{field.help}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* hints */}
        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-500)]">
            <span>Indizi</span>
            {hintsRevealed.length > 0 && <span className="text-[var(--color-amber)]">{hintsRevealed.length} usati</span>}
          </div>
          <div className="space-y-1.5">
            {hintsRevealed.map((h) => (
              <div key={h.id} className="animate-fade-in flex gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-abyss-800)] px-2.5 py-2 text-[12px] text-[var(--color-ink-300)]">
                <span className="mt-0.5 text-[var(--color-amber)]"><Icon.lightbulb size={13} /></span>
                <span>{h.text}</span>
              </div>
            ))}
            {nextHint ? (
              <button className="btn w-full justify-center !py-1.5 text-[11.5px]" onClick={() => revealHint(nextHint.id)}>
                <Icon.lightbulb size={13} /> Rivela indizio {nextHint.level} <span className="text-[var(--color-ink-500)]">(riduce il peso della prova)</span>
              </button>
            ) : (
              <button className="btn w-full justify-center !py-1.5 text-[11.5px]" onClick={() => setTutor(undefined, 'hint')}>
                <Icon.compass size={13} /> Chiedi un indizio al tutor
              </button>
            )}
          </div>
        </div>
      </div>

      {/* submit bar */}
      <div className="flex gap-2 border-t border-[var(--color-line)] p-2.5">
        <button className="btn btn-primary flex-1 justify-center" onClick={submitAttempt} disabled={submitting}>
          {submitting ? 'Valutazione…' : <><Icon.check size={14} /> Invia e valuta</>}
        </button>
        <button
          className="btn btn-ghost !px-2.5"
          onClick={leave}
          title="Abbandona la missione — nessuna valutazione viene registrata"
        >
          <Icon.x size={14} />
        </button>
      </div>
    </div>
  );
}

function MissionResult() {
  const attempt = useStore((s) => s.attempt)!;
  const clear = useStore((s) => s.clearAttemptResult);
  const abandon = useStore((s) => s.abandonAttempt);
  const startAttempt = useStore((s) => s.startAttempt);
  const askTutor = useStore((s) => s.askTutor);
  const [explaining, setExplaining] = useState(false);
  const result = attempt.result!;
  const ev = result.evaluation;

  return (
    <div className="flex h-full flex-col overflow-y-auto p-3">
      {/* headline */}
      <div className={`animate-pop-in rounded-xl border p-4 text-center ${ev.passed ? 'border-[var(--color-flux-dim)] bg-[color-mix(in_oklab,var(--color-flux)_8%,transparent)]' : 'border-[var(--color-breach-dim)] bg-[color-mix(in_oklab,var(--color-breach)_8%,transparent)]'}`}>
        <div className={`mx-auto mb-2 grid h-12 w-12 place-items-center rounded-full ${ev.passed ? 'bg-[color-mix(in_oklab,var(--color-flux)_18%,transparent)] text-[var(--color-flux)] pulse-ring' : 'bg-[color-mix(in_oklab,var(--color-breach)_18%,transparent)] text-[var(--color-breach)]'}`}>
          {ev.passed ? <Icon.trophy size={24} /> : <Icon.x size={22} />}
        </div>
        <div className="text-[15px] font-bold tracking-wide text-[var(--color-ink-100)]">
          {ev.passed ? 'MISSION COMPLETE' : 'MISSIONE NON SUPERATA'}
        </div>
        <div className="mono mt-1 text-[26px] font-bold" style={{ color: ev.passed ? 'var(--color-flux)' : 'var(--color-breach)' }}>
          {ev.score}<span className="text-[15px] text-[var(--color-ink-500)]">/100</span>
        </div>
        {ev.passed && <div className="mt-1 text-[12px] text-[var(--color-amber)]">+{ev.xpAwarded} XP</div>}
        {ev.failureReason && <div className="mt-1 text-[11.5px] text-[var(--color-ink-400)]">{ev.failureReason}</div>}
      </div>

      {/* criteria */}
      <div className="mt-3 space-y-1">
        {ev.criteria.map((c) => (
          <div key={c.id} className="flex items-start gap-2 rounded-lg border border-[var(--color-line)] px-2.5 py-1.5 text-[12px]">
            {c.passed ? <Icon.check size={14} className="mt-0.5 text-[var(--color-flux)]" /> : <Icon.x size={13} className="mt-0.5 text-[var(--color-ink-500)]" />}
            <div className="flex-1">
              <span className={c.passed ? 'text-[var(--color-ink-200)]' : 'text-[var(--color-ink-400)]'}>{c.label}</span>
              {!c.passed && c.feedback && <div className="mt-0.5 text-[11px] text-[var(--color-ink-500)]">{c.feedback}</div>}
            </div>
            {c.required && !c.passed && <span className="chip !border-[var(--color-breach-dim)] !text-[9.5px] !text-[var(--color-breach)]">richiesto</span>}
          </div>
        ))}
      </div>

      {/* mastery deltas */}
      {result.masteryDeltas.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-500)]">Mastery aggiornata</div>
          <div className="space-y-1.5">
            {result.masteryDeltas.map((d) => (
              <MasteryDelta key={d.skillId} skillId={d.skillId} before={d.before} after={d.after} />
            ))}
          </div>
        </div>
      )}

      {/* evidence */}
      {ev.evidence.length > 0 && (
        <details className="mt-3 text-[11.5px]">
          <summary className="cursor-pointer text-[var(--color-ink-500)] hover:text-[var(--color-ink-300)]">Prove raccolte ({ev.evidence.length})</summary>
          <div className="mono mt-1.5 space-y-0.5">
            {ev.evidence.slice(0, 10).map((e, i) => (
              <div key={i} className="text-[var(--color-ink-400)]">#{e.seq >= 0 ? e.seq : '·'} {e.summary}</div>
            ))}
          </div>
        </details>
      )}

      {/* actions */}
      <div className="mt-4 flex gap-2">
        <button
          className="btn flex-1 justify-center"
          onClick={() => { setExplaining(true); void askTutor(undefined, 'explain'); }}
          disabled={explaining}
        >
          <Icon.lightbulb size={14} /> {ev.passed ? 'Perché ha funzionato?' : 'Aiutami a capire'}
        </button>
        {ev.passed ? (
          <button className="btn btn-ghost !px-3" onClick={clear} title="Chiudi">
            <Icon.check size={14} />
          </button>
        ) : (
          <button className="btn btn-primary flex-1 justify-center" onClick={() => startAttempt(attempt.exercise)}>
            <Icon.refresh size={14} /> Riprova
          </button>
        )}
      </div>

      <button
        className="btn btn-ghost mt-2 w-full justify-center !py-1.5 text-[11.5px] text-[var(--color-ink-400)]"
        onClick={() => void abandon()}
      >
        <Icon.arrowLeft size={13} /> Torna alle missioni
      </button>
    </div>
  );
}

function MasteryDelta({ skillId, before, after }: { skillId: string; before: number; after: number }) {
  const up = after >= before;
  return (
    <div className="flex items-center gap-2">
      <span className="mono w-28 shrink-0 truncate text-[11.5px] text-[var(--color-ink-300)]">{skillId}</span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-abyss-600)]">
        <div className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-line-strong)]" style={{ width: `${before * 100}%` }} />
        <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-700" style={{ width: `${after * 100}%`, background: up ? 'var(--color-flux)' : 'var(--color-amber)' }} />
      </div>
      <span className="mono w-14 shrink-0 text-right text-[11px]" style={{ color: up ? 'var(--color-flux)' : 'var(--color-amber)' }}>
        {up ? '+' : ''}{Math.round((after - before) * 100)}%
      </span>
    </div>
  );
}
