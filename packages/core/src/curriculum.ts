import type { ContentBlock } from './content.js';
import type {
  ExerciseId,
  LabSpecId,
  LessonId,
  LevelId,
  ModuleId,
  SkillId,
} from './ids.js';

export type Difficulty = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export const DIFFICULTY_ORDER: readonly Difficulty[] = [
  'beginner',
  'intermediate',
  'advanced',
  'expert',
] as const;

/**
 * Honest status flags.
 *
 * The roadmap shows the whole ten-level curriculum because a learner deserves
 * to see where they are going. But a lesson that is only an outline says so,
 * loudly, in the tree and in the header. Nothing in this platform pretends to
 * be interactive when it is not.
 */
export type LessonStatus =
  /** Theory, interactive blocks, a live lab and graded exercises. */
  | 'ready'
  /** Theory and interactive blocks, no lab yet. */
  | 'theory-only'
  /** Title, objectives and outline only. Visible in the roadmap, not enterable. */
  | 'planned';

export interface Lesson {
  id: LessonId;
  moduleId: ModuleId;
  title: string;
  subtitle?: string;
  status: LessonStatus;
  difficulty: Difficulty;
  estimatedMinutes: number;
  /** Skills this lesson teaches and measures. */
  skills: SkillId[];
  /** Lessons that should be completed first. Enforced by the progression gate. */
  prerequisites: LessonId[];
  /** "After this lesson you will be able to…" — shown in the header and to the tutor. */
  objectives: string[];
  /** Section A. */
  theory: ContentBlock[];
  /** Section B — interactive explanation. Rendered after theory, before the lab. */
  practice?: ContentBlock[];
  /** Section C — the live lab, if this lesson has one. */
  labSpecId?: LabSpecId;
  /** Graded missions attached to this lesson, in order. */
  exercises: ExerciseId[];
  /** Shown on completion; also used to generate the periodic recap. */
  recap?: string[];
  /** For `planned` lessons: what it will cover. Renders as a preview. */
  outline?: string[];
  furtherReading?: { title: string; url: string; note?: string }[];
}

export interface Module {
  id: ModuleId;
  levelId: LevelId;
  title: string;
  summary: string;
  lessons: LessonId[];
  /** A gate the learner must pass before the next module unlocks. */
  checkpoint?: Checkpoint;
}

/**
 * A checkpoint is a mastery gate, not a quiz. It asks for demonstrated
 * competence on specific (skill, dimension) pairs; the learner reaches it by
 * doing labs, not by answering more multiple-choice questions.
 */
export interface Checkpoint {
  id: string;
  title: string;
  description: string;
  requirements: CheckpointRequirement[];
  /** Optional harder exercise that must be cleared unaided. */
  exerciseId?: ExerciseId;
}

export interface CheckpointRequirement {
  skillId: SkillId;
  dimension: 'theory' | 'recognition' | 'exploitation' | 'mitigation';
  /** Minimum mastery value, 0..1. */
  min: number;
}

export interface Level {
  id: LevelId;
  /** 0..10, matches the LEVEL n labels in the roadmap. */
  index: number;
  title: string;
  tagline: string;
  summary: string;
  modules: ModuleId[];
  prerequisites: LevelId[];
  /** Icon key resolved by the web app's icon registry. */
  icon: string;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  levels: LevelId[];
}

/** Everything the web app needs to render the roadmap, in one payload. */
export interface CurriculumIndex {
  course: Course;
  levels: Level[];
  modules: Module[];
  /** Lessons without their heavy content, for the tree. */
  lessons: LessonSummary[];
}

export interface LessonSummary {
  id: LessonId;
  moduleId: ModuleId;
  levelId: LevelId;
  title: string;
  subtitle?: string;
  status: LessonStatus;
  difficulty: Difficulty;
  estimatedMinutes: number;
  skills: SkillId[];
  prerequisites: LessonId[];
  hasLab: boolean;
  exerciseCount: number;
}

export function toLessonSummary(lesson: Lesson, levelId: LevelId): LessonSummary {
  return {
    id: lesson.id,
    moduleId: lesson.moduleId,
    levelId,
    title: lesson.title,
    ...(lesson.subtitle ? { subtitle: lesson.subtitle } : {}),
    status: lesson.status,
    difficulty: lesson.difficulty,
    estimatedMinutes: lesson.estimatedMinutes,
    skills: lesson.skills,
    prerequisites: lesson.prerequisites,
    hasLab: Boolean(lesson.labSpecId),
    exerciseCount: lesson.exercises.length,
  };
}
