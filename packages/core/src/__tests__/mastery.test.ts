import { describe, it, expect } from 'vitest';
import {
  bandFor,
  deriveMastery,
  emptySkillEvidence,
  observe,
  observeMany,
  weakestSkills,
  masteryToContext,
} from '../mastery.js';
import type { SkillMastery } from '../skill.js';

describe('mastery model', () => {
  const now = 1_700_000_000_000;

  it('starts unknown with no observations', () => {
    const m = deriveMastery('sqli', emptySkillEvidence(now), now);
    expect(m.band).toBe('unknown');
    expect(m.observations).toBe(0);
  });

  it('rises with success and falls with failure', () => {
    let ev = emptySkillEvidence(now);
    ev = observeMany(ev, [{ dimension: 'exploitation', score: 1, weight: 2 }], now);
    ev = observeMany(ev, [{ dimension: 'exploitation', score: 1, weight: 2 }], now);
    const good = deriveMastery('x', ev, now);

    let ev2 = emptySkillEvidence(now);
    ev2 = observeMany(ev2, [{ dimension: 'exploitation', score: 0, weight: 2 }], now);
    const bad = deriveMastery('x', ev2, now);

    expect(good.dimensions.exploitation).toBeGreaterThan(bad.dimensions.exploitation);
  });

  it('is deterministic: same observations, same result', () => {
    const obs = [
      { dimension: 'theory' as const, score: 0.8, weight: 1 },
      { dimension: 'exploitation' as const, score: 1, weight: 2 },
    ];
    const a = deriveMastery('x', observeMany(emptySkillEvidence(now), obs, now), now);
    const b = deriveMastery('x', observeMany(emptySkillEvidence(now), obs, now), now);
    expect(a.overall).toBe(b.overall);
  });

  it('confidence grows with evidence count', () => {
    const few = deriveMastery('x', observe(emptySkillEvidence(now), { dimension: 'theory', score: 1 }, now), now);
    let many = emptySkillEvidence(now);
    for (let i = 0; i < 10; i += 1) many = observe(many, { dimension: 'theory', score: 1 }, now);
    const manyM = deriveMastery('x', many, now);
    expect(manyM.confidence.theory).toBeGreaterThan(few.confidence.theory);
  });

  it('decays unexercised knowledge toward the prior over time', () => {
    let ev = emptySkillEvidence(now);
    for (let i = 0; i < 8; i += 1) ev = observe(ev, { dimension: 'theory', score: 1 }, now);
    const fresh = deriveMastery('x', ev, now).dimensions.theory;
    const later = deriveMastery('x', ev, now + 120 * 86_400_000).dimensions.theory; // 120 days
    expect(later).toBeLessThan(fresh);
  });

  it('will not claim a high band without confidence', () => {
    // A single perfect observation should not mint an "expert".
    const ev = observe(emptySkillEvidence(now), { dimension: 'exploitation', score: 1, weight: 1 }, now);
    const m = deriveMastery('x', ev, now);
    expect(['novice', 'beginner']).toContain(m.band);
  });

  it('bandFor demotes when confidence is below the floor', () => {
    expect(bandFor(0.9, 0.1, 1)).not.toBe('expert');
    expect(bandFor(0.9, 0.95, 40)).toBe('expert');
  });

  it('weakestSkills ignores untouched skills and sorts ascending', () => {
    const masteries: SkillMastery[] = [
      { skillId: 'a', dimensions: {} as never, confidence: {} as never, overall: 0.3, band: 'beginner', observations: 4 },
      { skillId: 'b', dimensions: {} as never, confidence: {} as never, overall: 0.9, band: 'expert', observations: 4 },
      { skillId: 'c', dimensions: {} as never, confidence: {} as never, overall: 0.1, band: 'novice', observations: 0 },
    ];
    const weak = weakestSkills(masteries, 5);
    expect(weak.map((m) => m.skillId)).toEqual(['a', 'b']);
  });

  it('masteryToContext only includes touched skills, rounded', () => {
    const masteries: SkillMastery[] = [
      { skillId: 'a', dimensions: {} as never, confidence: {} as never, overall: 0.837, band: 'advanced', observations: 3 },
      { skillId: 'b', dimensions: {} as never, confidence: {} as never, overall: 0.5, band: 'beginner', observations: 0 },
    ];
    expect(masteryToContext(masteries)).toEqual({ a: 0.84 });
  });
});
