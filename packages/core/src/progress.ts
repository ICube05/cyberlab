import type { BadgeId, ExerciseId, LessonId, SkillId, UserId } from './ids.js';
import type { SkillEvidence } from './skill.js';

export type LessonState =
  | 'locked'
  | 'available'
  | 'in-progress'
  | 'completed'
  /** Completed *and* the skills it teaches are above the mastery bar. */
  | 'mastered';

export interface ExerciseResult {
  exerciseId: ExerciseId;
  attempts: number;
  passed: boolean;
  bestScore: number;
  lastScore: number;
  lastAttemptAt: number;
  hintsUsedTotal: number;
}

export interface LessonProgress {
  lessonId: LessonId;
  state: LessonState;
  startedAt?: number;
  completedAt?: number;
  /** Content blocks the learner has actually scrolled through. */
  blocksSeen: string[];
  /** Inline quiz outcomes, keyed by block id. `selected` is the last pick, so
   *  a reloaded lesson can show the wrong option in red and the right one in
   *  green — not just reveal the correct answer with no memory of what you chose. */
  quiz: Record<string, { correct: boolean; answeredAt: number; attempts: number; selected?: string[] }>;
  exercises: Record<ExerciseId, ExerciseResult>;
  /** Total time spent, milliseconds. */
  timeSpentMs: number;
}

export interface StreakState {
  current: number;
  longest: number;
  /** ISO date (YYYY-MM-DD) of the last day with recorded activity. */
  lastActiveDay: string | null;
}

export interface UserProgress {
  userId: UserId;
  xp: number;
  level: number;
  streak: StreakState;
  /** Raw Beta evidence per skill. Mastery is derived, never stored. */
  evidence: Record<SkillId, SkillEvidence>;
  lessons: Record<LessonId, LessonProgress>;
  badges: BadgeId[];
  createdAt: number;
  updatedAt: number;
}

export interface Badge {
  id: BadgeId;
  name: string;
  description: string;
  icon: string;
  /** Evaluated against progress after every attempt. */
  criteria: string;
}

export function emptyLessonProgress(lessonId: LessonId, state: LessonState = 'available'): LessonProgress {
  return {
    lessonId,
    state,
    blocksSeen: [],
    quiz: {},
    exercises: {},
    timeSpentMs: 0,
  };
}

export function emptyProgress(userId: UserId, now = Date.now()): UserProgress {
  return {
    userId,
    xp: 0,
    level: 1,
    streak: { current: 0, longest: 0, lastActiveDay: null },
    evidence: {},
    lessons: {},
    badges: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function isoDay(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function bumpStreak(streak: StreakState, now = Date.now()): StreakState {
  const today = isoDay(now);
  if (streak.lastActiveDay === today) return streak;
  const yesterday = isoDay(now - 86_400_000);
  const current = streak.lastActiveDay === yesterday ? streak.current + 1 : 1;
  return {
    current,
    longest: Math.max(streak.longest, current),
    lastActiveDay: today,
  };
}
