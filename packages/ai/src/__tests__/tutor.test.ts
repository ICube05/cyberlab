import { describe, it, expect } from 'vitest';
import { buildPrompt } from '../prompt.js';
import { compose } from '../offline.js';
import type { TutorContext } from '@cyberlab/core';

const baseContext = (over: Partial<TutorContext> = {}): TutorContext => ({
  locale: 'it',
  learner: { level: 2, xp: 100, masteryBySkill: {}, weakSkills: [], strongSkills: [], recentFailures: [], completedLessons: [] },
  ...over,
});

describe('tutor prompting', () => {
  it('NEVER leaks the solution in hint mode', () => {
    const ctx = baseContext({
      exercise: {
        id: 'e', title: 't', kind: 'mission', objective: 'bypass it',
        objectives: [{ label: 'bypass', passed: false }],
        hintsRevealed: [{ level: 1, text: 'try changing the id' }],
        nextHint: { level: 2, text: 'enumerate 11..19' },
        solution: { summary: 'THE SECRET SOLUTION', explanation: 'THE SECRET EXPLANATION' },
      },
    });
    const prompt = buildPrompt('hint', ctx, [], undefined);
    expect(prompt.system).not.toContain('THE SECRET SOLUTION');
    expect(prompt.system).not.toContain('THE SECRET EXPLANATION');
    // But it DOES aim at the next sealed hint.
    expect(prompt.system).toContain('enumerate 11..19');
  });

  it('includes the solution in explain mode (for teaching after the fact)', () => {
    const ctx = baseContext({
      exercise: {
        id: 'e', title: 't', kind: 'mission', objective: 'x', objectives: [], hintsRevealed: [],
        solution: { summary: 'SUMMARY_HERE', explanation: 'EXPLANATION_HERE' },
      },
    });
    const prompt = buildPrompt('explain', ctx, [], undefined);
    expect(prompt.system).toContain('EXPLANATION_HERE');
  });

  it('grounds the prompt in the learner’s real lab actions', () => {
    const ctx = baseContext({
      lab: {
        instanceId: 'lab_1', specId: 'lab.vault', title: 'Vault', scenario: 'x', surfaces: ['request'],
        recentEvents: [{ seq: 1, summary: 'GET /profile.php?id=17', outcome: '200 OK', signals: ['authz.horizontal.bypass'] }],
        signals: ['authz.horizontal.bypass'], flags: [],
      },
    });
    const prompt = buildPrompt('review', ctx, [], undefined);
    expect(prompt.system).toContain('GET /profile.php?id=17');
    expect(prompt.system).toContain('authz.horizontal.bypass');
  });

  it('always ends with a user turn', () => {
    const prompt = buildPrompt('ask', baseContext(), [], 'perché 403?');
    expect(prompt.messages.at(-1)?.role).toBe('user');
    expect(prompt.messages.at(-1)?.content).toBe('perché 403?');
  });
});

describe('offline tutor', () => {
  it('review reads the transcript and reports the bypass', () => {
    const text = compose('review', baseContext({
      lab: {
        instanceId: 'l', specId: 's', title: 'Vault', scenario: '', surfaces: [],
        recentEvents: [{ seq: 1, summary: 'GET /profile.php?id=17', outcome: '200 OK', signals: ['authz.horizontal.bypass'] }],
        signals: ['authz.horizontal.bypass'], flags: ['CL{x}'],
      },
    }));
    expect(text.toLowerCase()).toContain('autorizzazione');
    expect(text).toContain('CL{x}');
  });

  it('explain describes the real mechanism keyed on the signal', () => {
    const text = compose('explain', baseContext({
      lab: { instanceId: 'l', specId: 's', title: '', scenario: '', surfaces: [], recentEvents: [], signals: ['sqli.auth-bypass'], flags: [] },
    }));
    expect(text.toLowerCase()).toContain('password');
  });

  it('hint never returns the solution, only the next authored hint', () => {
    const text = compose('hint', baseContext({
      exercise: {
        id: 'e', title: 't', kind: 'mission', objective: 'x',
        objectives: [{ label: 'o', passed: false }],
        hintsRevealed: [],
        nextHint: { level: 1, text: 'change the id parameter' },
        solution: { summary: 'SECRET', explanation: 'SECRET' },
      },
    }));
    expect(text).toContain('change the id parameter');
    expect(text).not.toContain('SECRET');
  });
});
