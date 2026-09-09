/**
 * @cyberlab/lab-engine
 *
 * Two things: a pluggable `LabRuntime` boundary, and a set of genuinely
 * vulnerable target worlds that execute for real behind it. The server talks to
 * `LabManager`; everything below that is swappable.
 */

export * from './runtime.js';
export * from './manager.js';
export { Rng, randomSeed, hashSeed } from './rng.js';

export { InProcessRuntime } from './inproc/runtime.js';
export { DockerRuntime, type DockerRuntimeOptions } from './docker/runtime.js';

export { SqlEngine } from './inproc/sql.js';
export { Vfs, modeString } from './inproc/vfs.js';
export type { TargetBuilder, LabTarget, TargetContext } from './inproc/target.js';
export { ALL_BUILDERS, vaultBuilder, injectionBuilder, footholdBuilder } from './inproc/targets/index.js';
export { SEBA_ID } from './inproc/targets/vault.js';
