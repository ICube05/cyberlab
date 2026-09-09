import type { Difficulty, Exercise, Hint, Lesson } from '@cyberlab/core';
import { DIFFICULTY_ORDER } from '@cyberlab/core';

/**
 * The exercise generator.
 *
 * The brief asks the tutor to "generate exercises automatically" and make the
 * curriculum "dynamic". Rather than ask a model to invent a gradable exercise
 * (which it cannot reliably do — grading needs criteria that match real lab
 * signals), the generator *derives* a new mission from an authored template on
 * the same lab. It varies the seed, the framing and the hint budget, and shifts
 * difficulty by tightening the objectives.
 *
 * The result is still graded by the same deterministic engine against the same
 * real signals, so a generated challenge is exactly as honest as an authored
 * one — it is simply harder, fresher, and reproducible from its seed.
 */

export interface GenerateInput {
  lesson: Lesson;
  /** Authored exercises for this lesson, used as templates. */
  templates: Exercise[];
  /** -1 easier, 0 same, +1..+2 harder. */
  difficultyShift: number;
  seed: string;
}

export interface GeneratedExercise {
  exercise: Exercise;
  derivedFrom: string;
}

/** Small deterministic RNG so a seed always yields the same challenge. */
function seededPick<T>(items: readonly T[], seed: string, salt: string): T {
  let h = 0x811c9dc5;
  const s = seed + salt;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return items[h % items.length]!;
}

export function generateExercise(input: GenerateInput): GeneratedExercise {
  // Prefer a 'mission' or 'challenge' template — those have the richest criteria.
  const base =
    input.templates.find((e) => e.kind === 'challenge') ??
    input.templates.find((e) => e.kind === 'mission') ??
    input.templates[0];

  if (!base) {
    throw new Error(`Lesson ${input.lesson.id} has no exercise templates to generate from.`);
  }

  const targetDifficulty = shiftDifficulty(base.difficulty, input.difficultyShift);
  const harder = DIFFICULTY_ORDER.indexOf(targetDifficulty) >= DIFFICULTY_ORDER.indexOf(base.difficulty);

  // Harder variants keep fewer hints and cost more evidence weight.
  const hintBudget = harder ? Math.max(0, base.hints.length - 1 - Math.max(0, input.difficultyShift - 1)) : base.hints.length;
  const hints: Hint[] = base.hints.slice(0, hintBudget).map((h) => ({ ...h, weightPenalty: h.weightPenalty * 1.5 }));

  const framing = seededPick(CHALLENGE_FRAMINGS, input.seed, base.id);
  const weightScale = harder ? 1.25 : 0.9;

  const exercise: Exercise = {
    ...base,
    id: `${base.id}.gen.${input.seed}`,
    kind: 'challenge',
    difficulty: targetDifficulty,
    generated: true,
    seed: input.seed,
    title: `${framing.titlePrefix} ${base.title}`,
    estimatedMinutes: Math.round(base.estimatedMinutes * (harder ? 1.2 : 0.9)),
    mission: {
      ...base.mission,
      context: `${framing.context} ${base.mission.context}`,
      objective: base.mission.objective,
    },
    hints,
    // Same criteria — grading stays honest — but re-weighted, and required
    // criteria stay required so a harder challenge cannot be cheesed.
    criteria: base.criteria.map((c) => ({ ...c, weight: round2(c.weight * weightScale) })),
    skills: base.skills.map((s) => ({ ...s, weight: round2(s.weight * weightScale) })),
    xp: Math.round(base.xp * (harder ? 1.4 : 0.8)),
  };

  return { exercise, derivedFrom: base.id };
}

function shiftDifficulty(current: Difficulty, shift: number): Difficulty {
  const index = DIFFICULTY_ORDER.indexOf(current);
  const next = Math.min(DIFFICULTY_ORDER.length - 1, Math.max(0, index + shift));
  return DIFFICULTY_ORDER[next]!;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const CHALLENGE_FRAMINGS = [
  {
    titlePrefix: 'Challenge —',
    context: 'Nuovo scenario, stesso obiettivo, meno aiuti.',
  },
  {
    titlePrefix: 'Time-attack —',
    context: 'Il cliente vuole una prova rapida di impatto.',
  },
  {
    titlePrefix: 'Blind —',
    context: 'Questa volta lavori con meno indizi del solito.',
  },
  {
    titlePrefix: 'Assessment —',
    context: 'Considera questo come parte di un assessment reale (autorizzato).',
  },
];
