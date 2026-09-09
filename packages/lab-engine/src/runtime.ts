import type {
  LabAction,
  LabActionResult,
  LabEvent,
  LabSnapshot,
  LabSpec,
  LabState,
} from '@cyberlab/core';

/**
 * The runtime boundary.
 *
 * Everything above this interface — the server, the evaluator, the UI — is
 * runtime-agnostic. `InProcessRuntime` implements it with real code executing
 * in a sandboxed worker-less context; `DockerRuntime` implements it with real
 * containers. Adding a third (a firecracker VM, a remote lab farm) means
 * implementing these two interfaces and nothing else.
 */
export interface LabRuntime {
  readonly kind: 'inproc' | 'docker' | string;
  /** Cheap probe. The server calls this at boot and reports it on /api/health. */
  isAvailable(): Promise<{ available: boolean; detail: string }>;
  create(spec: LabSpec, options: CreateOptions): Promise<LabInstance>;
  /** Runtime-level teardown, called on server shutdown. */
  shutdown(): Promise<void>;
}

export interface CreateOptions {
  instanceId: string;
  seed: string;
  /** Wall-clock budget for a single action. */
  actionTimeoutMs?: number;
}

export interface LabInstance {
  readonly id: string;
  readonly specId: string;
  readonly seed: string;
  readonly spec: LabSpec;
  /** Epoch ms of the last dispatch, used by the idle reaper. */
  lastUsedAt: number;

  getState(): LabState;
  dispatch(action: LabAction): Promise<LabActionResult>;
  getTranscript(): LabEvent[];

  snapshot(): LabSnapshot;
  restore(snapshot: LabSnapshot): void;
  /** Back to t=0 with the same seed. Transcript is cleared. */
  reset(): void;
  dispose(): Promise<void>;
}

export class LabError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'unsupported_action'
      | 'unknown_target'
      | 'timeout'
      | 'disposed'
      | 'blocked'
      | 'internal',
  ) {
    super(message);
    this.name = 'LabError';
  }
}
