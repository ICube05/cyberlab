import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store.js';
import { Icon } from '../icons.js';

/**
 * Command palette (⌘K).
 *
 * The IDE's fast lane: fuzzy-jump to any enterable lesson, invoke tutor modes,
 * reset the lab, toggle panels. Everything reachable without the mouse.
 */
interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: keyof typeof Icon;
  run: () => void;
  group: string;
}

export function CommandPalette() {
  const open = useStore((s) => s.commandPaletteOpen);
  const toggle = useStore((s) => s.toggleCommandPalette);
  const curriculum = useStore((s) => s.curriculum);
  const openLesson = useStore((s) => s.openLesson);
  const resetLab = useStore((s) => s.resetLab);
  const askTutor = useStore((s) => s.askTutor);
  const toggleTutor = useStore((s) => s.toggleTutor);
  const lab = useStore((s) => s.lab);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Command[]>(() => {
    const cmds: Command[] = [];
    for (const lesson of curriculum?.lessons ?? []) {
      const state = curriculum?.lessonStates[lesson.id];
      if (lesson.status === 'planned' || state === 'locked') continue;
      cmds.push({
        id: `lesson:${lesson.id}`,
        label: lesson.title,
        hint: lesson.status === 'ready' ? 'lezione · lab' : 'lezione',
        icon: lesson.hasLab ? 'flask' : 'book',
        group: 'Lezioni',
        run: () => openLesson(lesson.id),
      });
    }
    cmds.push(
      { id: 'tutor:teach', label: 'Tutor: spiega questo argomento', icon: 'book', group: 'Tutor', run: () => askTutor(undefined, 'teach') },
      { id: 'tutor:hint', label: 'Tutor: dammi un indizio', icon: 'compass', group: 'Tutor', run: () => askTutor(undefined, 'hint') },
      { id: 'tutor:review', label: 'Tutor: rivedi cosa ho fatto', icon: 'search', group: 'Tutor', run: () => askTutor(undefined, 'review') },
      { id: 'tutor:toggle', label: 'Mostra/nascondi il tutor', icon: 'sparkles', group: 'Vista', run: () => toggleTutor() },
    );
    if (lab) cmds.push({ id: 'lab:reset', label: 'Reset del laboratorio', icon: 'refresh', group: 'Lab', run: () => resetLab() });
    return cmds;
  }, [curriculum, lab, openLesson, askTutor, toggleTutor, resetLab]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands
      .map((c) => ({ c, score: fuzzy(q, c.label.toLowerCase()) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.c);
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);
  useEffect(() => setIndex(0), [query]);

  if (!open) return null;

  const run = (c: Command) => {
    c.run();
    toggle(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') toggle(false);
    else if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(filtered.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' && filtered[index]) run(filtered[index]);
  };

  let lastGroup = '';
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[12vh] backdrop-blur-sm" onClick={() => toggle(false)}>
      <div
        className="animate-pop-in w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--color-line-strong)] bg-[var(--color-abyss-800)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--color-line)] px-3.5 py-3">
          <Icon.search size={16} className="text-[var(--color-ink-500)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Cerca lezioni, comandi…"
            className="flex-1 !border-0 !bg-transparent !p-0 text-[14px] focus:!ring-0 focus:!shadow-none"
          />
          <kbd>esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5">
          {filtered.length === 0 && <div className="p-4 text-center text-[12.5px] text-[var(--color-ink-500)]">Nessun risultato.</div>}
          {filtered.map((c, i) => {
            const showGroup = c.group !== lastGroup;
            lastGroup = c.group;
            const IconCmp = Icon[c.icon];
            return (
              <div key={c.id}>
                {showGroup && <div className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-500)]">{c.group}</div>}
                <button
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => run(c)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] ${i === index ? 'bg-[var(--color-abyss-600)] text-[var(--color-ink-100)]' : 'text-[var(--color-ink-300)]'}`}
                >
                  <IconCmp size={14} className={i === index ? 'text-[var(--color-signal)]' : 'text-[var(--color-ink-500)]'} />
                  <span className="flex-1 truncate">{c.label}</span>
                  {c.hint && <span className="text-[10.5px] text-[var(--color-ink-500)]">{c.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Tiny subsequence fuzzy score. */
function fuzzy(needle: string, haystack: string): number {
  let score = 0;
  let hi = 0;
  for (const ch of needle) {
    const found = haystack.indexOf(ch, hi);
    if (found === -1) return 0;
    score += found === hi ? 2 : 1;
    hi = found + 1;
  }
  return score;
}
