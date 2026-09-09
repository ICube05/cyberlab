import {
  ProviderError,
  fetchWithTimeout,
  ndjson,
  type AiProvider,
  type GenerationOptions,
  type RenderedPrompt,
} from '../provider.js';

/**
 * Ollama provider — local models, nothing leaves the machine.
 *
 * Uses the native `/api/chat` streaming endpoint (newline-delimited JSON) so we
 * keep Ollama's own prompt templating for whichever model is loaded.
 */
export interface OllamaConfig {
  baseUrl: string;
  model: string;
  keepAlive?: string;
}

export class OllamaProvider implements AiProvider {
  readonly name = 'ollama';
  readonly model: string;
  readonly #baseUrl: string;
  readonly #keepAlive: string;

  constructor(config: OllamaConfig) {
    this.#baseUrl = config.baseUrl.replace(/\/$/, '');
    this.model = config.model;
    this.#keepAlive = config.keepAlive ?? '10m';
  }

  async probe(): Promise<{ reachable: boolean; detail: string }> {
    try {
      const response = await fetchWithTimeout(`${this.#baseUrl}/api/tags`, { method: 'GET' }, 2500);
      if (!response.ok) return { reachable: false, detail: `Ollama returned HTTP ${response.status}` };
      const data = (await response.json()) as { models?: { name: string }[] };
      const names = (data.models ?? []).map((m) => m.name);
      const present = names.some((n) => n === this.model || n.startsWith(this.model.split(':')[0] ?? this.model));
      return {
        reachable: true,
        detail: present
          ? `Ollama up; model "${this.model}" available`
          : `Ollama up, but "${this.model}" is not pulled. Run: ollama pull ${this.model}`,
      };
    } catch (error) {
      return {
        reachable: false,
        detail: error instanceof ProviderError ? error.message : `Ollama unreachable at ${this.#baseUrl}`,
      };
    }
  }

  async *stream(prompt: RenderedPrompt, options: GenerationOptions): AsyncIterable<string> {
    const body = {
      model: this.model,
      stream: true,
      keep_alive: this.#keepAlive,
      options: { temperature: options.temperature, num_predict: options.maxTokens },
      messages: [
        { role: 'system', content: prompt.system },
        ...prompt.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    };

    const response = await fetchWithTimeout(
      `${this.#baseUrl}/api/chat`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
      options.timeoutMs,
      options.signal,
    );
    if (!response.ok) {
      const detail = await safeText(response);
      throw new ProviderError(`Ollama HTTP ${response.status}: ${detail}`, 'http', response.status >= 500);
    }

    for await (const message of ndjson(response)) {
      const chunk = message as { message?: { content?: string }; done?: boolean; error?: string };
      if (chunk.error) throw new ProviderError(`Ollama error: ${chunk.error}`, 'http', false);
      const text = chunk.message?.content;
      if (text) yield text;
      if (chunk.done) break;
    }
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 200);
  } catch {
    return '(no body)';
  }
}
