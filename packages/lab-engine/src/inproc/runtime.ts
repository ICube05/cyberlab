import type { LabSpec } from '@cyberlab/core';
import type { CreateOptions, LabInstance, LabRuntime } from '../runtime.js';
import { LabError } from '../runtime.js';
import { createRegistry, type BuilderRegistry, type TargetBuilder } from './target.js';
import { InProcLabInstance } from './instance.js';
import { ALL_BUILDERS } from './targets/index.js';

/**
 * The default runtime.
 *
 * Labs run as real code inside this process, inside the sandboxes each target
 * establishes (a private in-memory SQLite database, a virtual filesystem, a
 * request router that never binds a socket). No containers, no daemon, no
 * network — which is exactly why it is the default: the platform works the
 * moment it is cloned, and every offensive technique in the vertical slice is
 * genuinely executable.
 *
 * Its ceiling is real binaries (reverse engineering, live malware). That is
 * what `DockerRuntime` is for, and swapping to it changes nothing above this
 * interface.
 */
export class InProcessRuntime implements LabRuntime {
  readonly kind = 'inproc' as const;
  readonly #registry: BuilderRegistry;

  constructor(builders: readonly TargetBuilder[] = ALL_BUILDERS) {
    this.#registry = createRegistry(builders);
  }

  async isAvailable(): Promise<{ available: boolean; detail: string }> {
    return {
      available: true,
      detail: `in-process runtime with ${this.#registry.size} target builder(s)`,
    };
  }

  knownBuilders(): string[] {
    return [...this.#registry.keys()];
  }

  async create(spec: LabSpec, options: CreateOptions): Promise<LabInstance> {
    if (!this.#registry.has(spec.builderId)) {
      throw new LabError(
        `Unknown target builder "${spec.builderId}". Known: ${this.knownBuilders().join(', ')}`,
        'unknown_target',
      );
    }
    return new InProcLabInstance({
      id: options.instanceId,
      spec,
      seed: options.seed,
      registry: this.#registry,
      ...(options.actionTimeoutMs !== undefined ? { actionTimeoutMs: options.actionTimeoutMs } : {}),
    });
  }

  async shutdown(): Promise<void> {
    // Instances are owned and disposed by the LabManager; nothing process-wide
    // to tear down here.
  }
}
