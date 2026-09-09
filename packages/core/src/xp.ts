/**
 * XP and levels.
 *
 * Kept deliberately quiet. XP is a pacing signal — "you have been productive
 * today" — not the point of the platform. Mastery is the metric that gates
 * progression; XP never does. The curve below is gentle on purpose: it should
 * never be worth grinding easy labs.
 */

export const XP_AWARDS = {
  /** Reading a theory section end to end. */
  lessonTheory: 20,
  /** Answering an inline check correctly, first try. */
  quizCorrect: 10,
  quizCorrectRetry: 4,
  /** Booting a lab and interacting with it at all. */
  labEngaged: 15,
  /** Completing a lesson: all exercises passed. */
  lessonComplete: 60,
  /** Passing a module checkpoint unaided. */
  checkpoint: 200,
  /** First time a skill crosses into a new mastery band. */
  bandUp: 50,
} as const;

const BASE = 120;
const GROWTH = 1.22;

/** Total XP required to *reach* the given level (level 1 = 0). */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  let total = 0;
  for (let i = 1; i < level; i += 1) {
    total += Math.round(BASE * Math.pow(GROWTH, i - 1));
  }
  return total;
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (xp >= xpForLevel(level + 1) && level < 99) level += 1;
  return level;
}

export interface LevelProgress {
  level: number;
  xp: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  ratio: number;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelForXp(xp);
  const floor = xpForLevel(level);
  const ceiling = xpForLevel(level + 1);
  const span = Math.max(1, ceiling - floor);
  return {
    level,
    xp,
    xpIntoLevel: xp - floor,
    xpForNextLevel: span,
    ratio: Math.min(1, (xp - floor) / span),
  };
}
