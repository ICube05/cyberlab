import { useEffect, useState } from 'react';
import { useStore } from './store.js';
import { Icon } from './icons.js';
import { Split } from './components/Split.js';
import { RoadmapTree } from './components/RoadmapTree.js';
import { MasteryDashboard } from './components/MasteryDashboard.js';
import { LessonView } from './components/LessonView.js';
import { LabPanel } from './components/LabPanel.js';
import { MissionPanel } from './components/MissionPanel.js';
import { TutorPanel } from './components/TutorPanel.js';
import { CommandPalette } from './components/CommandPalette.js';
import { StatusBar, Toasts, TopBar, useKeyboardShortcuts } from './components/Chrome.js';

/**
 * The application shell.
 *
 * An IDE layout: an activity rail and a roadmap/mastery sidebar on the left, the
 * lesson (theory) and the live lab + mission in the centre split, and the AI
 * tutor as a docked right panel. Panels are resizable and collapsible, so the
 * learner can go full-theory, full-lab, or anything between.
 */
export function App() {
  const boot = useStore((s) => s.boot);
  const booted = useStore((s) => s.booted);
  const bootError = useStore((s) => s.bootError);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const tutorOpen = useStore((s) => s.tutorPanelOpen);
  const lesson = useStore((s) => s.lesson);
  const [sidebarTab, setSidebarTab] = useState<'roadmap' | 'mastery'>('roadmap');

  useKeyboardShortcuts();
  useEffect(() => {
    void boot();
  }, [boot]);

  if (!booted) return <BootScreen />;
  if (bootError) return <BootError message={bootError} />;

  const hasLab = Boolean(lesson?.lab);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        {/* activity rail */}
        <nav className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-[var(--color-line)] bg-[var(--color-abyss-800)] py-2">
          <RailButton active={sidebarOpen && sidebarTab === 'roadmap'} icon="layers" label="Roadmap" onClick={() => { useStore.getState().toggleSidebar(true); setSidebarTab('roadmap'); }} />
          <RailButton active={sidebarOpen && sidebarTab === 'mastery'} icon="brain" label="Competenze" onClick={() => { useStore.getState().toggleSidebar(true); setSidebarTab('mastery'); }} />
        </nav>

        {/* sidebar */}
        {sidebarOpen && (
          <aside className="w-64 shrink-0 border-r border-[var(--color-line)] bg-[var(--color-abyss-900)]">
            {sidebarTab === 'roadmap' ? <RoadmapTree /> : <MasteryDashboard />}
          </aside>
        )}

        {/* main + tutor */}
        <main className="flex min-w-0 flex-1">
          <div className="min-w-0 flex-1">
            {hasLab ? (
              <Split
                storageKey="cyberlab.main-split"
                initial={46}
                min={28}
                max={64}
                a={<LessonView />}
                b={
                  <Split
                    direction="vertical"
                    storageKey="cyberlab.lab-split"
                    initial={62}
                    min={30}
                    max={80}
                    a={<LabPanel />}
                    b={<div className="h-full overflow-y-auto border-t border-[var(--color-line)] bg-[var(--color-abyss-800)]"><MissionPanel /></div>}
                  />
                }
              />
            ) : (
              <div className="flex h-full">
                <div className="min-w-0 flex-1"><LessonView /></div>
                {lesson && lesson.exercises.length > 0 && (
                  <div className="w-80 shrink-0 overflow-y-auto border-l border-[var(--color-line)] bg-[var(--color-abyss-800)]"><MissionPanel /></div>
                )}
              </div>
            )}
          </div>

          {tutorOpen && (
            <div className="w-[340px] shrink-0 border-l border-[var(--color-line)]">
              <TutorPanel />
            </div>
          )}
        </main>
      </div>
      <StatusBar />

      <CommandPalette />
      <Toasts />
    </div>
  );
}

function RailButton({ active, icon, label, onClick }: { active: boolean; icon: keyof typeof Icon; label: string; onClick: () => void }) {
  const IconCmp = Icon[icon];
  return (
    <button
      onClick={onClick}
      title={label}
      className={`group relative grid h-9 w-9 place-items-center rounded-lg transition-colors ${active ? 'bg-[var(--color-abyss-600)] text-[var(--color-signal)]' : 'text-[var(--color-ink-500)] hover:text-[var(--color-ink-200)]'}`}
    >
      <IconCmp size={19} />
      {active && <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-[var(--color-signal)]" />}
    </button>
  );
}

function BootScreen() {
  return (
    <div className="grid h-full place-items-center bg-[var(--color-abyss-900)]">
      <div className="text-center">
        <div className="mx-auto mb-4 grid h-16 w-16 animate-pulse place-items-center rounded-2xl border border-[var(--color-line)] bg-[var(--color-abyss-800)] text-[var(--color-signal)]">
          <Icon.shield size={30} />
        </div>
        <div className="text-[14px] font-semibold text-[var(--color-ink-200)]">CyberLab</div>
        <div className="mt-1 text-[12px] text-[var(--color-ink-500)]">Avvio dell’ambiente…</div>
      </div>
    </div>
  );
}

function BootError({ message }: { message: string }) {
  return (
    <div className="grid h-full place-items-center bg-[var(--color-abyss-900)] p-8">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-[var(--color-breach-dim)] bg-[var(--color-abyss-800)] text-[var(--color-breach)]">
          <Icon.x size={26} />
        </div>
        <h2 className="text-[16px] font-semibold text-[var(--color-ink-100)]">Impossibile raggiungere il server</h2>
        <p className="mono mt-2 text-[12px] text-[var(--color-ink-400)]">{message}</p>
        <p className="mt-3 text-[12px] text-[var(--color-ink-500)]">
          Assicurati che il backend sia in esecuzione (<span className="mono">pnpm dev</span>) e ricarica.
        </p>
        <button className="btn btn-primary mt-4" onClick={() => location.reload()}>
          <Icon.refresh size={14} /> Riprova
        </button>
      </div>
    </div>
  );
}
