import type { LabAction, LabActionResult, LabEvent, LabSpec, LabState } from '@cyberlab/core';
import type { LabInstance, LabRuntime } from './runtime.js';
import { LabError } from './runtime.js';
import { randomSeed } from './rng.js';

/**
 * Owns the set of live labs.
 *
 * Responsibilities: create/reset/dispose instances, enforce a per-user cap so a
 * single learner cannot spawn an unbounded number of worlds, and reap idle labs
 * on a timer so memory does not grow without bound. The manager is
 * runtime-agnostic — it holds a `LabRuntime`, so the same lifecycle logic works
 * for in-process and Docker.
 */
export interface LabManagerOptions {
  runtime: LabRuntime;
  specs: readonly LabSpec[];
  maxInstancesPerUser?: number;
  idleTtlMs?: number;
  actionTimeoutMs?: number;
  /** Injectable for tests. */
  now?: () => number;
}

interface Entry {
  instance: LabInstance;
  userId: string;
  createdAt: number;
}

export class LabManager {
  readonly #runtime: LabRuntime;
  readonly #specs: Map<string, LabSpec>;
  readonly #instances = new Map<string, Entry>();
  readonly #maxPerUser: number;
  readonly #idleTtlMs: number;
  readonly #actionTimeoutMs: number;
  readonly #now: () => number;
  #counter = 0;

  constructor(options: LabManagerOptions) {
    this.#runtime = options.runtime;
    this.#specs = new Map(options.specs.map((s) => [s.id, s]));
    this.#maxPerUser = options.maxInstancesPerUser ?? 6;
    this.#idleTtlMs = options.idleTtlMs ?? 30 * 60_000;
    this.#actionTimeoutMs = options.actionTimeoutMs ?? 4000;
    this.#now = options.now ?? Date.now;
  }

  get runtimeKind(): string {
    return this.#runtime.kind;
  }

  specs(): LabSpec[] {
    return [...this.#specs.values()];
  }

  spec(specId: string): LabSpec | undefined {
    return this.#specs.get(specId);
  }

  async create(userId: string, specId: string, seed?: string): Promise<LabState> {
    const spec = this.#specs.get(specId);
    if (!spec) throw new LabError(`Unknown lab spec "${specId}"`, 'unknown_target');

    const userInstances = [...this.#instances.values()].filter((e) => e.userId === userId);
    if (userInstances.length >= this.#maxPerUser) {
      // Evict the least-recently-used lab belonging to this user.
      const lru = userInstances.sort((a, b) => a.instance.lastUsedAt - b.instance.lastUsedAt)[0];
      if (lru) await this.dispose(lru.instance.id);
    }

    const instanceId = `lab_${this.#now().toString(36)}_${(this.#counter += 1).toString(36)}`;
    const resolvedSeed = seed && seed.length > 0 ? seed : spec.seedable ? randomSeed() : spec.id;
    const instance = await this.#runtime.create(spec, {
      instanceId,
      seed: resolvedSeed,
      actionTimeoutMs: this.#actionTimeoutMs,
    });
    this.#instances.set(instanceId, { instance, userId, createdAt: this.#now() });
    return instance.getState();
  }

  #entry(userId: string, instanceId: string): Entry {
    const entry = this.#instances.get(instanceId);
    if (!entry) throw new LabError(`Lab ${instanceId} not found (it may have been reset or expired).`, 'disposed');
    if (entry.userId !== userId) throw new LabError('That lab belongs to another session.', 'blocked');
    return entry;
  }

  getState(userId: string, instanceId: string): LabState {
    return this.#entry(userId, instanceId).instance.getState();
  }

  getSpec(instanceId: string): LabSpec | undefined {
    const entry = this.#instances.get(instanceId);
    return entry ? this.#specs.get(entry.instance.specId) : undefined;
  }

  async dispatch(
    userId: string,
    instanceId: string,
    action: LabAction,
  ): Promise<{ result: LabActionResult; state: LabState; event: LabEvent }> {
    const entry = this.#entry(userId, instanceId);
    const result = await entry.instance.dispatch(action);
    const transcript = entry.instance.getTranscript();
    const event = transcript[transcript.length - 1]!;
    return { result, state: entry.instance.getState(), event };
  }

  transcript(userId: string, instanceId: string): LabEvent[] {
    return this.#entry(userId, instanceId).instance.getTranscript();
  }

  async reset(userId: string, instanceId: string): Promise<LabState> {
    const entry = this.#entry(userId, instanceId);
    entry.instance.reset();
    return entry.instance.getState();
  }

  async dispose(instanceId: string): Promise<void> {
    const entry = this.#instances.get(instanceId);
    if (!entry) return;
    this.#instances.delete(instanceId);
    await entry.instance.dispose();
  }

  async disposeForUser(userId: string): Promise<void> {
    const ids = [...this.#instances.entries()]
      .filter(([, e]) => e.userId === userId)
      .map(([id]) => id);
    for (const id of ids) await this.dispose(id);
  }

  /** Called on a timer by the server. Returns the number of labs reaped. */
  async reapIdle(): Promise<number> {
    const cutoff = this.#now() - this.#idleTtlMs;
    const stale = [...this.#instances.entries()].filter(([, e]) => e.instance.lastUsedAt < cutoff);
    for (const [id] of stale) await this.dispose(id);
    return stale.length;
  }

  count(): number {
    return this.#instances.size;
  }

  async shutdown(): Promise<void> {
    for (const id of [...this.#instances.keys()]) await this.dispose(id);
    await this.#runtime.shutdown();
  }
}
