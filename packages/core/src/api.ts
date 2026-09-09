import { z } from 'zod';
import type { CurriculumIndex, Lesson } from './curriculum.js';
import type { Exercise } from './exercise.js';
import type { EvaluationResult } from './evaluation.js';
import type { LabActionResult, LabEvent, LabSpec, LabState } from './lab.js';
import type { Recommendation } from './planner.js';
import type { LessonState, UserProgress } from './progress.js';
import type { SkillMastery, Skill } from './skill.js';
import type { LevelProgress } from './xp.js';
import type { TutorMode } from './ai.js';

/**
 * HTTP contract.
 *
 * Request bodies are validated with zod at the edge — one schema, used by the
 * Fastify route and re-exported to the client so the two can never drift.
 * Responses are plain types: they are produced by the server, and the client
 * trusts its own server.
 */

// ── Requests ───────────────────────────────────────────────────────────────

export const httpRequestActionSchema = z.object({
  type: z.literal('http.request'),
  method: z.string().min(1).max(12),
  path: z.string().min(1).max(4096),
  headers: z.record(z.string(), z.string()).default({}),
  body: z.string().max(65_536).optional(),
  useCookieJar: z.boolean().optional(),
  followRedirects: z.boolean().optional(),
});

export const labActionSchema = z.discriminatedUnion('type', [
  httpRequestActionSchema,
  z.object({ type: z.literal('browser.navigate'), path: z.string().min(1).max(4096) }),
  z.object({
    type: z.literal('browser.submit'),
    path: z.string().min(1).max(4096),
    method: z.enum(['GET', 'POST']),
    fields: z.record(z.string(), z.string()),
  }),
  z.object({ type: z.literal('shell.exec'), command: z.string().max(4096) }),
  z.object({ type: z.literal('sql.query'), sql: z.string().max(8192) }),
  z.object({ type: z.literal('fs.list'), path: z.string().max(4096) }),
  z.object({ type: z.literal('fs.read'), path: z.string().max(4096) }),
  z.object({ type: z.literal('editor.write'), path: z.string().max(4096), content: z.string().max(262_144) }),
  z.object({ type: z.literal('lab.inspect'), what: z.enum(['database', 'sessions', 'logs', 'files']) }),
]);

export const createLabSchema = z.object({
  specId: z.string().min(1).max(128),
  seed: z.string().max(64).optional(),
  exerciseId: z.string().max(128).optional(),
});

export const startAttemptSchema = z.object({
  exerciseId: z.string().min(1).max(128),
  labInstanceId: z.string().max(128).optional(),
});

export const submitAttemptSchema = z.object({
  report: z.record(z.string(), z.string()).optional(),
});

export const revealHintSchema = z.object({
  hintId: z.string().min(1).max(128),
});

export const blockSeenSchema = z.object({
  lessonId: z.string().min(1).max(128),
  blockIds: z.array(z.string().max(128)).max(200),
  timeSpentMs: z.number().int().min(0).max(3_600_000).optional(),
});

export const quizAnswerSchema = z.object({
  lessonId: z.string().min(1).max(128),
  blockId: z.string().min(1).max(128),
  selected: z.array(z.string().max(64)).max(12),
});

export const tutorRequestSchema = z.object({
  mode: z.enum(['teach', 'hint', 'review', 'challenge', 'explain', 'ask', 'debug']),
  message: z.string().max(4000).optional(),
  lessonId: z.string().max(128).optional(),
  exerciseId: z.string().max(128).optional(),
  labInstanceId: z.string().max(128).optional(),
  focusBlockId: z.string().max(128).optional(),
  history: z
    .array(
      z.object({
        id: z.string().max(64),
        role: z.enum(['user', 'tutor']),
        mode: z.string().max(24).optional(),
        content: z.string().max(8000),
        at: z.number(),
      }),
    )
    .max(40)
    .default([]),
});

export const generateExerciseSchema = z.object({
  lessonId: z.string().min(1).max(128),
  /** Relative to the learner's current mastery: -1 easier, 0 same, +1 harder. */
  difficultyShift: z.number().int().min(-1).max(2).default(1),
  seed: z.string().max(64).optional(),
});

export type CreateLabBody = z.infer<typeof createLabSchema>;
export type LabActionBody = z.infer<typeof labActionSchema>;
export type StartAttemptBody = z.infer<typeof startAttemptSchema>;
export type SubmitAttemptBody = z.infer<typeof submitAttemptSchema>;
export type TutorRequestBody = z.infer<typeof tutorRequestSchema>;
export type GenerateExerciseBody = z.infer<typeof generateExerciseSchema>;

// ── Responses ──────────────────────────────────────────────────────────────

export interface HealthResponse {
  ok: boolean;
  version: string;
  labRuntime: string;
  aiProvider: string;
  aiReachable: boolean;
  aiModel: string;
  contentLocale: 'it' | 'en';
  curriculum: { lessons: number; ready: number; labs: number; exercises: number };
}

export interface CurriculumResponse extends CurriculumIndex {
  skills: Skill[];
  /** Per-lesson gate state for the current user. */
  lessonStates: Record<string, LessonState>;
}

export interface LessonResponse {
  lesson: Lesson;
  exercises: Exercise[];
  lab?: LabSpec;
  levelId: string;
  moduleTitle: string;
  /** Position within the module, for the "Lesson 4 / 12" header. */
  position: { index: number; total: number };
  entry: { allowed: boolean; reasons: string[] };
  progress?: {
    state: LessonState;
    blocksSeen: string[];
    quiz: Record<string, { correct: boolean; attempts: number }>;
    exercises: Record<string, { passed: boolean; bestScore: number; attempts: number }>;
  };
}

export interface ProgressResponse {
  progress: UserProgress;
  level: LevelProgress;
  masteries: SkillMastery[];
  recommendations: Recommendation[];
  lessonStates: Record<string, LessonState>;
}

export interface LabResponse {
  state: LabState;
  spec: LabSpec;
}

export interface LabActionResponse {
  result: LabActionResult;
  state: LabState;
  event: LabEvent;
  /** Live criterion preview for the active attempt, if any. */
  preview?: { exerciseId: string; objectives: { id: string; label: string; passed: boolean }[] };
}

export interface TranscriptResponse {
  events: LabEvent[];
}

export interface AttemptResponse {
  attemptId: string;
  exerciseId: string;
  startedAt: number;
  hintsUsed: string[];
}

export interface SubmitAttemptResponse {
  evaluation: EvaluationResult;
  progress: ProgressResponse;
  /** Skill deltas, for the "mastery updated" animation. */
  masteryDeltas: { skillId: string; before: number; after: number }[];
  unlockedLessons: string[];
  newBadges: string[];
}

export interface GenerateExerciseResponse {
  exercise: Exercise;
  /** Where the generator got the shape from, for transparency. */
  derivedFrom: string;
}

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}

export const TUTOR_MODE_VALUES: readonly TutorMode[] = [
  'teach',
  'hint',
  'review',
  'challenge',
  'explain',
  'ask',
  'debug',
];
