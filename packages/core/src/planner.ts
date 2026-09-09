import type { Checkpoint, LessonSummary, Module } from './curriculum.js';
import type { LessonId, ModuleId, SkillId } from './ids.js';
import { deriveMastery } from './mastery.js';
import type { LessonState, UserProgress } from './progress.js';
import type { SkillDimension, SkillMastery } from './skill.js';

/**
 * The adaptive planner.
 *
 * Two jobs, kept separate on purpose:
 *
 *  1. **Gating** — deciding what the learner is allowed to open. Deterministic,
 *     conservative, and never surprising.
 *  2. **Recommending** — deciding what they *should* do next. Opinionated, and
 *     allowed to interrupt the linear path when the evidence says the
 *     foundations are shaky.
 *
 * The gate never traps anyone: `canEnterLesson` always reports a way forward,
 * and the tutor is expected to offer the alternative route it returns.
 */

export interface PlannerInput {
  lessons: readonly LessonSummary[];
  modules: readonly Module[];
  progress: UserProgress;
  /** Most recent attempts first. */
  recentAttempts?: readonly AttemptSummary[];
  now?: number;
}

export interface AttemptSummary {
  exerciseId: string;
  lessonId: LessonId;
  skillIds: SkillId[];
  passed: boolean;
  score: number;
  at: number;
}

export interface EntryDecision {
  allowed: boolean;
  state: LessonState;
  /** Human-readable, shown in the roadmap tooltip and used by the tutor. */
  reasons: string[];
  missingPrerequisites: LessonId[];
  /** Something the learner can do right now to unlock this. */
  suggestion?: { kind: 'lesson'; lessonId: LessonId } | { kind: 'practice'; skillId: SkillId };
}

/** Minimum mastery in a lesson's own skills before it counts as `mastered`. */
export const MASTERY_BAR = 0.72;
/** Below this on a prerequisite skill the planner will interrupt with remediation. */
export const REMEDIATION_BAR = 0.45;

export function masteriesFor(progress: UserProgress, now = Date.now()): Map<SkillId, SkillMastery> {
  const map = new Map<SkillId, SkillMastery>();
  for (const [skillId, evidence] of Object.entries(progress.evidence)) {
    map.set(skillId, deriveMastery(skillId, evidence, now));
  }
  return map;
}

export function canEnterLesson(lessonId: LessonId, input: PlannerInput): EntryDecision {
  const lesson = input.lessons.find((l) => l.id === lessonId);
  if (!lesson) {
    return { allowed: false, state: 'locked', reasons: ['Unknown lesson.'], missingPrerequisites: [] };
  }
  if (lesson.status === 'planned') {
    return {
      allowed: false,
      state: 'locked',
      reasons: ['This lesson is on the roadmap but not built yet.'],
      missingPrerequisites: [],
    };
  }

  const missing = lesson.prerequisites.filter((id) => {
    const p = input.progress.lessons[id];
    return !p || (p.state !== 'completed' && p.state !== 'mastered');
  });

  const existing = input.progress.lessons[lessonId];
  const reasons: string[] = [];
  if (missing.length > 0) {
    const titles = missing.map((id) => input.lessons.find((l) => l.id === id)?.title ?? id);
    reasons.push(`Complete first: ${titles.join(', ')}.`);
  }

  const allowed = missing.length === 0;
  const state: LessonState = allowed
    ? (existing?.state ?? 'available')
    : 'locked';

  const first = missing[0];
  return {
    allowed,
    state,
    reasons,
    missingPrerequisites: missing,
    ...(first ? { suggestion: { kind: 'lesson' as const, lessonId: first } } : {}),
  };
}

export function computeLessonStates(input: PlannerInput): Record<LessonId, LessonState> {
  const now = input.now ?? Date.now();
  const masteries = masteriesFor(input.progress, now);
  const out: Record<LessonId, LessonState> = {};

  for (const lesson of input.lessons) {
    const stored = input.progress.lessons[lesson.id];
    const decision = canEnterLesson(lesson.id, input);

    if (!decision.allowed) {
      out[lesson.id] = 'locked';
      continue;
    }
    if (!stored) {
      out[lesson.id] = 'available';
      continue;
    }
    if (stored.state === 'completed') {
      const mastered = lesson.skills.every((s) => (masteries.get(s)?.overall ?? 0) >= MASTERY_BAR);
      out[lesson.id] = mastered ? 'mastered' : 'completed';
      continue;
    }
    out[lesson.id] = stored.state;
  }
  return out;
}

// ── Recommendations ────────────────────────────────────────────────────────

export type RecommendationKind =
  | 'continue'
  | 'remediate'
  | 'review'
  | 'challenge'
  | 'checkpoint'
  | 'start';

export interface Recommendation {
  kind: RecommendationKind;
  /** Ranked; the UI surfaces the first, the tutor may mention the rest. */
  priority: number;
  title: string;
  /** Written in the tutor's voice, shown verbatim if no AI provider is live. */
  rationale: string;
  lessonId?: LessonId;
  moduleId?: ModuleId;
  skillId?: SkillId;
  dimension?: SkillDimension;
  exerciseId?: string;
}

export function recommendNext(input: PlannerInput): Recommendation[] {
  const now = input.now ?? Date.now();
  const masteries = masteriesFor(input.progress, now);
  const states = computeLessonStates(input);
  const out: Recommendation[] = [];

  // 1. Repeated failure on a skill outranks everything else. This is the
  //    "before you continue with UNION-based SQLi" interrupt from the spec.
  const struggles = detectStruggles(input.recentAttempts ?? []);
  for (const struggle of struggles) {
    const mastery = masteries.get(struggle.skillId);
    out.push({
      kind: 'remediate',
      priority: 100 - Math.round((mastery?.overall ?? 0) * 20),
      title: `Shore up ${struggle.skillId}`,
      rationale: `You have missed ${struggle.failures} attempts in a row that lean on ${struggle.skillId}. A short review now will cost less than pushing on.`,
      skillId: struggle.skillId,
      ...(struggle.lessonId ? { lessonId: struggle.lessonId } : {}),
    });
  }

  // 2. Weak prerequisite skills for the lesson the learner is about to open.
  const inProgress = input.lessons.find((l) => states[l.id] === 'in-progress');
  const nextUp = inProgress ?? input.lessons.find((l) => states[l.id] === 'available');
  if (nextUp) {
    const weakPrereq = nextUp.skills
      .map((s) => masteries.get(s))
      .filter((m): m is SkillMastery => Boolean(m))
      .filter((m) => m.observations >= 2 && m.overall < REMEDIATION_BAR)
      .sort((a, b) => a.overall - b.overall)[0];

    if (weakPrereq) {
      out.push({
        kind: 'review',
        priority: 80,
        title: `Refresh ${weakPrereq.skillId} first`,
        rationale: `${nextUp.title} leans on ${weakPrereq.skillId}, and your evidence there is thin (${Math.round(weakPrereq.overall * 100)}%). Ten minutes of review will make the lab land.`,
        skillId: weakPrereq.skillId,
        lessonId: nextUp.id,
      });
    }

    out.push({
      kind: inProgress ? 'continue' : states[nextUp.id] === 'available' && !input.progress.lessons[nextUp.id] ? 'start' : 'continue',
      priority: 60,
      title: inProgress ? `Continue ${nextUp.title}` : `Start ${nextUp.title}`,
      rationale: inProgress
        ? 'You left this one open. Finishing it keeps the thread intact.'
        : 'This is the next step on your path, and the prerequisites are cleared.',
      lessonId: nextUp.id,
    });
  }

  // 3. A checkpoint the learner now qualifies for.
  for (const module of input.modules) {
    if (!module.checkpoint) continue;
    if (!module.lessons.every((id) => states[id] === 'completed' || states[id] === 'mastered')) continue;
    if (checkpointPassed(module.checkpoint, masteries)) continue;
    out.push({
      kind: 'checkpoint',
      priority: 90,
      title: module.checkpoint.title,
      rationale: `You have finished every lesson in ${module.title}. The checkpoint is the honest test of whether it stuck.`,
      moduleId: module.id,
      ...(module.checkpoint.exerciseId ? { exerciseId: module.checkpoint.exerciseId } : {}),
    });
  }

  // 4. Spaced repetition: strong-but-stale skills.
  const stale = [...masteries.values()]
    .filter((m) => m.observations >= 3 && m.overall >= 0.7 && m.confidence.exploitation < 0.55)
    .slice(0, 1);
  for (const m of stale) {
    out.push({
      kind: 'challenge',
      priority: 40,
      title: `Challenge: ${m.skillId}`,
      rationale: `Your ${m.skillId} theory is solid but you have not proved it under pressure recently. Want a harder variant?`,
      skillId: m.skillId,
      dimension: 'exploitation',
    });
  }

  return out.sort((a, b) => b.priority - a.priority);
}

export interface StruggleSignal {
  skillId: SkillId;
  failures: number;
  lessonId?: LessonId;
}

/**
 * Three consecutive failed attempts touching the same skill is the trigger.
 * Two is noise; four is too late to be useful.
 */
export function detectStruggles(
  attempts: readonly AttemptSummary[],
  threshold = 3,
): StruggleSignal[] {
  const streaks = new Map<SkillId, { failures: number; broken: boolean; lessonId?: LessonId }>();
  for (const attempt of attempts) {
    for (const skillId of attempt.skillIds) {
      const entry = streaks.get(skillId) ?? { failures: 0, broken: false };
      if (entry.broken) continue;
      if (attempt.passed) {
        entry.broken = true;
      } else {
        entry.failures += 1;
        entry.lessonId = attempt.lessonId;
      }
      streaks.set(skillId, entry);
    }
  }
  return [...streaks.entries()]
    .filter(([, v]) => v.failures >= threshold)
    .map(([skillId, v]) => ({
      skillId,
      failures: v.failures,
      ...(v.lessonId ? { lessonId: v.lessonId } : {}),
    }))
    .sort((a, b) => b.failures - a.failures);
}

export function checkpointPassed(
  checkpoint: Checkpoint,
  masteries: ReadonlyMap<SkillId, SkillMastery>,
): boolean {
  return checkpoint.requirements.every((req) => {
    const m = masteries.get(req.skillId);
    return (m?.dimensions[req.dimension] ?? 0) >= req.min;
  });
}

export interface CheckpointStatus {
  checkpointId: string;
  passed: boolean;
  requirements: {
    skillId: SkillId;
    dimension: SkillDimension;
    required: number;
    actual: number;
    met: boolean;
  }[];
}

export function checkpointStatus(
  checkpoint: Checkpoint,
  masteries: ReadonlyMap<SkillId, SkillMastery>,
): CheckpointStatus {
  const requirements = checkpoint.requirements.map((req) => {
    const actual = masteries.get(req.skillId)?.dimensions[req.dimension] ?? 0;
    return {
      skillId: req.skillId,
      dimension: req.dimension,
      required: req.min,
      actual,
      met: actual >= req.min,
    };
  });
  return {
    checkpointId: checkpoint.id,
    passed: requirements.every((r) => r.met),
    requirements,
  };
}
