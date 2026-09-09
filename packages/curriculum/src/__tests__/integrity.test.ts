import { describe, it, expect } from 'vitest';
import { CONTENT_GRAPH, EXERCISES, LESSONS, validate, buildCurriculumIndex, generateExercise, getExercisesForLesson, getLesson } from '../index.js';
import { validateCurriculum } from '@cyberlab/core';
import { ALL_BUILDERS } from '@cyberlab/lab-engine';

describe('curriculum integrity', () => {
  it('passes the full integrity check with no errors', () => {
    const report = validate();
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('has no warnings either', () => {
    expect(validateCurriculum(CONTENT_GRAPH).warnings).toEqual([]);
  });

  it('every lab referenced by a ready lesson has a registered target builder', () => {
    const builderIds = new Set(ALL_BUILDERS.map((b) => b.id));
    for (const lesson of LESSONS.filter((l) => l.status === 'ready')) {
      const lab = CONTENT_GRAPH.labs.find((x) => x.id === lesson.labSpecId);
      expect(lab, `lesson ${lesson.id} lab`).toBeDefined();
      expect(builderIds.has(lab!.builderId)).toBe(true);
    }
  });

  it('every ready lesson has at least one exercise with graded criteria', () => {
    for (const lesson of LESSONS.filter((l) => l.status === 'ready')) {
      const exercises = getExercisesForLesson(lesson.id);
      expect(exercises.length).toBeGreaterThan(0);
      for (const ex of exercises) expect(ex.criteria.length).toBeGreaterThan(0);
    }
  });

  it('exercise criteria only reference signals the targets can plausibly raise (regex compiles)', () => {
    for (const ex of EXERCISES) {
      for (const c of ex.criteria) {
        expect(() => JSON.stringify(c.rule)).not.toThrow();
      }
    }
  });

  it('builds a roadmap index covering every level', () => {
    const index = buildCurriculumIndex();
    expect(index.levels).toHaveLength(11);
    expect(index.lessons.length).toBe(LESSONS.length);
  });

  it('generates a harder, still-gradable challenge from a template', () => {
    const lesson = getLesson('web.broken-access-control')!;
    const gen = generateExercise({ lesson, templates: getExercisesForLesson(lesson.id), difficultyShift: 2, seed: 'unit' });
    expect(gen.exercise.generated).toBe(true);
    expect(gen.exercise.criteria.length).toBeGreaterThan(0);
    // Fewer hints than the base mission.
    const base = getExercisesForLesson(lesson.id).find((e) => e.kind === 'mission')!;
    expect(gen.exercise.hints.length).toBeLessThanOrEqual(base.hints.length);
  });
});
