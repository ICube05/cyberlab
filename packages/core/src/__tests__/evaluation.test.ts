import { describe, it, expect } from 'vitest';
import { evaluate, type EvaluationInput } from '../evaluation.js';
import type { Exercise } from '../exercise.js';
import type { LabEvent, LabSignal } from '../lab.js';

function httpEvent(seq: number, method: string, path: string, status: number, signals: string[] = []): LabEvent {
  return {
    seq,
    at: seq * 100,
    action: { type: 'http.request', method, path, headers: {} },
    result: {
      type: 'http.response',
      ok: status < 400,
      durationMs: 1,
      response: { status, statusText: '', headers: [], body: '', contentType: 'text/html', finalPath: path },
    },
    signals,
  };
}

const baseExercise = (): Exercise => ({
  id: 'ex.test',
  lessonId: 'l',
  title: 'test',
  kind: 'mission',
  difficulty: 'beginner',
  estimatedMinutes: 5,
  mission: { context: '', objective: '' },
  objectives: [{ id: 'o1', label: 'bypass', criteria: ['c-bypass'] }],
  hints: [{ id: 'h1', level: 1, text: 'nudge', weightPenalty: 0.3 }],
  criteria: [
    { id: 'c-bypass', label: 'bypass', weight: 2, required: true, rule: { type: 'signal', name: 'authz.bypass' }, dimensions: ['exploitation'] },
    { id: 'c-flag', label: 'flag', weight: 1, rule: { type: 'flag', value: 'CL{' }, dimensions: ['exploitation'] },
  ],
  solution: { summary: '', steps: [], explanation: '' },
  skills: [{ skillId: 'idor', dimension: 'exploitation', weight: 2 }],
  xp: 100,
});

function input(over: Partial<EvaluationInput>): EvaluationInput {
  return {
    exercise: baseExercise(),
    transcript: [],
    signals: [],
    state: { flags: [], eventCount: 0, cookies: [] },
    ...over,
  };
}

describe('evaluation engine', () => {
  it('passes when required signal and flag are present', () => {
    const signals: LabSignal[] = [{ name: 'authz.bypass', at: 1, seq: 1 }];
    const r = evaluate(input({ signals, state: { flags: ['CL{abc}'], eventCount: 1, cookies: [] } }));
    expect(r.passed).toBe(true);
    expect(r.score).toBe(100);
    expect(r.criteria.every((c) => c.passed)).toBe(true);
  });

  it('fails hard when a required criterion is missing, regardless of score', () => {
    const r = evaluate(input({ signals: [], state: { flags: ['CL{abc}'], eventCount: 1, cookies: [] } }));
    expect(r.passed).toBe(false);
    expect(r.failureReason).toMatch(/Required/);
  });

  it('is a pure function of its input — no clock, no randomness', () => {
    const inp = input({ signals: [{ name: 'authz.bypass', at: 1, seq: 1 }], state: { flags: ['CL{x}'], eventCount: 1, cookies: [] } });
    expect(evaluate(inp)).toEqual(evaluate(inp));
  });

  it('flag rule matches by substring, not exact value', () => {
    const r = evaluate(input({
      signals: [{ name: 'authz.bypass', at: 1, seq: 1 }],
      state: { flags: ['CL{idor_deadbeef}'], eventCount: 1, cookies: [] },
    }));
    expect(r.criteria.find((c) => c.id === 'c-flag')?.passed).toBe(true);
  });

  it('applies hint penalties to evidence weight, not to score', () => {
    const withHint = evaluate(input({
      signals: [{ name: 'authz.bypass', at: 1, seq: 1 }],
      state: { flags: ['CL{x}'], eventCount: 1, cookies: [] },
      hintsUsed: ['h1'],
    }));
    const without = evaluate(input({
      signals: [{ name: 'authz.bypass', at: 1, seq: 1 }],
      state: { flags: ['CL{x}'], eventCount: 1, cookies: [] },
    }));
    expect(withHint.score).toBe(without.score); // score unchanged
    expect(withHint.observations[0]!.weight).toBeLessThan(without.observations[0]!.weight); // evidence weaker
    expect(withHint.xpAwarded).toBeLessThan(without.xpAwarded);
  });

  it('http rule matches method, path regex and status', () => {
    const exercise = baseExercise();
    exercise.criteria = [
      { id: 'c-403', label: '403 after fix', weight: 1, rule: { type: 'http', pathMatches: '/profile\\.php\\?id=', statusIn: [403] } },
    ];
    exercise.objectives = [{ id: 'o', label: 'x', criteria: ['c-403'] }];
    const transcript = [httpEvent(1, 'GET', '/profile.php?id=17', 403)];
    const r = evaluate({ ...input({}), exercise, transcript });
    expect(r.criteria[0]!.passed).toBe(true);
  });

  it('count rule requires N distinct matches', () => {
    const exercise = baseExercise();
    exercise.criteria = [
      { id: 'c-enum', label: 'enumerate 3', weight: 1, rule: { type: 'count', min: 3, rule: { type: 'signal', name: 'read' } } },
    ];
    exercise.objectives = [{ id: 'o', label: 'x', criteria: ['c-enum'] }];
    const twoSignals: LabSignal[] = [{ name: 'read', at: 1, seq: 1 }, { name: 'read', at: 2, seq: 2 }];
    const partial = evaluate({ ...input({ signals: twoSignals }), exercise });
    expect(partial.criteria[0]!.passed).toBe(false);
    expect(partial.criteria[0]!.score).toBeCloseTo(2 / 3);

    const threeSignals: LabSignal[] = [...twoSignals, { name: 'read', at: 3, seq: 3 }];
    const full = evaluate({ ...input({ signals: threeSignals }), exercise });
    expect(full.criteria[0]!.passed).toBe(true);
  });

  it('signal payload predicates constrain matches', () => {
    const exercise = baseExercise();
    exercise.criteria = [
      { id: 'c', label: 'own=false', weight: 1, required: true, rule: { type: 'signal', name: 'read', where: [{ path: 'own', equals: false }] } },
    ];
    exercise.objectives = [{ id: 'o', label: 'x', criteria: ['c'] }];
    const ownRead: LabSignal[] = [{ name: 'read', at: 1, seq: 1, data: { own: true } }];
    expect(evaluate({ ...input({ signals: ownRead }), exercise }).passed).toBe(false);
    const otherRead: LabSignal[] = [{ name: 'read', at: 1, seq: 1, data: { own: false } }];
    expect(evaluate({ ...input({ signals: otherRead }), exercise }).passed).toBe(true);
  });

  it('report rule validates learner-reported findings', () => {
    const exercise = baseExercise();
    exercise.criteria = [{ id: 'c', label: 'param', weight: 1, required: true, rule: { type: 'report', field: 'parameter', matches: '\\bid\\b' } }];
    exercise.objectives = [{ id: 'o', label: 'x', criteria: ['c'] }];
    expect(evaluate({ ...input({ report: { parameter: 'id' } }), exercise }).passed).toBe(true);
    expect(evaluate({ ...input({ report: { parameter: 'name' } }), exercise }).passed).toBe(false);
  });
});
