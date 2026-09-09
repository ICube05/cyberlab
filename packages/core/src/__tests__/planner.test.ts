import { describe, it, expect } from 'vitest';
import { detectStruggles, canEnterLesson, computeLessonStates, type PlannerInput } from '../planner.js';
import { emptyProgress, emptyLessonProgress } from '../progress.js';
import type { LessonSummary, Module } from '../curriculum.js';

const lessons: LessonSummary[] = [
  { id: 'l1', moduleId: 'm', levelId: 'lv', title: 'One', status: 'ready', difficulty: 'beginner', estimatedMinutes: 10, skills: ['a'], prerequisites: [], hasLab: true, exerciseCount: 1 },
  { id: 'l2', moduleId: 'm', levelId: 'lv', title: 'Two', status: 'ready', difficulty: 'beginner', estimatedMinutes: 10, skills: ['b'], prerequisites: ['l1'], hasLab: true, exerciseCount: 1 },
];
const modules: Module[] = [{ id: 'm', levelId: 'lv', title: 'M', summary: '', lessons: ['l1', 'l2'] }];

describe('progression gate', () => {
  it('locks a lesson until its prerequisite is completed', () => {
    const progress = emptyProgress('u');
    const input: PlannerInput = { lessons, modules, progress };
    expect(canEnterLesson('l2', input).allowed).toBe(false);
    expect(canEnterLesson('l1', input).allowed).toBe(true);
  });

  it('unlocks the next lesson once the prerequisite completes, and always names a way forward', () => {
    const progress = emptyProgress('u');
    const decision = canEnterLesson('l2', { lessons, modules, progress });
    expect(decision.missingPrerequisites).toEqual(['l1']);
    expect(decision.suggestion).toEqual({ kind: 'lesson', lessonId: 'l1' });

    progress.lessons['l1'] = { ...emptyLessonProgress('l1'), state: 'completed' };
    expect(canEnterLesson('l2', { lessons, modules, progress }).allowed).toBe(true);
  });

  it('never marks a planned lesson enterable', () => {
    const planned: LessonSummary[] = [{ ...lessons[0]!, id: 'p', status: 'planned', prerequisites: [] }];
    const states = computeLessonStates({ lessons: planned, modules: [{ id: 'm', levelId: 'lv', title: 'M', summary: '', lessons: ['p'] }], progress: emptyProgress('u') });
    expect(states['p']).toBe('locked');
  });
});

describe('struggle detection', () => {
  it('fires after three consecutive failures on the same skill', () => {
    const attempts = [
      { exerciseId: 'e', lessonId: 'l', skillIds: ['sqli'], passed: false, score: 20, at: 3 },
      { exerciseId: 'e', lessonId: 'l', skillIds: ['sqli'], passed: false, score: 10, at: 2 },
      { exerciseId: 'e', lessonId: 'l', skillIds: ['sqli'], passed: false, score: 15, at: 1 },
    ];
    const struggles = detectStruggles(attempts);
    expect(struggles).toHaveLength(1);
    expect(struggles[0]!.skillId).toBe('sqli');
    expect(struggles[0]!.failures).toBe(3);
  });

  it('does not fire on two failures', () => {
    const attempts = [
      { exerciseId: 'e', lessonId: 'l', skillIds: ['sqli'], passed: false, score: 20, at: 2 },
      { exerciseId: 'e', lessonId: 'l', skillIds: ['sqli'], passed: false, score: 10, at: 1 },
    ];
    expect(detectStruggles(attempts)).toHaveLength(0);
  });

  it('a success breaks the streak (most recent first)', () => {
    const attempts = [
      { exerciseId: 'e', lessonId: 'l', skillIds: ['sqli'], passed: true, score: 90, at: 4 },
      { exerciseId: 'e', lessonId: 'l', skillIds: ['sqli'], passed: false, score: 20, at: 3 },
      { exerciseId: 'e', lessonId: 'l', skillIds: ['sqli'], passed: false, score: 10, at: 2 },
      { exerciseId: 'e', lessonId: 'l', skillIds: ['sqli'], passed: false, score: 15, at: 1 },
    ];
    expect(detectStruggles(attempts)).toHaveLength(0);
  });
});
