import type { AttemptId, ExerciseId, UserId } from './ids.js';
import type { LabEvent, LabSignal, LabState } from './lab.js';
import type {
  Criterion,
  Exercise,
  FieldPredicate,
  Rule,
} from './exercise.js';
import type { Observation } from './mastery.js';
import { clamp } from './mastery.js';
import type { SkillDimension } from './skill.js';
import { SKILL_DIMENSIONS } from './skill.js';

/**
 * The evaluation engine.
 *
 * A pure function of (exercise, transcript, signals, state, report). No I/O, no
 * randomness, no clock. Two consequences worth stating: grading is fully
 * unit-testable, and the exact same code can run on the server (authoritative)
 * and in the browser (instant feedback while the learner works).
 */

export interface EvaluationInput {
  exercise: Exercise;
  transcript: readonly LabEvent[];
  signals: readonly LabSignal[];
  state: Pick<LabState, 'flags' | 'eventCount' | 'cookies' | 'shell'> & Record<string, unknown>;
  report?: Record<string, string>;
  hintsUsed?: readonly string[];
  elapsedMs?: number;
}

export interface EvidenceRef {
  seq: number;
  at: number;
  summary: string;
}

export interface CriterionResult {
  id: string;
  label: string;
  passed: boolean;
  /** 0..1. Count rules can be partially satisfied. */
  score: number;
  weight: number;
  required: boolean;
  matches: number;
  evidence: EvidenceRef[];
  feedback?: string;
}

export interface ObjectiveResult {
  id: string;
  label: string;
  passed: boolean;
}

export interface EvaluationResult {
  exerciseId: ExerciseId;
  passed: boolean;
  /** 0..100, the number shown as "Score: 92/100". */
  score: number;
  criteria: CriterionResult[];
  objectives: ObjectiveResult[];
  evidence: EvidenceRef[];
  /** Per-dimension scores, 0..1, used to update mastery. */
  dimensionScores: Partial<Record<SkillDimension, number>>;
  /** Evidence weight multiplier after hint penalties. */
  weightMultiplier: number;
  observations: Observation[];
  /** Skill each observation belongs to, index-aligned with `observations`. */
  observationSkills: string[];
  xpAwarded: number;
  failureReason?: string;
}

interface RuleMatch {
  matches: number;
  evidence: EvidenceRef[];
}

export function evaluate(input: EvaluationInput): EvaluationResult {
  const { exercise } = input;
  const criteria = exercise.criteria.map((c) => evaluateCriterion(c, input));

  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0) || 1;
  const rawScore = criteria.reduce((sum, c) => sum + c.score * c.weight, 0) / totalWeight;

  const missingRequired = criteria.find((c) => c.required && !c.passed);
  const passed = !missingRequired && rawScore >= 0.6;

  const dimensionScores = computeDimensionScores(exercise.criteria, criteria, rawScore);

  const hintPenalty = (input.hintsUsed ?? []).reduce((sum, hintId) => {
    const hint = exercise.hints.find((h) => h.id === hintId);
    return sum + (hint?.weightPenalty ?? 0);
  }, 0);
  const weightMultiplier = clamp(1 - hintPenalty, 0.25, 1);

  const observations: Observation[] = [];
  const observationSkills: string[] = [];
  for (const contribution of exercise.skills) {
    const score = dimensionScores[contribution.dimension] ?? rawScore;
    observations.push({
      dimension: contribution.dimension,
      score,
      weight: contribution.weight * weightMultiplier,
    });
    observationSkills.push(contribution.skillId);
  }

  const objectives: ObjectiveResult[] = exercise.objectives.map((objective) => ({
    id: objective.id,
    label: objective.label,
    passed: objective.criteria.every((id) => criteria.find((c) => c.id === id)?.passed ?? false),
  }));

  const evidence = dedupeEvidence(criteria.flatMap((c) => c.evidence));

  const xpAwarded = passed
    ? Math.round(exercise.xp * (0.7 + 0.3 * rawScore) * (0.6 + 0.4 * weightMultiplier))
    : Math.round(exercise.xp * 0.2 * rawScore);

  return {
    exerciseId: exercise.id,
    passed,
    score: Math.round(rawScore * 100),
    criteria,
    objectives,
    evidence,
    dimensionScores,
    weightMultiplier,
    observations,
    observationSkills,
    xpAwarded,
    ...(missingRequired
      ? { failureReason: `Required objective not met: ${missingRequired.label}` }
      : rawScore < 0.6
        ? { failureReason: 'Not enough of the mission objectives were demonstrated.' }
        : {}),
  };
}

function evaluateCriterion(criterion: Criterion, input: EvaluationInput): CriterionResult {
  const match = matchRule(criterion.rule, input);
  const required = minimumMatches(criterion.rule);
  const score = required <= 0 ? (match.matches > 0 ? 1 : 0) : clamp(match.matches / required, 0, 1);
  const passed = score >= 1;
  return {
    id: criterion.id,
    label: criterion.label,
    passed,
    score,
    weight: criterion.weight,
    required: Boolean(criterion.required),
    matches: match.matches,
    evidence: match.evidence.slice(0, 6),
    ...(criterion.feedback && !passed ? { feedback: criterion.feedback } : {}),
  };
}

function computeDimensionScores(
  specs: readonly Criterion[],
  results: readonly CriterionResult[],
  fallback: number,
): Partial<Record<SkillDimension, number>> {
  const out: Partial<Record<SkillDimension, number>> = {};
  for (const dim of SKILL_DIMENSIONS) {
    let weight = 0;
    let sum = 0;
    specs.forEach((spec, i) => {
      if (!spec.dimensions?.includes(dim)) return;
      const result = results[i];
      if (!result) return;
      weight += result.weight;
      sum += result.score * result.weight;
    });
    if (weight > 0) out[dim] = sum / weight;
  }
  // Dimensions nobody tagged fall back to the overall score, so an exercise
  // that does not bother tagging still produces sane evidence.
  for (const dim of SKILL_DIMENSIONS) {
    if (out[dim] === undefined && specs.some((s) => !s.dimensions)) out[dim] = fallback;
  }
  return out;
}

/** How many matches a rule needs to be fully satisfied. */
function minimumMatches(rule: Rule): number {
  switch (rule.type) {
    case 'count':
      return rule.min;
    case 'signal':
      return rule.min ?? 1;
    case 'http':
    case 'shell':
    case 'sql':
      return rule.minCount ?? 1;
    default:
      return 1;
  }
}

function matchRule(rule: Rule, input: EvaluationInput): RuleMatch {
  switch (rule.type) {
    case 'signal': {
      const hits = input.signals.filter(
        (s) => s.name === rule.name && predicatesPass(rule.where, s.data ?? {}),
      );
      return {
        matches: hits.length,
        evidence: hits.map((s) => ({
          seq: s.seq,
          at: s.at,
          summary: `signal ${s.name}${s.data ? ' ' + compactJson(s.data) : ''}`,
        })),
      };
    }

    case 'http': {
      const hits = input.transcript.filter((e) => {
        if (e.action.type !== 'http.request' && e.action.type !== 'browser.navigate' && e.action.type !== 'browser.submit') {
          return false;
        }
        const path = 'path' in e.action ? e.action.path : '';
        const method =
          e.action.type === 'http.request'
            ? e.action.method
            : e.action.type === 'browser.submit'
              ? e.action.method
              : 'GET';
        if (rule.method && rule.method.toUpperCase() !== method.toUpperCase()) return false;
        if (rule.pathMatches && !new RegExp(rule.pathMatches).test(path)) return false;
        if (rule.headerMatches) {
          const headers = e.action.type === 'http.request' ? e.action.headers : {};
          const value = findHeader(headers, rule.headerMatches.name);
          if (value === undefined || !new RegExp(rule.headerMatches.matches).test(value)) return false;
        }
        if (e.result.type === 'http.response') {
          if (rule.statusIn && !rule.statusIn.includes(e.result.response.status)) return false;
          if (rule.bodyMatches && !new RegExp(rule.bodyMatches, 'i').test(e.result.response.body)) {
            return false;
          }
        } else if (rule.statusIn || rule.bodyMatches) {
          return false;
        }
        return true;
      });
      return {
        matches: hits.length,
        evidence: hits.map((e) => ({
          seq: e.seq,
          at: e.at,
          summary: summariseEvent(e),
        })),
      };
    }

    case 'shell': {
      const hits = input.transcript.filter((e) => {
        if (e.action.type !== 'shell.exec') return false;
        if (rule.commandMatches && !new RegExp(rule.commandMatches).test(e.action.command)) return false;
        if (e.result.type !== 'shell.result') return false;
        if (rule.exitCode !== undefined && e.result.result.exitCode !== rule.exitCode) return false;
        if (rule.stdoutMatches && !new RegExp(rule.stdoutMatches, 'm').test(e.result.result.stdout)) {
          return false;
        }
        return true;
      });
      return {
        matches: hits.length,
        evidence: hits.map((e) => ({ seq: e.seq, at: e.at, summary: summariseEvent(e) })),
      };
    }

    case 'sql': {
      const hits = input.transcript.filter((e) => {
        if (e.result.type !== 'sql.result') return false;
        const sql = e.result.result.executedSql;
        if (rule.executedMatches && !new RegExp(rule.executedMatches, 'i').test(sql)) return false;
        if (rule.minRowsReturned !== undefined && e.result.result.rowCount < rule.minRowsReturned) {
          return false;
        }
        return true;
      });
      return {
        matches: hits.length,
        evidence: hits.map((e) => ({ seq: e.seq, at: e.at, summary: summariseEvent(e) })),
      };
    }

    case 'flag': {
      // Flags are seed-dependent, so a criterion matches by prefix/substring
      // (e.g. "CL{") rather than the exact value, which it cannot know.
      const hit = (input.state.flags ?? []).find((f) => f === rule.value || f.includes(rule.value));
      return {
        matches: hit ? 1 : 0,
        evidence: hit ? [{ seq: -1, at: 0, summary: `flag captured: ${hit}` }] : [],
      };
    }

    case 'report': {
      const raw = input.report?.[rule.field];
      if (raw === undefined) return { matches: 0, evidence: [] };
      const ignoreCase = rule.ignoreCase !== false;
      const value = ignoreCase ? raw.trim().toLowerCase() : raw.trim();
      const norm = (s: string) => (ignoreCase ? s.trim().toLowerCase() : s.trim());
      let ok = true;
      if (rule.equals !== undefined) ok = ok && value === norm(rule.equals);
      if (rule.oneOf) ok = ok && rule.oneOf.map(norm).includes(value);
      if (rule.matches) ok = ok && new RegExp(rule.matches, ignoreCase ? 'i' : '').test(raw);
      return {
        matches: ok ? 1 : 0,
        evidence: ok ? [{ seq: -1, at: 0, summary: `reported ${rule.field} = "${raw}"` }] : [],
      };
    }

    case 'state': {
      const value = getPath(input.state, rule.path);
      let ok = value !== undefined;
      if (ok && rule.equals !== undefined) ok = value === rule.equals;
      if (ok && rule.gte !== undefined) ok = typeof value === 'number' && value >= rule.gte;
      if (ok && rule.lte !== undefined) ok = typeof value === 'number' && value <= rule.lte;
      if (ok && rule.matches) ok = new RegExp(rule.matches).test(String(value));
      return {
        matches: ok ? 1 : 0,
        evidence: ok ? [{ seq: -1, at: 0, summary: `state ${rule.path} = ${String(value)}` }] : [],
      };
    }

    case 'not': {
      const inner = matchRule(rule.rule, input);
      return { matches: inner.matches === 0 ? 1 : 0, evidence: [] };
    }

    case 'allOf': {
      const results = rule.rules.map((r) => matchRule(r, input));
      const all = results.every((r) => r.matches > 0);
      return {
        matches: all ? 1 : 0,
        evidence: all ? dedupeEvidence(results.flatMap((r) => r.evidence)) : [],
      };
    }

    case 'anyOf': {
      const results = rule.rules.map((r) => matchRule(r, input));
      const hit = results.find((r) => r.matches > 0);
      return { matches: hit ? 1 : 0, evidence: hit ? hit.evidence : [] };
    }

    case 'count': {
      const inner = matchRule(rule.rule, input);
      const capped = rule.max !== undefined ? Math.min(inner.matches, rule.max) : inner.matches;
      return { matches: capped, evidence: inner.evidence };
    }
  }
}

function predicatesPass(predicates: readonly FieldPredicate[] | undefined, data: Record<string, unknown>): boolean {
  if (!predicates || predicates.length === 0) return true;
  return predicates.every((p) => {
    const value = getPath(data, p.path);
    if (p.exists !== undefined) return p.exists === (value !== undefined && value !== null);
    if (value === undefined) return false;
    if (p.equals !== undefined && value !== p.equals) return false;
    if (p.notEquals !== undefined && value === p.notEquals) return false;
    if (p.gte !== undefined && !(typeof value === 'number' && value >= p.gte)) return false;
    if (p.lte !== undefined && !(typeof value === 'number' && value <= p.lte)) return false;
    if (p.matches !== undefined && !new RegExp(p.matches).test(String(value))) return false;
    return true;
  });
}

export function getPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    if (Array.isArray(acc)) {
      if (key === 'length') return acc.length;
      const index = Number(key);
      return Number.isInteger(index) ? acc[index] : undefined;
    }
    if (typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, source);
}

function findHeader(headers: Record<string, string>, name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) return value;
  }
  return undefined;
}

function summariseEvent(event: LabEvent): string {
  const a = event.action;
  switch (a.type) {
    case 'http.request':
      return `${a.method} ${a.path}${event.result.type === 'http.response' ? ` → ${event.result.response.status}` : ''}`;
    case 'browser.navigate':
      return `navigate ${a.path}`;
    case 'browser.submit':
      return `submit ${a.method} ${a.path}`;
    case 'shell.exec':
      return `$ ${a.command}`;
    case 'sql.query':
      return `sql ${a.sql.slice(0, 80)}`;
    default:
      return a.type;
  }
}

function dedupeEvidence(list: readonly EvidenceRef[]): EvidenceRef[] {
  const seen = new Set<string>();
  const out: EvidenceRef[] = [];
  for (const e of list) {
    const key = `${e.seq}:${e.summary}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out.sort((a, b) => a.seq - b.seq);
}

function compactJson(data: Record<string, unknown>): string {
  try {
    const s = JSON.stringify(data);
    return s.length > 120 ? s.slice(0, 117) + '…' : s;
  } catch {
    return '';
  }
}

// ── Attempts ───────────────────────────────────────────────────────────────

export interface Attempt {
  id: AttemptId;
  userId: UserId;
  exerciseId: ExerciseId;
  labInstanceId?: string;
  startedAt: number;
  finishedAt?: number;
  hintsUsed: string[];
  report?: Record<string, string>;
  evaluation?: EvaluationResult;
  /** Closed by the learner without being graded. Never reaches mastery. */
  abandoned?: boolean;
}
