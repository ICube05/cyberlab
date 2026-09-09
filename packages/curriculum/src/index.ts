import {
  toLessonSummary,
  validateCurriculum,
  type ContentGraph,
  type Course,
  type CurriculumIndex,
  type Exercise,
  type IntegrityReport,
  type Lesson,
  type LessonId,
  type Level,
  type Module,
  type LabSpec,
  type Skill,
} from '@cyberlab/core';

import { SKILLS } from './skills.js';
import { LABS } from './labs.js';
import { LEVELS, MODULES, PLANNED_LESSONS } from './roadmap.js';
import { howInternetWorksLesson } from './lessons/foundations/how-internet-works.js';
import { tcpIpLesson } from './lessons/foundations/tcp-ip.js';
import { dnsLesson } from './lessons/foundations/dns.js';
import { portsSocketsLesson } from './lessons/foundations/ports-sockets.js';
import { natFirewallLesson } from './lessons/foundations/nat-firewall.js';
import { httpLesson } from './lessons/foundations/http.js';
import { cryptoLesson } from './lessons/foundations/crypto.js';
import { linuxShellLesson } from './lessons/foundations/linux-shell.js';
import { linuxPermissionsLesson } from './lessons/foundations/linux-permissions.js';
import { httpCookiesLesson } from './lessons/web/http-cookies.js';
import { commandInjectionLesson } from './lessons/web/command-injection.js';
import { xssLesson } from './lessons/web/xss.js';
import { csrfLesson } from './lessons/web/csrf.js';
import { ssrfLesson } from './lessons/web/ssrf.js';
import { brokenAccessControlLesson } from './lessons/broken-access-control.js';
import { sqlInjectionLesson } from './lessons/sql-injection.js';
import { linuxPrivescLesson } from './lessons/linux-privesc.js';
import { brokenAccessControlExercises } from './exercises/broken-access-control.js';
import { sqlInjectionExercises } from './exercises/sql-injection.js';
import { linuxPrivescExercises } from './exercises/linux-privesc.js';

export { generateExercise, type GenerateInput, type GeneratedExercise } from './generator.js';
export { SKILLS, SKILL_BY_ID } from './skills.js';
export { LABS, LAB_BY_ID } from './labs.js';
export { LEVELS, MODULES, PLANNED_LESSONS } from './roadmap.js';

/**
 * The assembled content graph.
 *
 * Lessons come in three honest states. `ready` means authored theory, a live
 * lab and graded missions. `theory-only` means authored theory and interactive
 * blocks, with no lab yet — real teaching material, and the roadmap says so.
 * `planned` means an outline and nothing more, and cannot be entered.
 * `validateCurriculum` runs over the whole graph at load time, so a broken
 * reference fails fast rather than surfacing as a confusing runtime error.
 */

/** Lessons with a live lab and graded missions. */
const READY_LESSONS: Lesson[] = [brokenAccessControlLesson, sqlInjectionLesson, linuxPrivescLesson];

/**
 * Lessons with full authored theory and interactive blocks, but no lab yet.
 *
 * They are complete teaching material — diagrams, playgrounds, quizzes — and
 * they complete by being read and answered, not by a graded mission. Keeping
 * them in their own list is what lets the roadmap tell the truth about which
 * kind of lesson you are about to open.
 */
const THEORY_LESSONS: Lesson[] = [
  howInternetWorksLesson,
  tcpIpLesson,
  dnsLesson,
  portsSocketsLesson,
  natFirewallLesson,
  httpLesson,
  cryptoLesson,
  linuxShellLesson,
  linuxPermissionsLesson,
  httpCookiesLesson,
  commandInjectionLesson,
  xssLesson,
  csrfLesson,
  ssrfLesson,
];

export const LESSONS: Lesson[] = [...READY_LESSONS, ...THEORY_LESSONS, ...PLANNED_LESSONS];

export const EXERCISES: Exercise[] = [
  ...brokenAccessControlExercises,
  ...sqlInjectionExercises,
  ...linuxPrivescExercises,
];

export const COURSE: Course = {
  id: 'course.cyberlab',
  title: 'CyberLab',
  description:
    'Un percorso completo di cybersecurity ed ethical hacking, dalle fondamenta al red e blue team, imparato dentro un ambiente da IDE con laboratori realmente eseguibili.',
  levels: LEVELS.map((l) => l.id),
};

export const CONTENT_GRAPH: ContentGraph = {
  levels: LEVELS,
  modules: MODULES,
  lessons: LESSONS,
  exercises: EXERCISES,
  labs: LABS,
  skills: SKILLS,
};

// Sorted, index-friendly accessors.
const LESSON_MAP = new Map<LessonId, Lesson>(LESSONS.map((l) => [l.id, l]));
const MODULE_MAP = new Map(MODULES.map((m) => [m.id, m]));
const LEVEL_OF_MODULE = new Map(MODULES.map((m) => [m.id, m.levelId]));
const EXERCISE_MAP = new Map(EXERCISES.map((e) => [e.id, e]));
const LAB_MAP = new Map(LABS.map((l) => [l.id, l]));
const SKILL_MAP = new Map(SKILLS.map((s) => [s.id, s]));

export function getLesson(id: string): Lesson | undefined {
  return LESSON_MAP.get(id);
}
export function getModule(id: string): Module | undefined {
  return MODULE_MAP.get(id);
}
export function getExercise(id: string): Exercise | undefined {
  return EXERCISE_MAP.get(id);
}
export function getExercisesForLesson(lessonId: string): Exercise[] {
  const lesson = LESSON_MAP.get(lessonId);
  if (!lesson) return [];
  return lesson.exercises.map((id) => EXERCISE_MAP.get(id)).filter((e): e is Exercise => Boolean(e));
}
export function getLab(id: string): LabSpec | undefined {
  return LAB_MAP.get(id);
}
export function getSkill(id: string): Skill | undefined {
  return SKILL_MAP.get(id);
}
export function levelIdForLesson(lessonId: string): string | undefined {
  const lesson = LESSON_MAP.get(lessonId);
  return lesson ? LEVEL_OF_MODULE.get(lesson.moduleId) : undefined;
}
export function levelIdForModule(moduleId: string): string | undefined {
  return LEVEL_OF_MODULE.get(moduleId);
}

/** Position of a lesson within its module, for the "Lesson 4 / 12" header. */
export function lessonPosition(lessonId: string): { index: number; total: number } {
  const lesson = LESSON_MAP.get(lessonId);
  const module = lesson ? MODULE_MAP.get(lesson.moduleId) : undefined;
  if (!lesson || !module) return { index: 0, total: 0 };
  const index = module.lessons.indexOf(lessonId);
  return { index: index + 1, total: module.lessons.length };
}

/** The roadmap payload for the web app (no heavy lesson content). */
export function buildCurriculumIndex(): CurriculumIndex {
  return {
    course: COURSE,
    levels: LEVELS,
    modules: MODULES,
    lessons: LESSONS.map((lesson) => {
      const levelId = LEVEL_OF_MODULE.get(lesson.moduleId) ?? '';
      return toLessonSummary(lesson, levelId);
    }),
  };
}

let cachedReport: IntegrityReport | null = null;

/** Validate the content graph. Cached, because it never changes at runtime. */
export function validate(): IntegrityReport {
  cachedReport ??= validateCurriculum(CONTENT_GRAPH);
  return cachedReport;
}

/** Throw if the curriculum is broken. Called by the server at boot. */
export function assertValidCurriculum(): IntegrityReport {
  const report = validate();
  if (!report.ok) {
    throw new Error(
      `Curriculum integrity check failed with ${report.errors.length} error(s):\n` +
        report.errors.map((e) => `  - ${e}`).join('\n'),
    );
  }
  return report;
}
