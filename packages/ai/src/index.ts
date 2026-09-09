/**
 * @cyberlab/ai — the tutor layer.
 *
 * A provider-agnostic tutor with real, mode-aware prompting, structured lesson
 * context, and a deterministic offline fallback that keeps the tutor useful
 * with no model at all.
 */

export * from './provider.js';
export { OllamaProvider, type OllamaConfig } from './providers/ollama.js';
export { GeminiProvider, type GeminiConfig } from './providers/gemini.js';
export { OfflineProvider, compose } from './offline.js';
export { buildPrompt, renderContext } from './prompt.js';
export { TutorService, type TutorServiceOptions, type AssembleContextInput } from './tutor.js';

import type { AiProvider } from './provider.js';
import { OllamaProvider } from './providers/ollama.js';
import { GeminiProvider } from './providers/gemini.js';
import { OfflineProvider } from './offline.js';
import type { TutorContext } from '@cyberlab/core';

export type ProviderKind = 'ollama' | 'gemini' | 'offline';

export interface ProviderConfig {
  kind: ProviderKind;
  ollama?: { baseUrl: string; model: string; keepAlive?: string };
  gemini?: { apiKey: string; model: string; baseUrl?: string };
  /** Context accessor for the offline provider. */
  offlineContext?: () => TutorContext | null;
}

/** Build the configured provider. Falls back to offline if config is missing. */
export function createProvider(config: ProviderConfig): AiProvider {
  switch (config.kind) {
    case 'ollama':
      if (!config.ollama) return new OfflineProvider(config.offlineContext ?? (() => null));
      return new OllamaProvider(config.ollama);
    case 'gemini':
      if (!config.gemini?.apiKey) return new OfflineProvider(config.offlineContext ?? (() => null));
      return new GeminiProvider(config.gemini);
    case 'offline':
    default:
      return new OfflineProvider(config.offlineContext ?? (() => null));
  }
}
