import type { SkillId } from './ids.js';

/**
 * A skill is *not* a lesson. Lessons come and go; skills are the durable axes
 * the learner is measured on. Several lessons feed the same skill, and one
 * lesson usually feeds several skills.
 */
export interface Skill {
  id: SkillId;
  name: string;
  /** Broad grouping used for the mastery dashboard. */
  domain: SkillDomain;
  /** One line, shown in tooltips and in the AI context payload. */
  summary: string;
  /** Skills that should normally be understood first. Advisory, not enforced. */
  buildsOn?: SkillId[];
}

export type SkillDomain =
  | 'foundations'
  | 'networking'
  | 'web'
  | 'recon'
  | 'pentest'
  | 'linux'
  | 'windows'
  | 'ad'
  | 'reversing'
  | 'malware'
  | 'redteam'
  | 'blueteam';

export const SKILL_DOMAINS: readonly SkillDomain[] = [
  'foundations',
  'networking',
  'web',
  'recon',
  'pentest',
  'linux',
  'windows',
  'ad',
  'reversing',
  'malware',
  'redteam',
  'blueteam',
] as const;

/**
 * Competence is not one number.
 *
 * Someone can explain SQL injection perfectly (theory), spot it in a code
 * review (recognition), and still not be able to extract a row from a live
 * target (exploitation) or write the parameterised fix (mitigation).
 * Collapsing those into a single percentage is what makes most platforms feel
 * dishonest, so CyberLab tracks all four independently.
 */
export type SkillDimension = 'theory' | 'recognition' | 'exploitation' | 'mitigation';

export const SKILL_DIMENSIONS: readonly SkillDimension[] = [
  'theory',
  'recognition',
  'exploitation',
  'mitigation',
] as const;

export const SKILL_DIMENSION_LABELS: Record<SkillDimension, string> = {
  theory: 'Theory',
  recognition: 'Recognition',
  exploitation: 'Exploitation',
  mitigation: 'Mitigation',
};

/**
 * Beta-distribution style evidence counter for one (skill, dimension) pair.
 *
 * `alpha` accumulates evidence of competence, `beta` evidence of struggle.
 * Keeping the raw counts (rather than a running average) means we can express
 * *confidence* as well as value: 3/4 after four attempts and 75/100 after a
 * hundred are the same ratio but very different claims.
 */
export interface DimensionEvidence {
  alpha: number;
  beta: number;
  /** Epoch ms of the most recent observation, used for time decay. */
  lastObservedAt: number;
}

export type SkillEvidence = Record<SkillDimension, DimensionEvidence>;

/** A derived, presentation-ready view of one skill's evidence. */
export interface SkillMastery {
  skillId: SkillId;
  /** 0..1 per dimension. */
  dimensions: Record<SkillDimension, number>;
  /** 0..1, how much evidence backs those numbers. */
  confidence: Record<SkillDimension, number>;
  /** Weighted roll-up of the four dimensions, 0..1. */
  overall: number;
  band: MasteryBand;
  observations: number;
}

export type MasteryBand = 'unknown' | 'novice' | 'beginner' | 'intermediate' | 'advanced' | 'expert';

export const MASTERY_BANDS: readonly MasteryBand[] = [
  'unknown',
  'novice',
  'beginner',
  'intermediate',
  'advanced',
  'expert',
] as const;
