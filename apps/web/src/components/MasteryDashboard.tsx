import { useState } from 'react';
import { SKILL_DIMENSION_LABELS, SKILL_DIMENSIONS, type MasteryBand, type SkillMastery } from '@cyberlab/core';
import { useStore } from '../store.js';
import { Icon } from '../icons.js';

/**
 * The mastery panel.
 *
 * The brief is emphatic that the headline metric is demonstrated competence, not
 * points. So this is the home of the four-dimension model: for each skill the
 * learner has touched, the theory / recognition / exploitation / mitigation
 * bars, an honest band, and the recommendations the adaptive planner produced —
 * including the "before you continue, review X" interrupts.
 */
export function MasteryDashboard() {
  const progress = useStore((s) => s.progress);
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!progress) return null;

  const touched = progress.masteries.filter((m) => m.observations > 0).sort((a, b) => b.overall - a.overall);
  const recs = progress.recommendations.slice(0, 3);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--color-line)] px-3 pb-2 pt-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-500)]">Competenze</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {recs.length > 0 && (
          <div className="mb-4 space-y-2">
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--color-ink-500)]">Consigliato ora</div>
            {recs.map((r, i) => (
              <Recommendation key={i} kind={r.kind} title={r.title} rationale={r.rationale} lessonId={r.lessonId} />
            ))}
          </div>
        )}

        {touched.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--color-line-strong)] p-4 text-center text-[12px] text-[var(--color-ink-500)]">
            Nessuna competenza ancora misurata. Completa un esercizio e le tue skill compariranno qui — con quattro dimensioni, non un numero solo.
          </div>
        ) : (
          <div className="space-y-1.5">
            {touched.map((m) => (
              <SkillRow key={m.skillId} mastery={m} expanded={expanded === m.skillId} onToggle={() => setExpanded(expanded === m.skillId ? null : m.skillId)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SkillRow({ mastery, expanded, onToggle }: { mastery: SkillMastery; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-abyss-800)]">
      <button onClick={onToggle} className="flex w-full items-center gap-2.5 px-3 py-2">
        <span className="flex-1 text-left text-[12.5px] font-medium text-[var(--color-ink-200)]">{mastery.skillId}</span>
        <BandChip band={mastery.band} />
        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--color-abyss-600)]">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${mastery.overall * 100}%`, background: bandColor(mastery.band) }} />
        </div>
        <span className="mono w-8 text-right text-[11px] text-[var(--color-ink-400)]">{Math.round(mastery.overall * 100)}</span>
        <span className="text-[var(--color-ink-500)]" style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
          <Icon.chevronRight size={13} />
        </span>
      </button>
      {expanded && (
        <div className="animate-fade-in space-y-1.5 border-t border-[var(--color-line)] px-3 py-2.5">
          {SKILL_DIMENSIONS.map((dim) => (
            <div key={dim} className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-[11px] text-[var(--color-ink-400)]">{SKILL_DIMENSION_LABELS[dim]}</span>
              <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-abyss-600)]">
                <div className="h-full rounded-full" style={{ width: `${mastery.dimensions[dim] * 100}%`, background: 'var(--color-signal)', opacity: 0.3 + mastery.confidence[dim] * 0.7 }} />
              </div>
              <span className="mono w-7 text-right text-[10.5px] text-[var(--color-ink-500)]">{Math.round(mastery.dimensions[dim] * 100)}</span>
            </div>
          ))}
          <div className="pt-1 text-[10px] text-[var(--color-ink-500)]">
            L’opacità della barra riflette la confidenza (quante prove la sostengono).
          </div>
        </div>
      )}
    </div>
  );
}

function BandChip({ band }: { band: MasteryBand }) {
  const labels: Record<MasteryBand, string> = {
    unknown: '—', novice: 'Novice', beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced', expert: 'Expert',
  };
  return (
    <span className="chip !py-0 !text-[9.5px]" style={{ borderColor: `color-mix(in oklab, ${bandColor(band)} 40%, transparent)`, color: bandColor(band) }}>
      {labels[band]}
    </span>
  );
}

function bandColor(band: MasteryBand): string {
  switch (band) {
    case 'expert': return 'var(--color-flux)';
    case 'advanced': return 'var(--color-signal)';
    case 'intermediate': return 'var(--color-signal)';
    case 'beginner': return 'var(--color-amber)';
    default: return 'var(--color-ink-500)';
  }
}

function Recommendation({ kind, title, rationale, lessonId }: { kind: string; title: string; rationale: string; lessonId?: string }) {
  const openLesson = useStore((s) => s.openLesson);
  const color: Record<string, string> = {
    remediate: 'var(--color-breach)', review: 'var(--color-amber)', continue: 'var(--color-signal)',
    start: 'var(--color-signal)', challenge: 'var(--color-violet)', checkpoint: 'var(--color-flux)',
  };
  const icon: Record<string, keyof typeof Icon> = {
    remediate: 'flame', review: 'refresh', continue: 'arrowRight', start: 'play', challenge: 'zap', checkpoint: 'trophy',
  };
  const IconCmp = Icon[icon[kind] ?? 'arrowRight'];
  return (
    <button
      onClick={() => lessonId && openLesson(lessonId)}
      disabled={!lessonId}
      className="w-full rounded-lg border-l-2 bg-[var(--color-abyss-800)] p-2.5 text-left transition-colors hover:bg-[var(--color-abyss-700)] disabled:cursor-default"
      style={{ borderLeftColor: color[kind] ?? 'var(--color-signal)' }}
    >
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--color-ink-100)]">
        <span style={{ color: color[kind] }}><IconCmp size={12} /></span> {title}
      </div>
      <div className="mt-0.5 text-[11px] leading-snug text-[var(--color-ink-400)]">{rationale}</div>
    </button>
  );
}
