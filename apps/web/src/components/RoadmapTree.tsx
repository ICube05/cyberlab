import { useMemo, useState } from 'react';
import type { LessonState, LessonStatus } from '@cyberlab/core';
import { useStore } from '../store.js';
import { Icon, LEVEL_ICONS } from '../icons.js';

/**
 * The roadmap, as an IDE file tree.
 *
 * Levels are folders, lessons are files. The whole eleven-level journey is
 * visible, but state is honest: locked lessons are dimmed and unclickable,
 * `planned` lessons carry a "soon" tag, and the lesson you can do next is
 * highlighted. Progress bars per level give the at-a-glance sense of a codebase
 * you are working through.
 */
export function RoadmapTree() {
  const curriculum = useStore((s) => s.curriculum);
  const activeLessonId = useStore((s) => s.activeLessonId);
  const openLesson = useStore((s) => s.openLesson);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const toggleOutline = useStore((s) => s.toggleOutline);

  const lessonStates = curriculum?.lessonStates ?? {};
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    // Fully folded if that is how the learner left it; otherwise everything
    // past level 1 starts collapsed to keep the tree scannable.
    const initial = new Set<string>();
    if (useStore.getState().outlineCollapsed) {
      for (const level of useStore.getState().curriculum?.levels ?? []) initial.add(level.id);
      return initial;
    }
    curriculumInitialCollapse(initial);
    return initial;
  });

  const byLevel = useMemo(() => {
    if (!curriculum) return [];
    return curriculum.levels
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((level) => {
        const modules = level.modules
          .map((id) => curriculum.modules.find((m) => m.id === id))
          .filter(Boolean) as NonNullable<(typeof curriculum.modules)[number]>[];
        const lessons = modules.flatMap((m) =>
          m.lessons.map((lid) => curriculum.lessons.find((l) => l.id === lid)).filter(Boolean),
        );
        const total = lessons.length;
        const done = lessons.filter((l) => {
          const st = lessonStates[l!.id];
          return st === 'completed' || st === 'mastered';
        }).length;
        return { level, modules, done, total };
      });
  }, [curriculum, lessonStates]);

  if (!curriculum) return <div className="p-4 text-[var(--color-ink-500)]">Caricamento roadmap…</div>;

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const allLevelIds = byLevel.map((b) => b.level.id);
  const everythingCollapsed = allLevelIds.length > 0 && allLevelIds.every((id) => collapsed.has(id));

  const foldAll = () => {
    const next = !everythingCollapsed;
    setCollapsed(next ? new Set(allLevelIds) : new Set());
    toggleOutline(next);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 px-3 pt-3 pb-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-500)]">
          Roadmap
        </span>
        <span className="chip">{curriculum.lessons.filter((l) => l.status === 'ready').length} live</span>
        <div className="ml-auto flex items-center gap-0.5">
          {/* Fold the whole outline in one click — the tree is 58 lessons deep. */}
          <button
            className="btn btn-ghost !px-1 !py-1"
            onClick={foldAll}
            title={everythingCollapsed ? 'Espandi tutti i livelli' : 'Comprimi tutti i livelli'}
          >
            {everythingCollapsed ? <Icon.chevronDown size={13} /> : <Icon.chevronUp size={13} />}
          </button>
          <button
            className="btn btn-ghost !px-1 !py-1"
            onClick={() => toggleSidebar(false)}
            title="Nascondi la scaletta (⌘B)"
          >
            <Icon.panelLeft size={13} />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-4">
        {byLevel.map(({ level, modules, done, total }) => {
          const levelCollapsed = collapsed.has(level.id);
          const IconCmp = Icon[LEVEL_ICONS[level.icon] ?? 'layers'];
          return (
            <div key={level.id} className="mb-0.5">
              <button
                onClick={() => toggle(level.id)}
                className="group flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left hover:bg-[var(--color-abyss-700)] focus-ring"
              >
                <span className="text-[var(--color-ink-500)] transition-transform" style={{ transform: levelCollapsed ? 'none' : 'rotate(90deg)' }}>
                  <Icon.chevronRight size={13} />
                </span>
                <span className="grid h-6 w-6 place-items-center rounded-md bg-[var(--color-abyss-600)] text-[var(--color-signal)]">
                  <IconCmp size={14} />
                </span>
                <span className="flex-1 truncate text-[12.5px] font-medium text-[var(--color-ink-200)]">
                  <span className="mono mr-1 text-[10px] text-[var(--color-ink-500)]">L{level.index}</span>
                  {level.title}
                </span>
                <span className="mono text-[10px] text-[var(--color-ink-500)]">
                  {done}/{total}
                </span>
              </button>
              {!levelCollapsed && (
                <div className="ml-3.5 border-l border-[var(--color-line)] pl-1.5">
                  {modules.map((module) => (
                    <div key={module.id} className="mt-0.5">
                      <div className="px-2 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--color-ink-500)]">
                        {module.title}
                      </div>
                      {module.lessons
                        .map((lid) => curriculum.lessons.find((l) => l.id === lid))
                        .filter(Boolean)
                        .map((lesson) => (
                          <LessonRow
                            key={lesson!.id}
                            id={lesson!.id}
                            title={lesson!.title}
                            status={lesson!.status}
                            state={lessonStates[lesson!.id] ?? 'locked'}
                            active={activeLessonId === lesson!.id}
                            hasLab={lesson!.hasLab}
                            onClick={() => openLesson(lesson!.id)}
                          />
                        ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LessonRow({
  id,
  title,
  status,
  state,
  active,
  hasLab,
  onClick,
}: {
  id: string;
  title: string;
  status: LessonStatus;
  state: LessonState;
  active: boolean;
  hasLab: boolean;
  onClick: () => void;
}) {
  const enterable = status !== 'planned' && state !== 'locked';

  return (
    <button
      onClick={enterable ? onClick : undefined}
      disabled={!enterable}
      title={status === 'planned' ? 'In arrivo — presente nella roadmap, non ancora interattiva' : state === 'locked' ? 'Bloccata: completa i prerequisiti' : title}
      className={[
        'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] focus-ring',
        active ? 'bg-[color-mix(in_oklab,var(--color-signal)_16%,transparent)] text-[var(--color-ink-100)]' : 'text-[var(--color-ink-300)]',
        enterable ? 'hover:bg-[var(--color-abyss-700)] cursor-pointer' : 'cursor-not-allowed opacity-55',
      ].join(' ')}
    >
      <StateGlyph state={state} status={status} />
      <span className="flex-1 truncate">{title}</span>
      {status === 'ready' && hasLab && (
        <span className="text-[var(--color-flux)]" title="Laboratorio interattivo">
          <Icon.flask size={13} />
        </span>
      )}
      {status === 'planned' && <span className="chip !border-[var(--color-line)] !px-1.5 !py-0 !text-[9.5px]">soon</span>}
      {state === 'mastered' && (
        <span className="text-[var(--color-amber)]" title="Padroneggiata">
          <Icon.star size={12} />
        </span>
      )}
      {active && <span className="h-3.5 w-0.5 rounded-full bg-[var(--color-signal)]" />}
      <span className="sr-only">{id}</span>
    </button>
  );
}

function StateGlyph({ state, status }: { state: LessonState; status: LessonStatus }) {
  if (status === 'planned') return <span className="text-[var(--color-ink-500)]"><Icon.circle size={13} /></span>;
  if (state === 'locked') return <span className="text-[var(--color-ink-500)]"><Icon.lock size={12} /></span>;
  if (state === 'completed' || state === 'mastered')
    return <span className="text-[var(--color-flux)]"><Icon.checkCircle size={14} /></span>;
  if (state === 'in-progress') return <span className="text-[var(--color-signal)]"><Icon.dot size={12} /></span>;
  return <span className="text-[var(--color-ink-400)]"><Icon.circle size={13} /></span>;
}

function curriculumInitialCollapse(set: Set<string>): void {
  // Levels 2..10 collapsed initially; foundations + web open.
  for (const id of ['lvl.recon', 'lvl.pentest', 'lvl.linux', 'lvl.windows', 'lvl.ad', 'lvl.reversing', 'lvl.malware', 'lvl.redteam', 'lvl.blueteam']) {
    set.add(id);
  }
}
