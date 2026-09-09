import { useEffect } from 'react';
import { levelProgress } from '@cyberlab/core';
import { useStore } from '../store.js';
import { Icon } from '../icons.js';

/**
 * The window chrome: a top bar with identity, breadcrumb and the XP/level meter;
 * a bottom status bar with the honest system state (lab runtime, AI provider);
 * and the toast stack for the platform's feedback moments.
 */
export function TopBar() {
  const progress = useStore((s) => s.progress);
  const lesson = useStore((s) => s.lesson);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const toggleTutor = useStore((s) => s.toggleTutor);
  const toggleCommandPalette = useStore((s) => s.toggleCommandPalette);
  const xp = progress?.progress.xp ?? 0;
  const lp = levelProgress(xp);
  const streak = progress?.progress.streak.current ?? 0;

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--color-line)] bg-[var(--color-abyss-800)] px-2.5">
      <button className="btn btn-ghost !px-1.5 !py-1" onClick={() => toggleSidebar()} title="Roadmap (⌘B)">
        <Icon.sidebar size={16} />
      </button>
      <div className="flex items-center gap-1.5">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-[color-mix(in_oklab,var(--color-signal)_22%,transparent)] text-[var(--color-signal)]">
          <Icon.shield size={15} />
        </span>
        <span className="text-[13.5px] font-bold tracking-tight text-[var(--color-ink-100)]">CyberLab</span>
      </div>

      {/* breadcrumb */}
      <div className="ml-2 hidden items-center gap-1.5 text-[12px] text-[var(--color-ink-500)] md:flex">
        {lesson && (
          <>
            <Icon.chevronRight size={12} />
            <span className="text-[var(--color-ink-400)]">{lesson.moduleTitle}</span>
            <Icon.chevronRight size={12} />
            <span className="text-[var(--color-ink-200)]">{lesson.lesson.title}</span>
          </>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button className="btn btn-ghost !py-1 text-[11.5px] text-[var(--color-ink-400)]" onClick={() => toggleCommandPalette(true)} title="Command palette (⌘K)">
          <Icon.command size={13} /> <kbd className="!border-0 !bg-transparent !px-0">⌘K</kbd>
        </button>

        {streak > 0 && (
          <span className="chip !border-[color-mix(in_oklab,var(--color-amber)_40%,transparent)] !text-[var(--color-amber)]" title="Giorni consecutivi">
            <Icon.flame size={12} /> {streak}
          </span>
        )}

        {/* XP / level */}
        <div className="flex items-center gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-abyss-900)] px-2.5 py-1">
          <span className="mono grid h-5 w-5 place-items-center rounded-md bg-[color-mix(in_oklab,var(--color-signal)_20%,transparent)] text-[10.5px] font-bold text-[var(--color-signal)]">
            {lp.level}
          </span>
          <div className="hidden sm:block">
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--color-abyss-600)]">
              <div className="h-full rounded-full bg-[var(--color-signal)] transition-all duration-500" style={{ width: `${lp.ratio * 100}%` }} />
            </div>
          </div>
          <span className="mono text-[10.5px] text-[var(--color-ink-500)]">{lp.xpIntoLevel}/{lp.xpForNextLevel}</span>
        </div>

        <button className="btn btn-ghost !px-1.5 !py-1" onClick={() => toggleTutor()} title="Tutor">
          <Icon.sparkles size={16} className="text-[var(--color-violet)]" />
        </button>
      </div>
    </header>
  );
}

export function StatusBar() {
  const health = useStore((s) => s.health);
  const lab = useStore((s) => s.lab);
  const progress = useStore((s) => s.progress);
  const masteredCount = progress?.masteries.filter((m) => m.overall >= 0.72 && m.observations > 0).length ?? 0;

  return (
    <footer className="flex h-6 shrink-0 items-center gap-3 border-t border-[var(--color-line)] bg-[var(--color-abyss-800)] px-3 text-[10.5px] text-[var(--color-ink-500)]">
      <span className="flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-flux)]" /> online
      </span>
      {health && (
        <>
          <span title={health.labRuntime}>lab: <span className="text-[var(--color-ink-400)]">{health.labRuntime.split(' — ')[0]}</span></span>
          <span title={`model: ${health.aiModel}`}>
            ai: <span className={health.aiReachable && health.aiProvider !== 'offline' ? 'text-[var(--color-flux)]' : 'text-[var(--color-ink-400)]'}>{health.aiProvider}</span>
          </span>
          <span>{health.curriculum.ready}/{health.curriculum.lessons} lezioni live</span>
        </>
      )}
      {lab && <span className="mono">lab {lab.instanceId.slice(-6)} · {lab.eventCount} azioni</span>}
      <span className="ml-auto flex items-center gap-1">
        <Icon.star size={11} className="text-[var(--color-amber)]" /> {masteredCount} skill padroneggiate
      </span>
    </footer>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);

  const meta: Record<string, { icon: keyof typeof Icon; color: string }> = {
    info: { icon: 'info', color: 'var(--color-signal)' },
    success: { icon: 'checkCircle', color: 'var(--color-flux)' },
    warn: { icon: 'flame', color: 'var(--color-amber)' },
    error: { icon: 'x', color: 'var(--color-breach)' },
    xp: { icon: 'zap', color: 'var(--color-amber)' },
    badge: { icon: 'trophy', color: 'var(--color-violet)' },
    unlock: { icon: 'sparkles', color: 'var(--color-flux)' },
  };

  return (
    <div className="pointer-events-none fixed bottom-9 right-4 z-50 flex w-72 flex-col gap-2">
      {toasts.map((t) => {
        const m = meta[t.kind] ?? meta.info!;
        const IconCmp = Icon[m.icon];
        return (
          <div
            key={t.id}
            onClick={() => dismiss(t.id)}
            className="animate-slide-up pointer-events-auto flex cursor-pointer items-start gap-2.5 rounded-xl border border-[var(--color-line-strong)] bg-[var(--color-abyss-700)] p-3 shadow-xl"
            style={{ boxShadow: `0 8px 30px -10px rgba(0,0,0,0.7), inset 0 0 0 1px color-mix(in oklab, ${m.color} 20%, transparent)` }}
          >
            <span className="mt-0.5 shrink-0" style={{ color: m.color }}><IconCmp size={16} /></span>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-medium text-[var(--color-ink-100)]">{t.title}</div>
              {t.detail && <div className="mono truncate text-[11px] text-[var(--color-ink-400)]">{t.detail}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Keyboard shortcuts — the IDE feel. */
export function useKeyboardShortcuts() {
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const toggleTutor = useStore((s) => s.toggleTutor);
  const toggleCommandPalette = useStore((s) => s.toggleCommandPalette);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggleCommandPalette();
      } else if (mod && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebar();
      } else if (mod && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        toggleTutor();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleSidebar, toggleTutor, toggleCommandPalette]);
}
