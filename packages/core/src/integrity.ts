import type { Lesson, Level, Module } from './curriculum.js';
import type { Exercise, Rule } from './exercise.js';
import type { LabSpec } from './lab.js';
import type { Skill } from './skill.js';
import { isValidId } from './ids.js';

/**
 * Curriculum integrity check.
 *
 * This is the safety net that replaces branded id types: it runs at server
 * start-up and in CI, and it fails loudly on dangling references, id typos,
 * prerequisite cycles, uncompilable criterion regexes, and lessons that claim
 * to be `ready` without actually having a lab behind them.
 *
 * A platform that lies about what is implemented is worse than a small one.
 */

export interface ContentGraph {
  levels: readonly Level[];
  modules: readonly Module[];
  lessons: readonly Lesson[];
  exercises: readonly Exercise[];
  labs: readonly LabSpec[];
  skills: readonly Skill[];
}

export interface IntegrityReport {
  ok: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    levels: number;
    modules: number;
    lessons: number;
    readyLessons: number;
    /** Authored theory with interactive blocks, but no lab yet. */
    theoryLessons: number;
    exercises: number;
    labs: number;
    skills: number;
  };
}

export function validateCurriculum(graph: ContentGraph): IntegrityReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  const levelIds = new Set(graph.levels.map((l) => l.id));
  const moduleIds = new Set(graph.modules.map((m) => m.id));
  const lessonIds = new Set(graph.lessons.map((l) => l.id));
  const exerciseIds = new Set(graph.exercises.map((e) => e.id));
  const labIds = new Set(graph.labs.map((l) => l.id));
  const skillIds = new Set(graph.skills.map((s) => s.id));

  duplicates(graph.levels.map((l) => l.id)).forEach((id) => errors.push(`Duplicate level id: ${id}`));
  duplicates(graph.modules.map((m) => m.id)).forEach((id) => errors.push(`Duplicate module id: ${id}`));
  duplicates(graph.lessons.map((l) => l.id)).forEach((id) => errors.push(`Duplicate lesson id: ${id}`));
  duplicates(graph.exercises.map((e) => e.id)).forEach((id) => errors.push(`Duplicate exercise id: ${id}`));
  duplicates(graph.labs.map((l) => l.id)).forEach((id) => errors.push(`Duplicate lab id: ${id}`));
  duplicates(graph.skills.map((s) => s.id)).forEach((id) => errors.push(`Duplicate skill id: ${id}`));

  for (const id of [...levelIds, ...moduleIds, ...lessonIds, ...exerciseIds, ...labIds, ...skillIds]) {
    if (!isValidId(id)) errors.push(`Id "${id}" does not match the id convention (lowercase, dot/dash separated).`);
  }

  for (const level of graph.levels) {
    for (const moduleId of level.modules) {
      if (!moduleIds.has(moduleId)) errors.push(`Level ${level.id} references unknown module ${moduleId}`);
    }
    for (const prereq of level.prerequisites) {
      if (!levelIds.has(prereq)) errors.push(`Level ${level.id} references unknown prerequisite level ${prereq}`);
    }
  }

  for (const module of graph.modules) {
    if (!levelIds.has(module.levelId)) errors.push(`Module ${module.id} references unknown level ${module.levelId}`);
    for (const lessonId of module.lessons) {
      if (!lessonIds.has(lessonId)) errors.push(`Module ${module.id} references unknown lesson ${lessonId}`);
    }
    if (module.checkpoint) {
      for (const req of module.checkpoint.requirements) {
        if (!skillIds.has(req.skillId)) {
          errors.push(`Checkpoint ${module.checkpoint.id} requires unknown skill ${req.skillId}`);
        }
        if (req.min < 0 || req.min > 1) {
          errors.push(`Checkpoint ${module.checkpoint.id} requirement for ${req.skillId} must be 0..1`);
        }
      }
      if (module.checkpoint.exerciseId && !exerciseIds.has(module.checkpoint.exerciseId)) {
        errors.push(`Checkpoint ${module.checkpoint.id} references unknown exercise ${module.checkpoint.exerciseId}`);
      }
    }
  }

  for (const lesson of graph.lessons) {
    if (!moduleIds.has(lesson.moduleId)) {
      errors.push(`Lesson ${lesson.id} references unknown module ${lesson.moduleId}`);
    }
    for (const skillId of lesson.skills) {
      if (!skillIds.has(skillId)) errors.push(`Lesson ${lesson.id} references unknown skill ${skillId}`);
    }
    for (const prereq of lesson.prerequisites) {
      if (!lessonIds.has(prereq)) errors.push(`Lesson ${lesson.id} references unknown prerequisite ${prereq}`);
    }
    for (const exerciseId of lesson.exercises) {
      if (!exerciseIds.has(exerciseId)) errors.push(`Lesson ${lesson.id} references unknown exercise ${exerciseId}`);
    }
    if (lesson.labSpecId && !labIds.has(lesson.labSpecId)) {
      errors.push(`Lesson ${lesson.id} references unknown lab ${lesson.labSpecId}`);
    }

    const blockIds = [...lesson.theory, ...(lesson.practice ?? [])].map((b) => b.id);
    duplicates(blockIds).forEach((id) =>
      errors.push(`Lesson ${lesson.id} has duplicate content block id "${id}"`),
    );

    if (lesson.status === 'ready') {
      if (!lesson.labSpecId) errors.push(`Lesson ${lesson.id} is marked "ready" but has no lab.`);
      if (lesson.exercises.length === 0) {
        errors.push(`Lesson ${lesson.id} is marked "ready" but has no exercises.`);
      }
      if (lesson.theory.length < 3) {
        warnings.push(`Lesson ${lesson.id} is marked "ready" with very little theory.`);
      }
    }
    if (lesson.status === 'planned' && (!lesson.outline || lesson.outline.length === 0)) {
      warnings.push(`Planned lesson ${lesson.id} has no outline; the roadmap preview will be empty.`);
    }
    if (lesson.objectives.length === 0) warnings.push(`Lesson ${lesson.id} declares no objectives.`);
  }

  const cycle = findPrerequisiteCycle(graph.lessons);
  if (cycle) errors.push(`Prerequisite cycle detected: ${cycle.join(' → ')}`);

  for (const exercise of graph.exercises) {
    if (!lessonIds.has(exercise.lessonId)) {
      errors.push(`Exercise ${exercise.id} references unknown lesson ${exercise.lessonId}`);
    }
    if (exercise.labSpecId && !labIds.has(exercise.labSpecId)) {
      errors.push(`Exercise ${exercise.id} references unknown lab ${exercise.labSpecId}`);
    }
    for (const contribution of exercise.skills) {
      if (!skillIds.has(contribution.skillId)) {
        errors.push(`Exercise ${exercise.id} contributes to unknown skill ${contribution.skillId}`);
      }
    }
    const criterionIds = new Set(exercise.criteria.map((c) => c.id));
    duplicates(exercise.criteria.map((c) => c.id)).forEach((id) =>
      errors.push(`Exercise ${exercise.id} has duplicate criterion id "${id}"`),
    );
    for (const objective of exercise.objectives) {
      for (const id of objective.criteria) {
        if (!criterionIds.has(id)) {
          errors.push(`Exercise ${exercise.id} objective "${objective.id}" references unknown criterion "${id}"`);
        }
      }
    }
    for (const criterion of exercise.criteria) {
      const bad = validateRuleRegexes(criterion.rule);
      for (const message of bad) {
        errors.push(`Exercise ${exercise.id} criterion "${criterion.id}": ${message}`);
      }
      if (criterion.weight <= 0) {
        errors.push(`Exercise ${exercise.id} criterion "${criterion.id}" has non-positive weight`);
      }
    }
    if (exercise.criteria.length === 0) {
      errors.push(`Exercise ${exercise.id} has no criteria; it could never be graded.`);
    }
    if (exercise.hints.length === 0 && exercise.kind !== 'checkpoint') {
      warnings.push(`Exercise ${exercise.id} has no hints; learners will have nowhere to go when stuck.`);
    }
    if (!exercise.mission.scope && exercise.kind !== 'fix') {
      warnings.push(`Exercise ${exercise.id} has no scope statement.`);
    }
  }

  for (const skill of graph.skills) {
    for (const dep of skill.buildsOn ?? []) {
      if (!skillIds.has(dep)) warnings.push(`Skill ${skill.id} builds on unknown skill ${dep}`);
    }
  }

  const referencedLabs = new Set(
    [
      ...graph.lessons.map((l) => l.labSpecId),
      ...graph.exercises.map((e) => e.labSpecId),
    ].filter(Boolean) as string[],
  );
  for (const lab of graph.labs) {
    if (!referencedLabs.has(lab.id)) warnings.push(`Lab ${lab.id} is not referenced by any lesson or exercise.`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: {
      levels: graph.levels.length,
      modules: graph.modules.length,
      lessons: graph.lessons.length,
      readyLessons: graph.lessons.filter((l) => l.status === 'ready').length,
      theoryLessons: graph.lessons.filter((l) => l.status === 'theory-only').length,
      exercises: graph.exercises.length,
      labs: graph.labs.length,
      skills: graph.skills.length,
    },
  };
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const v of values) {
    if (seen.has(v)) dupes.add(v);
    seen.add(v);
  }
  return [...dupes];
}

function validateRuleRegexes(rule: Rule, path = 'rule'): string[] {
  const problems: string[] = [];
  const check = (source: string | undefined, field: string) => {
    if (source === undefined) return;
    try {
      new RegExp(source);
    } catch (error) {
      problems.push(`${path}.${field} is not a valid regular expression (${String(error)})`);
    }
  };

  switch (rule.type) {
    case 'http':
      check(rule.pathMatches, 'pathMatches');
      check(rule.bodyMatches, 'bodyMatches');
      check(rule.headerMatches?.matches, 'headerMatches.matches');
      break;
    case 'shell':
      check(rule.commandMatches, 'commandMatches');
      check(rule.stdoutMatches, 'stdoutMatches');
      break;
    case 'sql':
      check(rule.executedMatches, 'executedMatches');
      break;
    case 'report':
      check(rule.matches, 'matches');
      break;
    case 'state':
      check(rule.matches, 'matches');
      break;
    case 'signal':
      for (const [i, p] of (rule.where ?? []).entries()) check(p.matches, `where[${i}].matches`);
      break;
    case 'not':
      problems.push(...validateRuleRegexes(rule.rule, `${path}.not`));
      break;
    case 'allOf':
      rule.rules.forEach((r, i) => problems.push(...validateRuleRegexes(r, `${path}.allOf[${i}]`)));
      break;
    case 'anyOf':
      rule.rules.forEach((r, i) => problems.push(...validateRuleRegexes(r, `${path}.anyOf[${i}]`)));
      break;
    case 'count':
      problems.push(...validateRuleRegexes(rule.rule, `${path}.count`));
      break;
    case 'flag':
      break;
  }
  return problems;
}

function findPrerequisiteCycle(lessons: readonly Lesson[]): string[] | null {
  const graph = new Map(lessons.map((l) => [l.id, l.prerequisites]));
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];

  function visit(id: string): string[] | null {
    const current = state.get(id);
    if (current === 'done') return null;
    if (current === 'visiting') return [...stack.slice(stack.indexOf(id)), id];
    state.set(id, 'visiting');
    stack.push(id);
    for (const next of graph.get(id) ?? []) {
      if (!graph.has(next)) continue;
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(id, 'done');
    return null;
  }

  for (const lesson of lessons) {
    const cycle = visit(lesson.id);
    if (cycle) return cycle;
  }
  return null;
}
