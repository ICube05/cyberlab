import {
  bumpStreak,
  canEnterLesson,
  computeLessonStates,
  deriveMastery,
  emptyLessonProgress,
  emptySkillEvidence,
  levelForXp,
  levelProgress,
  observeMany,
  recommendNext,
  toLessonSummary,
  XP_AWARDS,
  type Attempt,
  type EvaluationResult,
  type Exercise,
  type LessonState,
  type ProgressResponse,
  type SkillMastery,
  type UserProgress,
} from '@cyberlab/core';
import {
  CONTENT_GRAPH,
  LESSONS,
  MODULES,
  getExercise,
  getLesson,
  levelIdForLesson,
} from '@cyberlab/curriculum';
import type { Store } from './store.js';
import { BADGES } from './badges.js';

/**
 * The progress engine.
 *
 * This is where an evaluation becomes durable state: mastery evidence is
 * updated, XP and streaks move, badges are checked, and — because mastery
 * changed — lesson unlocks are recomputed. Everything it needs from the domain
 * lives in @cyberlab/core as pure functions; this class only wires them to the
 * store and the content graph.
 */
export class ProgressService {
  constructor(private readonly store: Store) {}

  get(userId: string): UserProgress {
    return this.store.getProgress(userId);
  }

  masteries(progress: UserProgress, now = Date.now()): SkillMastery[] {
    // Every skill in the graph appears, so the dashboard can show untouched
    // skills as "unknown" rather than hiding them.
    return CONTENT_GRAPH.skills.map((skill) => {
      const evidence = progress.evidence[skill.id];
      return evidence
        ? deriveMastery(skill.id, evidence, now)
        : deriveMastery(skill.id, emptySkillEvidence(now), now);
    });
  }

  response(userId: string): ProgressResponse {
    const progress = this.store.getProgress(userId);
    return this.buildResponse(progress);
  }

  buildResponse(progress: UserProgress): ProgressResponse {
    const masteries = this.masteries(progress);
    const lessonSummaries = LESSONS.map((l) => toLessonSummary(l, levelIdForLesson(l.id) ?? ''));
    const attempts = this.store.recentAttempts(progress.userId, 20);
    const lessonStates = computeLessonStates({ lessons: lessonSummaries, modules: MODULES, progress });
    const recommendations = recommendNext({
      lessons: lessonSummaries,
      modules: MODULES,
      progress,
      recentAttempts: attempts
        .filter((a) => a.evaluation)
        .map((a) => ({
          exerciseId: a.exerciseId,
          lessonId: getExercise(a.exerciseId)?.lessonId ?? '',
          skillIds: getExercise(a.exerciseId)?.skills.map((s) => s.skillId) ?? [],
          passed: a.evaluation!.passed,
          score: a.evaluation!.score,
          at: a.finishedAt ?? a.startedAt,
        })),
    });

    return {
      progress,
      level: levelProgressOf(progress.xp),
      masteries,
      recommendations,
      lessonStates,
    };
  }

  /** Mark that a learner has seen content blocks (drives lesson start + XP). */
  markBlocksSeen(userId: string, lessonId: string, blockIds: string[], timeSpentMs = 0): UserProgress {
    const progress = this.store.getProgress(userId);
    const lesson = ensureLessonProgress(progress, lessonId);
    let firstView = lesson.blocksSeen.length === 0;
    const set = new Set(lesson.blocksSeen);
    for (const id of blockIds) set.add(id);
    lesson.blocksSeen = [...set];
    lesson.timeSpentMs += Math.min(timeSpentMs, 600_000);
    if (lesson.state === 'available' || lesson.state === 'locked') {
      lesson.state = 'in-progress';
      lesson.startedAt ??= Date.now();
    }
    if (firstView) awardXp(progress, XP_AWARDS.lessonTheory);
    maybeCompleteTheoryLesson(progress, lessonId);
    touchStreak(progress);
    this.store.saveProgress(progress);
    return progress;
  }

  recordQuiz(userId: string, lessonId: string, blockId: string, correct: boolean, selected: string[] = []): UserProgress {
    const progress = this.store.getProgress(userId);
    const lesson = ensureLessonProgress(progress, lessonId);
    const prior = lesson.quiz[blockId];
    lesson.quiz[blockId] = {
      correct: correct || (prior?.correct ?? false),
      answeredAt: Date.now(),
      attempts: (prior?.attempts ?? 0) + 1,
      selected,
    };
    if (correct && !prior?.correct) {
      awardXp(progress, prior ? XP_AWARDS.quizCorrectRetry : XP_AWARDS.quizCorrect);
      // Inline quizzes feed the recognition dimension of the lesson's skills.
      const lessonDef = getLesson(lessonId);
      if (lessonDef) {
        const now = Date.now();
        for (const skillId of lessonDef.skills.slice(0, 2)) {
          progress.evidence[skillId] = observeMany(
            progress.evidence[skillId] ?? emptySkillEvidence(now),
            [{ dimension: 'recognition', score: 1, weight: 0.5 }],
            now,
          );
        }
      }
    }
    maybeCompleteTheoryLesson(progress, lessonId);
    touchStreak(progress);
    this.store.saveProgress(progress);
    return progress;
  }

  /**
   * The core transition: apply a graded attempt. Returns the new response plus
   * the deltas the UI animates.
   */
  applyEvaluation(
    userId: string,
    exercise: Exercise,
    evaluation: EvaluationResult,
    attempt: Attempt,
  ): {
    response: ProgressResponse;
    masteryDeltas: { skillId: string; before: number; after: number }[];
    unlockedLessons: string[];
    newBadges: string[];
  } {
    const progress = this.store.getProgress(userId);
    const now = Date.now();

    const beforeMastery = new Map(this.masteries(progress, now).map((m) => [m.skillId, m.overall]));
    const beforeStates = computeLessonStatesFor(progress);

    // 1. Mastery: apply every observation to its skill.
    evaluation.observations.forEach((obs, i) => {
      const skillId = evaluation.observationSkills[i]!;
      progress.evidence[skillId] = observeMany(progress.evidence[skillId] ?? emptySkillEvidence(now), [obs], now);
    });

    // 2. XP.
    awardXp(progress, evaluation.xpAwarded);

    // 3. Lesson/exercise progress.
    const lesson = ensureLessonProgress(progress, exercise.lessonId);
    const prior = lesson.exercises[exercise.id];
    lesson.exercises[exercise.id] = {
      exerciseId: exercise.id,
      attempts: (prior?.attempts ?? 0) + 1,
      passed: evaluation.passed || (prior?.passed ?? false),
      bestScore: Math.max(prior?.bestScore ?? 0, evaluation.score),
      lastScore: evaluation.score,
      lastAttemptAt: now,
      hintsUsedTotal: (prior?.hintsUsedTotal ?? 0) + attempt.hintsUsed.length,
    };

    // 4. Lesson completion: all *authored* exercises for the lesson passed.
    const lessonDef = getLesson(exercise.lessonId);
    if (lessonDef) {
      const allPassed = lessonDef.exercises.every((id) => lesson.exercises[id]?.passed);
      if (allPassed && lesson.state !== 'completed' && lesson.state !== 'mastered') {
        lesson.state = 'completed';
        lesson.completedAt = now;
        awardXp(progress, XP_AWARDS.lessonComplete);
      } else if (lesson.state === 'available' || lesson.state === 'locked') {
        lesson.state = 'in-progress';
      }
    }

    // 5. Badges.
    const newBadges = grantBadges(progress, exercise, evaluation, attempt);

    touchStreak(progress);
    this.store.saveProgress(progress);

    // 6. Deltas.
    const afterMasteries = this.masteries(progress, now);
    const masteryDeltas = afterMasteries
      .map((m) => ({ skillId: m.skillId, before: beforeMastery.get(m.skillId) ?? 0, after: m.overall }))
      .filter((d) => Math.abs(d.after - d.before) > 0.005);

    const afterStates = computeLessonStatesFor(progress);
    const unlockedLessons = Object.entries(afterStates)
      .filter(([id, state]) => state !== 'locked' && beforeStates[id] === 'locked')
      .map(([id]) => id);

    return {
      response: this.buildResponse(progress),
      masteryDeltas,
      unlockedLessons,
      newBadges,
    };
  }

  canEnter(userId: string, lessonId: string): { allowed: boolean; reasons: string[]; state: LessonState } {
    const progress = this.store.getProgress(userId);
    const lessonSummaries = LESSONS.map((l) => toLessonSummary(l, levelIdForLesson(l.id) ?? ''));
    const decision = canEnterLesson(lessonId, { lessons: lessonSummaries, modules: MODULES, progress });
    return { allowed: decision.allowed, reasons: decision.reasons, state: decision.state };
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Complete a lesson that has no graded missions.
 *
 * A `theory-only` lesson can never pass "all its exercises", because it has
 * none — so without this it would sit at `in-progress` forever and every lesson
 * that lists it as a prerequisite would stay locked. Reading is the work here,
 * so the bar is the honest equivalent: every content block seen, and every
 * inline quiz answered (right or wrong — a wrong answer reveals the correct one
 * and still lets you move on). Lessons with missions are untouched; their
 * completion still comes from the graded path.
 */
function maybeCompleteTheoryLesson(progress: UserProgress, lessonId: string): boolean {
  const definition = getLesson(lessonId);
  if (!definition || definition.exercises.length > 0 || definition.status === 'planned') return false;

  const lesson = progress.lessons[lessonId];
  if (!lesson || lesson.state === 'completed' || lesson.state === 'mastered') return false;

  const blocks = [...definition.theory, ...(definition.practice ?? [])];
  if (blocks.length === 0) return false;

  const seen = new Set(lesson.blocksSeen);
  const allSeen = blocks.every((block) => seen.has(block.id));
  const quizzes = blocks.filter((block) => block.kind === 'quiz');
  // Answered, not necessarily correct: a wrong answer still shows the learner
  // the correct one (in the UI) and must not trap them — the lesson completes
  // and the next one unlocks. A correct answer still earns the XP and feeds the
  // recognition dimension in recordQuiz; that is where getting it right pays off.
  const allQuizzesAnswered = quizzes.every((quiz) => (lesson.quiz[quiz.id]?.attempts ?? 0) > 0);
  if (!allSeen || !allQuizzesAnswered) return false;

  lesson.state = 'completed';
  lesson.completedAt = Date.now();
  awardXp(progress, XP_AWARDS.lessonComplete);
  return true;
}

function ensureLessonProgress(progress: UserProgress, lessonId: string) {
  progress.lessons[lessonId] ??= emptyLessonProgress(lessonId, 'in-progress');
  return progress.lessons[lessonId]!;
}

function awardXp(progress: UserProgress, amount: number): void {
  progress.xp += Math.max(0, Math.round(amount));
  progress.level = levelForXp(progress.xp);
}

function touchStreak(progress: UserProgress): void {
  progress.streak = bumpStreak(progress.streak);
}

function computeLessonStatesFor(progress: UserProgress): Record<string, LessonState> {
  const lessonSummaries = LESSONS.map((l) => toLessonSummary(l, levelIdForLesson(l.id) ?? ''));
  return computeLessonStates({ lessons: lessonSummaries, modules: MODULES, progress });
}

function grantBadges(
  progress: UserProgress,
  exercise: Exercise,
  evaluation: EvaluationResult,
  attempt: Attempt,
): string[] {
  const earned: string[] = [];
  const grant = (id: string) => {
    if (!progress.badges.includes(id)) {
      progress.badges.push(id);
      earned.push(id);
    }
  };

  if (evaluation.passed) {
    grant('badge.first-blood');
    if (exercise.kind === 'mission' || exercise.kind === 'challenge') grant('badge.first-exploit');
    if (exercise.kind === 'fix') grant('badge.defender');
    if (evaluation.score === 100 && attempt.hintsUsed.length === 0) grant('badge.flawless');
  }
  if (progress.streak.current >= 3 || progress.streak.longest >= 3) grant('badge.streak-3');

  // Re-check predicate badges (idempotent).
  for (const badge of BADGES) {
    if (!progress.badges.includes(badge.id) && badge.earned(progress)) grant(badge.id);
  }
  return earned;
}

function levelProgressOf(xp: number) {
  return levelProgress(xp);
}
