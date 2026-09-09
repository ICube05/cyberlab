import type { LabSpec } from '@cyberlab/core';
import type { CreateOptions, LabInstance, LabRuntime } from '../runtime.js';
import { LabError } from '../runtime.js';

/**
 * The Docker runtime — the growth path, not yet the default.
 *
 * The in-process runtime covers everything the current curriculum needs
 * (web, SQL, shell) with real execution and zero dependencies. This runtime
 * exists for the labs that genuinely need a kernel and real binaries: reverse
 * engineering against an actual ELF, malware detonation, multi-host Active
 * Directory ranges.
 *
 * It is deliberately a *guarded* stub rather than a half-working implementation.
 * `isAvailable()` tells the truth — the server reports it on /api/health and
 * falls back to in-process — and `create()` refuses clearly instead of
 * pretending. The security contract it must honour when implemented is written
 * out in docs/LAB_ENGINE.md and enforced here as invariants:
 *
 *   1. every container joins an INTERNAL docker network (no egress);
 *   2. read-only rootfs plus a small tmpfs, dropped capabilities, no-new-privs;
 *   3. hard memory / pid / cpu limits;
 *   4. a per-instance name so the idle reaper can guarantee teardown.
 */
export interface DockerRuntimeOptions {
  socketPath: string;
  network: string;
  memoryMb: number;
  cpuShares: number;
}

export class DockerRuntime implements LabRuntime {
  readonly kind = 'docker' as const;
  readonly #options: DockerRuntimeOptions;

  constructor(options: DockerRuntimeOptions) {
    this.#options = options;
  }

  async isAvailable(): Promise<{ available: boolean; detail: string }> {
    // A real probe would ping the daemon over the socket. Until the runtime is
    // implemented we report unavailable so the server transparently falls back
    // to in-process rather than handing learners a broken lab.
    const socketReachable = await this.#pingDaemon();
    if (!socketReachable) {
      return {
        available: false,
        detail: `Docker socket ${this.#options.socketPath} not reachable; using the in-process runtime instead.`,
      };
    }
    return {
      available: false,
      detail:
        'Docker daemon reachable, but the Docker lab runtime is not implemented yet. See docs/LAB_ENGINE.md. Falling back to in-process.',
    };
  }

  async #pingDaemon(): Promise<boolean> {
    try {
      const { stat } = await import('node:fs/promises');
      await stat(this.#options.socketPath);
      return true;
    } catch {
      return false;
    }
  }

  async create(_spec: LabSpec, _options: CreateOptions): Promise<LabInstance> {
    throw new LabError(
      'The Docker lab runtime is not implemented yet. Set LAB_RUNTIME=inproc (the default). ' +
        'The implementation contract lives in docs/LAB_ENGINE.md.',
      'internal',
    );
  }

  async shutdown(): Promise<void> {
    // No containers to reap while unimplemented.
  }
}
