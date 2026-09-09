/**
 * Identifier aliases.
 *
 * These are deliberately plain `string` aliases rather than branded types.
 * Branding would make authoring curriculum content painful (every literal would
 * need a cast) while catching only a narrow class of mistake. Instead, every
 * cross-reference in the content graph is checked at load time by
 * `validateCurriculum()` in `integrity.ts`, which catches the same errors *and*
 * dangling references that a type system cannot see.
 */

export type SkillId = string;
export type LevelId = string;
export type ModuleId = string;
export type LessonId = string;
export type ExerciseId = string;
export type LabSpecId = string;
export type HintId = string;
export type CriterionId = string;
export type BadgeId = string;
export type UserId = string;
export type AttemptId = string;
export type LabInstanceId = string;

/** Stable, human-readable id shape used across the content graph. */
export const ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

export function isValidId(value: string): boolean {
  return ID_PATTERN.test(value);
}
