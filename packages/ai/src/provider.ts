import type { TutorMode } from '@cyberlab/core';

/**
 * The provider boundary.
 *
 * A provider turns a rendered prompt into a stream of text. It knows nothing
 * about lessons, modes or mastery — that reasoning happens above it, in the
 * tutor, so swapping Ollama for Gemini (or adding a third) changes nothing but
 * one small class.
 */
export interface AiProvider {
  readonly name: string;
  readonly model: string;
  /** Cheap reachability probe, surfaced on /api/health. */
  probe(): Promise<{ reachable: boolean; detail: string }>;
  /**
   * Stream a completion. Implementations must respect `signal` for cancellation
   * and must yield plain text deltas (no protocol framing).
   */
  stream(prompt: RenderedPrompt, options: GenerationOptions): AsyncIterable<string>;
}

export interface RenderedPrompt {
  system: string;
  /** Alternating turns, oldest first. The final turn is always the user's. */
  messages: { role: 'user' | 'assistant'; content: string }[];
}

export interface GenerationOptions {
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  signal?: AbortSignal;
  /** The mode is passed through for provider-side logging only. */
  mode: TutorMode;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly kind: 'unreachable' | 'timeout' | 'http' | 'malformed' | 'aborted',
    readonly retriable: boolean,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

/** Shared fetch-with-timeout used by both HTTP providers. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
  const onExternalAbort = () => controller.abort(new Error('aborted'));
  externalSignal?.addEventListener('abort', onExternalAbort, { once: true });
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (externalSignal?.aborted) throw new ProviderError('Generation aborted by client.', 'aborted', false);
    if (error instanceof Error && error.message === 'timeout') {
      throw new ProviderError(`Provider did not respond within ${timeoutMs}ms.`, 'timeout', true);
    }
    throw new ProviderError(
      `Could not reach the AI provider: ${error instanceof Error ? error.message : String(error)}`,
      'unreachable',
      true,
    );
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

/** Parse Server-Sent-Events style `data:` lines out of a streaming body. */
export async function* sseLines(response: Response): AsyncIterable<string> {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index: number;
    while ((index = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line) yield line;
    }
  }
  if (buffer.trim()) yield buffer.trim();
}

/** Newline-delimited JSON, as Ollama streams it. */
export async function* ndjson(response: Response): AsyncIterable<unknown> {
  for await (const line of sseLines(response)) {
    try {
      yield JSON.parse(line);
    } catch {
      // Ollama occasionally flushes a partial line; skip and continue.
    }
  }
}
