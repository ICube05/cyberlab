import type { EvaluationResult } from './evaluation.js';
import type { ExerciseId, LabInstanceId, LessonId, SkillId } from './ids.js';
import type { LabEvent } from './lab.js';

/**
 * The tutor's contract.
 *
 * Modes are not prompt suffixes — each one changes what context is assembled,
 * what the model is allowed to reveal, and how the answer is post-processed.
 * `hint`, in particular, is bounded by the exercise's authored hint ladder so
 * that a chatty model cannot hand over the solution on hint one.
 */
export type TutorMode =
  | 'teach'
  | 'hint'
  | 'review'
  | 'challenge'
  | 'explain'
  | 'ask'
  | 'debug';

export const TUTOR_MODES: readonly TutorMode[] = [
  'teach',
  'hint',
  'review',
  'challenge',
  'explain',
  'ask',
  'debug',
] as const;

export const TUTOR_MODE_META: Record<
  TutorMode,
  { label: string; blurb: string; icon: string; needsLab: boolean }
> = {
  teach: { label: 'Teach', blurb: 'Explain the concept from the top', icon: 'book', needsLab: false },
  hint: { label: 'Hint', blurb: 'A nudge, not the answer', icon: 'compass', needsLab: true },
  review: { label: 'Review', blurb: 'Analyse what I just did', icon: 'search', needsLab: true },
  challenge: { label: 'Challenge', blurb: 'Give me something harder', icon: 'flame', needsLab: false },
  explain: { label: 'Explain', blurb: 'Why did that work?', icon: 'lightbulb', needsLab: true },
  ask: { label: 'Ask', blurb: 'Open question about this lesson', icon: 'message', needsLab: false },
  debug: { label: 'Debug', blurb: 'My attempt is not working', icon: 'bug', needsLab: true },
};

export interface TutorMessage {
  id: string;
  role: 'user' | 'tutor';
  mode?: TutorMode;
  content: string;
  at: number;
  /** Set when the reply came from the deterministic offline tutor. */
  offline?: boolean;
  /** Non-fatal notes, e.g. "hint 2 of 3". */
  meta?: Record<string, string | number | boolean>;
}

/**
 * The structured payload handed to the model. Deliberately *not* prose: the
 * prompt template renders this, so the same context can be logged, diffed,
 * unit-tested and shown to the learner under "what the tutor can see".
 */
export interface TutorContext {
  locale: 'it' | 'en';
  lesson?: {
    id: LessonId;
    title: string;
    difficulty: string;
    objectives: string[];
    skills: SkillId[];
    /** Plain-text projection of the theory the learner has actually reached. */
    theoryDigest: string;
    /** The block the learner is currently looking at, if any. */
    focusBlock?: { id: string; kind: string; text: string };
  };
  exercise?: {
    id: ExerciseId;
    title: string;
    kind: string;
    objective: string;
    /** Objective checklist with live pass/fail. */
    objectives: { label: string; passed: boolean }[];
    /** Hints already revealed — the model must not go past these. */
    hintsRevealed: { level: number; text: string }[];
    /** Hints still sealed. Sent so the model can *aim* at the next one. */
    nextHint?: { level: number; text: string };
    /** Never sent in `hint` mode. */
    solution?: { summary: string; explanation: string };
  };
  lab?: {
    instanceId: LabInstanceId;
    specId: string;
    title: string;
    scenario: string;
    surfaces: string[];
    /** Most recent events, compacted. */
    recentEvents: CompactEvent[];
    signals: string[];
    flags: string[];
  };
  learner: {
    level: number;
    xp: number;
    masteryBySkill: Record<SkillId, number>;
    weakSkills: SkillId[];
    strongSkills: SkillId[];
    recentFailures: { exerciseId: ExerciseId; score: number; missed: string[] }[];
    /** Lessons already completed, so the tutor can reference shared ground. */
    completedLessons: LessonId[];
  };
  lastEvaluation?: Pick<EvaluationResult, 'passed' | 'score' | 'failureReason'> & {
    criteria: { label: string; passed: boolean }[];
  };
}

export interface CompactEvent {
  seq: number;
  summary: string;
  outcome: string;
  signals?: string[];
}

export interface TutorRequest {
  mode: TutorMode;
  message?: string;
  lessonId?: LessonId;
  exerciseId?: ExerciseId;
  labInstanceId?: LabInstanceId;
  focusBlockId?: string;
  history: TutorMessage[];
}

export type TutorStreamChunk =
  | { type: 'meta'; provider: string; model: string; offline: boolean }
  | { type: 'delta'; text: string }
  | { type: 'done'; message: TutorMessage }
  | { type: 'error'; message: string };

export function compactEvent(event: LabEvent): CompactEvent {
  const action = event.action;
  let summary: string = action.type;
  switch (action.type) {
    case 'http.request':
      summary = `${action.method} ${action.path}`;
      break;
    case 'browser.navigate':
      summary = `GET ${action.path} (browser)`;
      break;
    case 'browser.submit':
      summary = `${action.method} ${action.path} (form)`;
      break;
    case 'shell.exec':
      summary = `$ ${action.command}`;
      break;
    case 'sql.query':
      summary = `sql: ${action.sql}`;
      break;
    case 'fs.read':
      summary = `read ${action.path}`;
      break;
    case 'fs.list':
      summary = `ls ${action.path}`;
      break;
    case 'editor.write':
      summary = `write ${action.path}`;
      break;
    case 'lab.inspect':
      summary = `inspect ${action.what}`;
      break;
  }

  let outcome: string = event.result.type;
  switch (event.result.type) {
    case 'http.response':
      outcome = `${event.result.response.status} ${event.result.response.statusText} (${event.result.response.body.length}b)`;
      break;
    case 'shell.result':
      outcome = `exit ${event.result.result.exitCode}: ${truncate(event.result.result.stdout || event.result.result.stderr, 160)}`;
      break;
    case 'sql.result':
      outcome = event.result.result.error
        ? `error: ${event.result.result.error}`
        : `${event.result.result.rowCount} row(s)`;
      break;
    case 'error':
      outcome = `error: ${event.result.message}`;
      break;
  }

  return {
    seq: event.seq,
    summary,
    outcome,
    ...(event.signals.length ? { signals: event.signals } : {}),
  };
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max - 1) + '…' : value;
}
