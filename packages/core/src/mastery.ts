import type { SkillId } from './ids.js';
import {
  SKILL_DIMENSIONS,
  type DimensionEvidence,
  type MasteryBand,
  type SkillDimension,
  type SkillEvidence,
  type SkillMastery,
} from './skill.js';

/**
 * Mastery estimation.
 *
 * The model is a Beta-Bernoulli tracker per (skill, dimension) with time decay.
 * It is deliberately simple and fully deterministic: given the same attempts in
 * the same order you always get the same numbers, which matters because these
 * numbers gate progression and are handed to the AI tutor as context.
 */

export const MASTERY_CONFIG = {
  /** Uniform prior. `observations` is measured net of it. */
  priorAlpha: 1,
  priorBeta: 1,
  /**
   * How fast unexercised knowledge fades. 45 days is a compromise between
   * "nothing ever decays" (dishonest) and nagging the learner every fortnight.
   */
  decayHalfLifeDays: 45,
  /** Evidence weight at which confidence reaches ~0.5. */
  confidenceMidpoint: 4,
  /**
   * How much each dimension contributes to the roll-up. Exploitation carries
   * the most weight because it is the hardest to bluff: either the lab state
   * changed or it did not.
   */
  dimensionWeights: {
    theory: 0.2,
    recognition: 0.25,
    exploitation: 0.35,
    mitigation: 0.2,
  } satisfies Record<SkillDimension, number>,
  bandThresholds: [
    { band: 'novice' as const, min: 0 },
    { band: 'beginner' as const, min: 0.35 },
    { band: 'intermediate' as const, min: 0.55 },
    { band: 'advanced' as const, min: 0.72 },
    { band: 'expert' as const, min: 0.87 },
  ],
  /** A band cannot be claimed without enough evidence behind it. */
  bandConfidenceFloor: {
    unknown: 0,
    novice: 0,
    beginner: 0.15,
    intermediate: 0.4,
    advanced: 0.6,
    expert: 0.8,
  } satisfies Record<MasteryBand, number>,
} as const;

const DAY_MS = 86_400_000;

export function emptyDimensionEvidence(now = Date.now()): DimensionEvidence {
  return {
    alpha: MASTERY_CONFIG.priorAlpha,
    beta: MASTERY_CONFIG.priorBeta,
    lastObservedAt: now,
  };
}

export function emptySkillEvidence(now = Date.now()): SkillEvidence {
  return {
    theory: emptyDimensionEvidence(now),
    recognition: emptyDimensionEvidence(now),
    exploitation: emptyDimensionEvidence(now),
    mitigation: emptyDimensionEvidence(now),
  };
}

/**
 * Pull evidence back toward the prior as it ages. Applied lazily on read and
 * before every update, so the stored value is always "as of lastObservedAt".
 */
export function decayEvidence(evidence: DimensionEvidence, now: number): DimensionEvidence {
  const elapsedDays = Math.max(0, (now - evidence.lastObservedAt) / DAY_MS);
  if (elapsedDays < 0.5) return evidence;
  const factor = Math.pow(0.5, elapsedDays / MASTERY_CONFIG.decayHalfLifeDays);
  return {
    alpha: MASTERY_CONFIG.priorAlpha + (evidence.alpha - MASTERY_CONFIG.priorAlpha) * factor,
    beta: MASTERY_CONFIG.priorBeta + (evidence.beta - MASTERY_CONFIG.priorBeta) * factor,
    lastObservedAt: now,
  };
}

export interface Observation {
  dimension: SkillDimension;
  /** 0..1. Partial credit is expected and normal. */
  score: number;
  /**
   * How much this observation counts. A three-step guided walkthrough is worth
   * less than an unaided challenge; hints reduce weight, not score, because a
   * hinted success is still a success — just weaker evidence.
   */
  weight?: number;
}

export function observe(
  evidence: SkillEvidence,
  observation: Observation,
  now = Date.now(),
): SkillEvidence {
  const weight = clamp(observation.weight ?? 1, 0, 8);
  const score = clamp(observation.score, 0, 1);
  const current = decayEvidence(evidence[observation.dimension], now);
  const next: DimensionEvidence = {
    alpha: current.alpha + weight * score,
    beta: current.beta + weight * (1 - score),
    lastObservedAt: now,
  };
  return { ...evidence, [observation.dimension]: next };
}

export function observeMany(
  evidence: SkillEvidence,
  observations: readonly Observation[],
  now = Date.now(),
): SkillEvidence {
  return observations.reduce((acc, o) => observe(acc, o, now), evidence);
}

function dimensionObservations(e: DimensionEvidence): number {
  return Math.max(0, e.alpha + e.beta - MASTERY_CONFIG.priorAlpha - MASTERY_CONFIG.priorBeta);
}

function dimensionConfidence(e: DimensionEvidence): number {
  const n = dimensionObservations(e);
  return n / (n + MASTERY_CONFIG.confidenceMidpoint);
}

export function deriveMastery(
  skillId: SkillId,
  evidence: SkillEvidence,
  now = Date.now(),
): SkillMastery {
  const dimensions = {} as Record<SkillDimension, number>;
  const confidence = {} as Record<SkillDimension, number>;
  let weightedSum = 0;
  let weightTotal = 0;
  let observations = 0;

  for (const dim of SKILL_DIMENSIONS) {
    const decayed = decayEvidence(evidence[dim], now);
    const value = decayed.alpha / (decayed.alpha + decayed.beta);
    const conf = dimensionConfidence(decayed);
    dimensions[dim] = value;
    confidence[dim] = conf;
    observations += dimensionObservations(decayed);

    // Dimensions with no evidence do not drag the roll-up down; they simply
    // do not participate, and the remaining weights are renormalised.
    if (conf > 0) {
      const w = MASTERY_CONFIG.dimensionWeights[dim] * conf;
      weightedSum += value * w;
      weightTotal += w;
    }
  }

  const overall = weightTotal > 0 ? weightedSum / weightTotal : 0;
  const meanConfidence =
    SKILL_DIMENSIONS.reduce((sum, d) => sum + confidence[d], 0) / SKILL_DIMENSIONS.length;

  return {
    skillId,
    dimensions,
    confidence,
    overall,
    band: bandFor(overall, meanConfidence, observations),
    observations,
  };
}

export function bandFor(overall: number, confidence: number, observations: number): MasteryBand {
  if (observations <= 0) return 'unknown';
  let band: MasteryBand = 'novice';
  for (const t of MASTERY_CONFIG.bandThresholds) {
    if (overall >= t.min) band = t.band;
  }
  // Demote until the evidence supports the claim.
  const order: MasteryBand[] = ['unknown', 'novice', 'beginner', 'intermediate', 'advanced', 'expert'];
  let index = order.indexOf(band);
  while (index > 0 && confidence < MASTERY_CONFIG.bandConfidenceFloor[order[index]!]) {
    index -= 1;
  }
  return order[index] ?? 'novice';
}

/** Skills the learner is weakest at, most-urgent first. Ignores untouched skills. */
export function weakestSkills(
  masteries: readonly SkillMastery[],
  limit = 5,
): SkillMastery[] {
  return masteries
    .filter((m) => m.observations > 0)
    .slice()
    .sort((a, b) => a.overall - b.overall)
    .slice(0, limit);
}

export function strongestSkills(masteries: readonly SkillMastery[], limit = 5): SkillMastery[] {
  return masteries
    .filter((m) => m.observations >= 2)
    .slice()
    .sort((a, b) => b.overall - a.overall)
    .slice(0, limit);
}

/** Compact form handed to the AI tutor — two decimals, no noise. */
export function masteryToContext(masteries: readonly SkillMastery[]): Record<SkillId, number> {
  const out: Record<SkillId, number> = {};
  for (const m of masteries) {
    if (m.observations > 0) out[m.skillId] = round2(m.overall);
  }
  return out;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
