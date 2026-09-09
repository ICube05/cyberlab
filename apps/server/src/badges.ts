import type { Badge, UserProgress } from '@cyberlab/core';

/**
 * Badges are flavour, not progression. They recognise a moment worth noticing
 * (first exploit, a clean unaided run, a fixed vulnerability) and never gate
 * anything. Each has a pure predicate over progress.
 */
export interface BadgeDef extends Badge {
  earned(progress: UserProgress): boolean;
}

export const BADGES: BadgeDef[] = [
  {
    id: 'badge.first-blood',
    name: 'First Blood',
    description: 'Hai completato il tuo primo esercizio.',
    icon: 'droplet',
    criteria: 'Passa un qualsiasi esercizio.',
    earned: (p) => anyExercise(p, (e) => e.passed),
  },
  {
    id: 'badge.first-exploit',
    name: 'First Exploit',
    description: 'Hai sfruttato la tua prima vulnerabilità in un laboratorio.',
    icon: 'zap',
    criteria: 'Passa un esercizio di tipo mission/challenge.',
    earned: (p) => p.badges.includes('badge.first-exploit'),
  },
  {
    id: 'badge.defender',
    name: 'Defender',
    description: 'Hai corretto una vulnerabilità, non solo sfruttata.',
    icon: 'shield-check',
    criteria: 'Passa un esercizio di tipo "fix".',
    earned: (p) => p.badges.includes('badge.defender'),
  },
  {
    id: 'badge.flawless',
    name: 'Flawless',
    description: 'Hai superato un esercizio con 100/100 senza usare indizi.',
    icon: 'star',
    criteria: 'Score 100 e zero hint.',
    earned: (p) => p.badges.includes('badge.flawless'),
  },
  {
    id: 'badge.streak-3',
    name: 'On a Roll',
    description: '3 giorni di attività consecutivi.',
    icon: 'flame',
    criteria: 'Streak ≥ 3.',
    earned: (p) => p.streak.current >= 3 || p.streak.longest >= 3,
  },
];

function anyExercise(p: UserProgress, pred: (e: { passed: boolean }) => boolean): boolean {
  return Object.values(p.lessons).some((l) => Object.values(l.exercises).some(pred));
}

export const BADGE_INDEX = new Map(BADGES.map((b) => [b.id, b]));
