/**
 * @cyberlab/core — the shared language of the platform.
 *
 * Everything here is pure: no Node built-ins, no fetch, no DOM. The server, the
 * lab engine, the AI layer and the browser app all speak these types, which is
 * what makes it possible to grade an attempt on the server and preview the same
 * grade in the UI without a second implementation.
 */

export * from './ids.js';
export * from './skill.js';
export * from './mastery.js';
export * from './content.js';
export * from './curriculum.js';
export * from './lab.js';
export * from './exercise.js';
export * from './evaluation.js';
export * from './progress.js';
export * from './xp.js';
export * from './planner.js';
export * from './ai.js';
export * from './integrity.js';
export * from './api.js';
