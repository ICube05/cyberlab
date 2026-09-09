import type { Difficulty } from './curriculum.js';
import type { ExerciseId, LabSpecId, LessonId, SkillId } from './ids.js';
import type { SkillDimension } from './skill.js';

export type ExerciseKind =
  /** Walkthrough with explicit steps. Low mastery weight, high hand-holding. */
  | 'guided'
  /** The standard unit: an objective, a lab, and no instructions. */
  | 'mission'
  /** Harder variant, generated or authored, unlocked after a mission. */
  | 'challenge'
  /** "Now make it safe." Graded on the patched code / config. */
  | 'fix'
  /** Module gate. Unaided, no hints, higher weight. */
  | 'checkpoint';

export interface Exercise {
  id: ExerciseId;
  lessonId: LessonId;
  labSpecId?: LabSpecId;
  title: string;
  kind: ExerciseKind;
  difficulty: Difficulty;
  estimatedMinutes: number;
  /** The mission briefing, rendered in the mission panel. */
  mission: MissionBrief;
  /** Checklist shown to the learner. Each maps to one or more criteria. */
  objectives: ExerciseObjective[];
  /** Structured findings the learner must report. Optional. */
  report?: ReportField[];
  /** Escalating hints. Using one reduces evidence weight, never the score. */
  hints: Hint[];
  criteria: Criterion[];
  solution: Solution;
  /** Which (skill, dimension) pairs this exercise provides evidence for. */
  skills: SkillContribution[];
  xp: number;
  /** True when produced by the exercise generator rather than authored. */
  generated?: boolean;
  /** Seed used by the generator, so a mission can be reproduced exactly. */
  seed?: string;
}

export interface MissionBrief {
  /** One or two sentences of context. */
  context: string;
  /** The single thing to accomplish. */
  objective: string;
  /** Facts the learner starts with. */
  known?: string[];
  /** Explicit scope statement. Every offensive exercise has one. */
  scope?: string;
}

export interface ExerciseObjective {
  id: string;
  label: string;
  /** Criteria that satisfy this objective. */
  criteria: string[];
  /** Shown greyed-out until unlocked, to avoid spoiling the path. */
  hidden?: boolean;
}

export interface ReportField {
  id: string;
  label: string;
  placeholder?: string;
  type: 'text' | 'number' | 'select';
  options?: { value: string; label: string }[];
  help?: string;
}

export interface Hint {
  id: string;
  /** 1 = nudge, 2 = direction, 3 = near-solution. */
  level: 1 | 2 | 3;
  text: string;
  /** Evidence weight multiplier applied when this hint has been revealed. */
  weightPenalty: number;
}

export interface Solution {
  summary: string;
  steps: string[];
  /** The "why", written for after the fact. The tutor expands on this. */
  explanation: string;
  /** How a defender would prevent it. Always present for offensive exercises. */
  mitigation?: string;
}

export interface SkillContribution {
  skillId: SkillId;
  dimension: SkillDimension;
  /** Evidence weight before hint penalties. */
  weight: number;
}

// ── Criteria & the rule DSL ────────────────────────────────────────────────

export interface Criterion {
  id: string;
  /** Rendered verbatim in the result panel, e.g. "Request modified correctly". */
  label: string;
  /** Share of the exercise score. Normalised across all criteria. */
  weight: number;
  /** A failed required criterion fails the whole mission regardless of score. */
  required?: boolean;
  rule: Rule;
  /** Explains what a failure means, shown only after a failed attempt. */
  feedback?: string;
  /**
   * Which mastery dimensions this criterion is evidence for. When omitted the
   * criterion contributes to every dimension the exercise declares, via the
   * overall score. Naming dimensions here is what lets one mission say
   * "you exploited it but you could not explain the fix".
   */
  dimensions?: SkillDimension[];
}

/**
 * The rule DSL is data, not code.
 *
 * That matters for three reasons: exercises can be generated at runtime and
 * still be gradable; rules can be serialised into the AI tutor's context so it
 * can reason about *why* a criterion failed; and grading is a pure function of
 * the transcript, so it is reproducible and unit-testable.
 */
export type Rule =
  | SignalRule
  | HttpRule
  | ShellRule
  | SqlRule
  | FlagRule
  | ReportRule
  | StateRule
  | NotRule
  | AllOfRule
  | AnyOfRule
  | CountRule;

/** The target raised a named signal — the strongest evidence available. */
export interface SignalRule {
  type: 'signal';
  name: string;
  /** Minimum occurrences. Defaults to 1. */
  min?: number;
  /** Optional constraints on the signal payload. */
  where?: FieldPredicate[];
}

export interface HttpRule {
  type: 'http';
  method?: string;
  /** JS regular expression source, tested against `path`. */
  pathMatches?: string;
  headerMatches?: { name: string; matches: string };
  bodyMatches?: string;
  statusIn?: number[];
  minCount?: number;
}

export interface ShellRule {
  type: 'shell';
  commandMatches?: string;
  stdoutMatches?: string;
  exitCode?: number;
  minCount?: number;
}

export interface SqlRule {
  type: 'sql';
  /** Matched against the SQL the server *actually ran*, post-concatenation. */
  executedMatches?: string;
  minRowsReturned?: number;
  minCount?: number;
}

export interface FlagRule {
  type: 'flag';
  value: string;
}

/** Checks a value the learner reported in the mission's report form. */
export interface ReportRule {
  type: 'report';
  field: string;
  equals?: string;
  matches?: string;
  oneOf?: string[];
  /** Case-insensitive comparison. Defaults to true. */
  ignoreCase?: boolean;
}

/** Checks the lab's final observable state. */
export interface StateRule {
  type: 'state';
  path: string;
  equals?: string | number | boolean;
  gte?: number;
  lte?: number;
  matches?: string;
}

export interface NotRule {
  type: 'not';
  rule: Rule;
}

export interface AllOfRule {
  type: 'allOf';
  rules: Rule[];
}

export interface AnyOfRule {
  type: 'anyOf';
  rules: Rule[];
}

/** At least `min` distinct matches of the inner rule. */
export interface CountRule {
  type: 'count';
  rule: Rule;
  min: number;
  max?: number;
}

export interface FieldPredicate {
  path: string;
  equals?: string | number | boolean;
  notEquals?: string | number | boolean;
  gte?: number;
  lte?: number;
  matches?: string;
  exists?: boolean;
}
