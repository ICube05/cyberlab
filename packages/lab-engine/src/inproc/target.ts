import type {
  FsEntry,
  LabInspectView,
  LabLogEntry,
  LabSpec,
  LabSurface,
  ShellResultView,
  SqlResultView,
} from '@cyberlab/core';
import type { Rng } from '../rng.js';
import type { TargetHttpRequest, TargetHttpResponse } from './http.js';

/**
 * A lab target is a small, self-contained, deliberately broken world.
 *
 * The contract is intentionally narrow. A target answers requests, runs shell
 * commands, executes SQL, and — crucially — *narrates itself* through
 * `ctx.signal()` whenever one of its own security invariants is violated.
 *
 * That last part is what makes grading honest. A target knows when it has just
 * returned another user's row; the evaluator does not have to guess from the
 * response body.
 */
export interface LabTarget {
  readonly surfaces: readonly LabSurface[];

  http?(req: TargetHttpRequest, ctx: TargetContext): TargetHttpResponse;
  shell?(command: string, ctx: TargetContext): ShellResultView;
  sql?(sql: string, ctx: TargetContext): SqlResultView;

  files?: {
    list(path: string, ctx: TargetContext): FsEntry[];
    read(path: string, ctx: TargetContext): string;
    write?(path: string, content: string, ctx: TargetContext): void;
  };

  /** Read-only windows onto the target's internals, for the lab side panels. */
  inspect(what: 'database' | 'sessions' | 'logs' | 'files', ctx: TargetContext): LabInspectView;

  /** Prompt context for the terminal surface. */
  shellContext?(): { user: string; host: string; cwd: string };

  /** Everything mutable, as a JSON-serialisable value. Used for snapshots. */
  serialize(): unknown;
  deserialize(data: unknown): void;

  dispose?(): void;
}

/** Services the engine hands to a target on every call. */
export interface TargetContext {
  readonly seed: string;
  readonly rng: Rng;
  /** Monotonic virtual clock. Targets never read the wall clock directly. */
  now(): number;
  /**
   * Raise a semantic marker. The name is a stable dotted string that exercise
   * criteria match on, e.g. `authz.horizontal.bypass`.
   */
  signal(name: string, data?: Record<string, unknown>): void;
  log(level: LabLogEntry['level'], source: string, message: string, data?: Record<string, unknown>): void;
  captureFlag(value: string): void;
  /** Whether the learner has already found this flag, for idempotent scoring. */
  hasFlag(value: string): boolean;
}

export interface TargetBuilder {
  /** Matches `LabSpec.builderId`. */
  id: string;
  description: string;
  build(spec: LabSpec, ctx: TargetContext): LabTarget;
}

/** Concrete context, owned by the lab instance. */
export class LabTargetContext implements TargetContext {
  readonly signals: { name: string; at: number; seq: number; data?: Record<string, unknown> }[] = [];
  readonly logs: LabLogEntry[] = [];
  readonly flags: string[] = [];
  /** Signals raised while handling the current action. */
  currentActionSignals: string[] = [];

  #clock: number;
  #seq = 0;

  constructor(
    readonly seed: string,
    readonly rng: Rng,
    startTime = 1_700_000_000_000,
  ) {
    this.#clock = startTime;
  }

  /** Advance the virtual clock. Called by the instance between actions. */
  tick(ms = 137): void {
    this.#clock += ms;
  }

  setSeq(seq: number): void {
    this.#seq = seq;
    this.currentActionSignals = [];
  }

  now(): number {
    return this.#clock;
  }

  signal(name: string, data?: Record<string, unknown>): void {
    this.signals.push({
      name,
      at: this.now(),
      seq: this.#seq,
      ...(data ? { data } : {}),
    });
    if (!this.currentActionSignals.includes(name)) this.currentActionSignals.push(name);
  }

  log(
    level: LabLogEntry['level'],
    source: string,
    message: string,
    data?: Record<string, unknown>,
  ): void {
    this.logs.push({
      at: this.now(),
      level,
      source,
      message,
      ...(data ? { data } : {}),
    });
    // Labs are small; a hard cap keeps memory bounded even under a fuzzing run.
    if (this.logs.length > 2000) this.logs.splice(0, this.logs.length - 2000);
  }

  captureFlag(value: string): void {
    if (!this.flags.includes(value)) {
      this.flags.push(value);
      this.signal('flag.captured', { flag: value });
    }
  }

  hasFlag(value: string): boolean {
    return this.flags.includes(value);
  }

  clear(): void {
    this.signals.length = 0;
    this.logs.length = 0;
    this.flags.length = 0;
    this.currentActionSignals = [];
  }
}

export type BuilderRegistry = Map<string, TargetBuilder>;

export function createRegistry(builders: readonly TargetBuilder[]): BuilderRegistry {
  const map: BuilderRegistry = new Map();
  for (const builder of builders) {
    if (map.has(builder.id)) throw new Error(`Duplicate target builder id: ${builder.id}`);
    map.set(builder.id, builder);
  }
  return map;
}
