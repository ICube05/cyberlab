import {
  InProcessRuntime,
  DockerRuntime,
  LabManager,
  type LabRuntime,
} from '@cyberlab/lab-engine';
import { TutorService, createProvider, type ProviderKind } from '@cyberlab/ai';
import { LABS, assertValidCurriculum } from '@cyberlab/curriculum';
import type { TutorContext } from '@cyberlab/core';
import type { Config } from './config.js';
import { Store } from './store.js';
import { ProgressService } from './progress-service.js';

/**
 * Composition root.
 *
 * Everything is wired here so the routes receive ready services and never touch
 * construction. The two swappable pieces — the lab runtime and the AI provider
 * — are chosen from config, and both degrade gracefully: an unavailable Docker
 * runtime falls back to in-process, an unreachable provider falls back to the
 * offline tutor.
 */
export interface Services {
  config: Config;
  store: Store;
  progress: ProgressService;
  labs: LabManager;
  tutor: TutorService;
  runtimeDetail: string;
  aiProbe: { reachable: boolean; detail: string };
  /** The most recently assembled tutor context, read by the offline provider. */
  tutorContextRef: { current: TutorContext | null };
  dispose(): Promise<void>;
}

export async function buildServices(config: Config): Promise<Services> {
  const integrity = assertValidCurriculum();
  // eslint-disable-next-line no-console
  console.log(
    `[curriculum] ${integrity.stats.lessons} lessons (${integrity.stats.readyLessons} ready), ` +
      `${integrity.stats.exercises} exercises, ${integrity.stats.labs} labs, ${integrity.stats.skills} skills` +
      (integrity.warnings.length ? ` — ${integrity.warnings.length} warning(s)` : ''),
  );

  const store = new Store(config.dbPath);
  const progress = new ProgressService(store);

  // ── lab runtime ────────────────────────────────────────────────────────────
  let runtime: LabRuntime = new InProcessRuntime();
  let runtimeDetail: string;
  if (config.lab.runtime === 'docker') {
    const docker = new DockerRuntime({
      socketPath: config.lab.docker.socketPath,
      network: config.lab.docker.network,
      memoryMb: config.lab.docker.memoryMb,
      cpuShares: config.lab.docker.cpuShares,
    });
    const availability = await docker.isAvailable();
    if (availability.available) {
      runtime = docker;
      runtimeDetail = availability.detail;
    } else {
      runtime = new InProcessRuntime();
      runtimeDetail = `docker requested but unavailable → in-process. (${availability.detail})`;
      console.warn(`[lab] ${runtimeDetail}`);
    }
  } else {
    runtimeDetail = (await runtime.isAvailable()).detail;
  }

  const labs = new LabManager({
    runtime,
    specs: LABS,
    maxInstancesPerUser: config.lab.maxInstancesPerUser,
    idleTtlMs: config.lab.idleTtlMs,
    actionTimeoutMs: config.lab.actionTimeoutMs,
  });

  // ── AI provider ────────────────────────────────────────────────────────────
  const tutorContextRef: { current: TutorContext | null } = { current: null };
  const provider = createProvider({
    kind: config.ai.provider as ProviderKind,
    ollama: config.ai.ollama,
    gemini: config.ai.gemini,
    offlineContext: () => tutorContextRef.current,
  });
  const tutor = new TutorService({
    provider,
    locale: config.contentLocale,
    generation: {
      temperature: config.ai.temperature,
      maxTokens: config.ai.maxTokens,
      timeoutMs: config.ai.timeoutMs,
    },
  });
  const aiProbe = await tutor.probe();
  console.log(`[ai] provider=${tutor.providerName} model=${tutor.model} → ${aiProbe.detail}`);

  // Idle lab reaper.
  const reaper = setInterval(() => {
    labs.reapIdle().catch((error) => console.error('[lab] reap failed', error));
  }, 60_000);
  reaper.unref?.();

  return {
    config,
    store,
    progress,
    labs,
    tutor,
    runtimeDetail,
    aiProbe,
    tutorContextRef,
    async dispose() {
      clearInterval(reaper);
      await labs.shutdown();
      store.close();
    },
  };
}
