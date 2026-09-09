import { useStore } from '../store.js';
import { BlockRenderer } from './blocks/index.js';
import { Icon } from '../icons.js';
import type { Difficulty } from '@cyberlab/core';

/**
 * What a theory lesson still needs to count as done.
 *
 * A lesson without missions completes when every block has been seen and every
 * inline quiz answered — a wrong answer counts, it just does not earn the XP.
 * That rule was invisible, so a learner who answered one quiz and stopped had
 * no way to know why the next lesson stayed locked. This says it plainly.
 */
function TheoryCompletion({ lesson }: { lesson: NonNullable<ReturnType<typeof useStore.getState>['lesson']> }) {
  const seen = useStore((s) => s.seenBlocks);
  const l = lesson.lesson;
  // `lesson.progress` is only filled by `openLesson`, so it goes stale the moment
  // you answer anything; the live progress is refetched after every answer. Read
  // that, and fall back to the lesson payload before the first fetch lands.
  const live = useStore((s) => s.progress?.progress.lessons[l.id]);
  const quizState = live?.quiz ?? lesson.progress?.quiz;
  const state = live?.state ?? lesson.progress?.state;

  const blocks = [...l.theory, ...(l.practice ?? [])];
  const quizzes = blocks.filter((b) => b.kind === 'quiz');
  const seenCount = blocks.filter((b) => seen.has(b.id)).length;
  const answered = quizzes.filter((q) => (quizState?.[q.id]?.attempts ?? 0) > 0).length;
  const done = state === 'completed' || state === 'mastered';

  if (done) {
    return (
      <div className="mt-8 flex items-center gap-2 rounded-xl border border-[var(--color-flux-dim)] bg-[color-mix(in_oklab,var(--color-flux)_8%,transparent)] p-4 text-[12.5px] text-[var(--color-ink-200)]">
        <Icon.checkCircle size={16} className="shrink-0 text-[var(--color-flux)]" />
        <span><span className="font-semibold text-[var(--color-flux)]">Lezione completata.</span> La lezione successiva è sbloccata.</span>
      </div>
    );
  }

  return (
    <div className="mt-8 rounded-xl border border-[var(--color-line)] p-4">
      <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-[var(--color-ink-400)]">Per completare la lezione</div>
      <ul className="space-y-1.5 text-[12.5px]">
        <li className="flex items-center gap-2">
          {seenCount >= blocks.length ? <Icon.checkCircle size={14} className="text-[var(--color-flux)]" /> : <Icon.circle size={13} className="text-[var(--color-ink-500)]" />}
          <span className={seenCount >= blocks.length ? 'text-[var(--color-ink-300)]' : 'text-[var(--color-ink-200)]'}>
            Scorri tutta la lezione — <span className="mono">{seenCount}/{blocks.length}</span> blocchi visti
          </span>
        </li>
        {quizzes.length > 0 && (
          <li className="flex items-center gap-2">
            {answered >= quizzes.length ? <Icon.checkCircle size={14} className="text-[var(--color-flux)]" /> : <Icon.circle size={13} className="text-[var(--color-ink-500)]" />}
            <span className={answered >= quizzes.length ? 'text-[var(--color-ink-300)]' : 'text-[var(--color-ink-200)]'}>
              Rispondi ai quiz — <span className="mono">{answered}/{quizzes.length}</span> risposti
            </span>
          </li>
        )}
      </ul>
      <p className="mt-2 text-[11.5px] text-[var(--color-ink-500)]">
        Una risposta sbagliata conta comunque: ti mostra quella corretta e non ti blocca. Azzeccarla dà XP e mastery.
      </p>
    </div>
  );
}

/**
 * The theory column.
 *
 * Renders the lesson header (title, "Lesson n / m", difficulty, time), then the
 * authored theory and interactive practice blocks. A `planned` lesson shows its
 * outline as an honest preview instead of pretending to have content.
 */
export function LessonView() {
  const lesson = useStore((s) => s.lesson);
  const loading = useStore((s) => s.lessonLoading);

  if (loading) return <LessonSkeleton />;
  if (!lesson) return <EmptyLesson />;

  const { lesson: l, position, moduleTitle } = lesson;
  const planned = l.status === 'planned';

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-6 pb-24">
        {/* header */}
        <div className="mb-5 animate-fade-in">
          <div className="mb-2 flex items-center gap-2 text-[11px] text-[var(--color-ink-500)]">
            <span className="uppercase tracking-wider">{moduleTitle}</span>
            <span>·</span>
            <span className="mono">Lesson {position.index} / {position.total}</span>
          </div>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-[var(--color-ink-100)]">{l.title}</h1>
          {l.subtitle && <p className="mt-1 text-[14px] text-[var(--color-ink-400)]">{l.subtitle}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <DifficultyChip difficulty={l.difficulty} />
            <span className="chip"><Icon.clock size={12} /> {l.estimatedMinutes} min</span>
            {l.status === 'ready' && <span className="chip !border-[var(--color-flux-dim)] !text-[var(--color-flux)]"><Icon.flask size={12} /> Lab interattivo</span>}
            {l.status === 'theory-only' && (
              <span className="chip" title="Teoria completa e blocchi interattivi; il laboratorio per questo argomento non c’è ancora">
                <Icon.book size={12} /> Teoria + interattivi
              </span>
            )}
            {l.skills.map((s) => (
              <span key={s} className="chip !text-[10.5px]">{s}</span>
            ))}
          </div>
        </div>

        {/* objectives */}
        {l.objectives.length > 0 && !planned && (
          <div className="mb-6 rounded-xl border border-[var(--color-line)] bg-[var(--color-abyss-800)] p-4 animate-fade-in">
            <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-[var(--color-ink-400)]">
              <Icon.target size={14} className="text-[var(--color-signal)]" /> Obiettivi
            </div>
            <ul className="space-y-1">
              {l.objectives.map((o, i) => (
                <li key={i} className="flex gap-2 text-[13px] text-[var(--color-ink-300)]">
                  <span className="mono text-[var(--color-ink-500)]">{String(i + 1).padStart(2, '0')}</span>
                  {o}
                </li>
              ))}
            </ul>
          </div>
        )}

        {planned ? (
          <PlannedPreview outline={l.outline ?? []} />
        ) : (
          <>
            <div className="lesson-prose">
              {l.theory.map((block) => (
                <BlockRenderer key={block.id} block={block} lessonId={l.id} />
              ))}
            </div>

            {l.practice && l.practice.length > 0 && (
              <div className="mt-8 border-t border-[var(--color-line)] pt-2">
                {l.practice.map((block) => (
                  <BlockRenderer key={block.id} block={block} lessonId={l.id} />
                ))}
              </div>
            )}

            {l.furtherReading && l.furtherReading.length > 0 && (
              <div className="mt-8 rounded-xl border border-[var(--color-line)] p-4">
                <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-[var(--color-ink-400)]">Approfondimenti</div>
                <ul className="space-y-1.5">
                  {l.furtherReading.map((r) => (
                    <li key={r.url} className="text-[12.5px]">
                      <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1">
                        {r.title} <Icon.arrowRight size={12} />
                      </a>
                      {r.note && <span className="ml-1 text-[var(--color-ink-500)]">— {r.note}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {l.status === 'theory-only' && <TheoryCompletion lesson={lesson} />}
          </>
        )}
      </div>
    </div>
  );
}

function PlannedPreview({ outline }: { outline: string[] }) {
  return (
    <div className="animate-fade-in rounded-xl border border-dashed border-[var(--color-line-strong)] bg-[var(--color-abyss-800)] p-5">
      <div className="mb-3 flex items-center gap-2 text-[13px] font-medium text-[var(--color-ink-300)]">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--color-abyss-600)] text-[var(--color-amber)]"><Icon.layers size={15} /></span>
        Lezione in arrivo
      </div>
      <p className="mb-4 text-[12.5px] text-[var(--color-ink-400)]">
        Questa lezione è già nella roadmap ma non ancora costruita come esperienza interattiva. Ecco cosa coprirà:
      </p>
      <ul className="space-y-1.5">
        {outline.map((point, i) => (
          <li key={i} className="flex gap-2 text-[13px] text-[var(--color-ink-300)]">
            <span className="mt-1 text-[var(--color-ink-500)]"><Icon.circle size={11} /></span>
            {point}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[11.5px] text-[var(--color-ink-500)]">
        L’architettura è la stessa delle lezioni interattive già disponibili — teoria come dati, un lab reale, esercizi valutati automaticamente.
      </p>
    </div>
  );
}

function DifficultyChip({ difficulty }: { difficulty: Difficulty }) {
  const map: Record<Difficulty, { label: string; color: string }> = {
    beginner: { label: 'Beginner', color: 'var(--color-flux)' },
    intermediate: { label: 'Intermediate', color: 'var(--color-signal)' },
    advanced: { label: 'Advanced', color: 'var(--color-amber)' },
    expert: { label: 'Expert', color: 'var(--color-breach)' },
  };
  const d = map[difficulty];
  return (
    <span className="chip" style={{ borderColor: `color-mix(in oklab, ${d.color} 40%, transparent)`, color: d.color }}>
      {d.label}
    </span>
  );
}

function EmptyLesson() {
  const curriculum = useStore((s) => s.curriculum);
  const openLesson = useStore((s) => s.openLesson);
  const ready = curriculum?.lessons.filter((l) => l.status === 'ready') ?? [];
  return (
    <div className="grid h-full place-items-center p-8">
      <div className="max-w-md text-center animate-fade-in">
        <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl border border-[var(--color-line)] bg-[var(--color-abyss-800)] text-[var(--color-signal)]">
          <Icon.shield size={30} />
        </div>
        <h2 className="text-[20px] font-semibold text-[var(--color-ink-100)]">Benvenuto in CyberLab</h2>
        <p className="mt-2 text-[13px] text-[var(--color-ink-400)]">
          Non stai leggendo un corso: stai per entrare in un laboratorio. Scegli una lezione interattiva per iniziare.
        </p>
        <div className="mt-5 space-y-2">
          {ready.map((l) => (
            <button
              key={l.id}
              onClick={() => openLesson(l.id)}
              className="panel flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:border-[var(--color-signal-dim)]"
            >
              <span className="text-[var(--color-flux)]"><Icon.flask size={18} /></span>
              <div className="flex-1">
                <div className="text-[13.5px] font-medium text-[var(--color-ink-100)]">{l.title}</div>
                <div className="text-[11.5px] text-[var(--color-ink-500)]">{l.subtitle}</div>
              </div>
              <Icon.arrowRight size={15} className="text-[var(--color-ink-500)]" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function LessonSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      <div className="h-6 w-40 animate-pulse rounded bg-[var(--color-abyss-700)]" />
      <div className="mt-4 h-9 w-3/4 animate-pulse rounded bg-[var(--color-abyss-700)]" />
      <div className="mt-6 space-y-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-4 animate-pulse rounded bg-[var(--color-abyss-800)]" style={{ width: `${90 - i * 6}%` }} />
        ))}
      </div>
    </div>
  );
}
