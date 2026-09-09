import {
  ProviderError,
  fetchWithTimeout,
  sseLines,
  type AiProvider,
  type GenerationOptions,
  type RenderedPrompt,
} from '../provider.js';

/**
 * Google Gemini provider via the Generative Language API.
 *
 * Uses `streamGenerateContent` with `alt=sse`. The system prompt is passed as
 * `system_instruction`; history is mapped to Gemini's user/model roles.
 */
export interface GeminiConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export class GeminiProvider implements AiProvider {
  readonly name = 'gemini';
  readonly model: string;
  readonly #apiKey: string;
  readonly #baseUrl: string;

  constructor(config: GeminiConfig) {
    this.#apiKey = config.apiKey;
    this.model = config.model;
    this.#baseUrl = (config.baseUrl ?? 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
  }

  async probe(): Promise<{ reachable: boolean; detail: string }> {
    if (!this.#apiKey) return { reachable: false, detail: 'GEMINI_API_KEY is not set' };
    try {
      const response = await fetchWithTimeout(
        `${this.#baseUrl}/v1beta/models/${encodeURIComponent(this.model)}?key=${this.#apiKey}`,
        { method: 'GET' },
        3000,
      );
      if (response.status === 200) return { reachable: true, detail: `Gemini model "${this.model}" reachable` };
      if (response.status === 403 || response.status === 400) {
        return { reachable: false, detail: `Gemini rejected the API key (HTTP ${response.status})` };
      }
      if (response.status === 404) {
        return { reachable: false, detail: `Gemini model "${this.model}" not found for this key` };
      }
      return { reachable: false, detail: `Gemini returned HTTP ${response.status}` };
    } catch (error) {
      return {
        reachable: false,
        detail: error instanceof ProviderError ? error.message : 'Gemini unreachable',
      };
    }
  }

  async *stream(prompt: RenderedPrompt, options: GenerationOptions): AsyncIterable<string> {
    if (!this.#apiKey) throw new ProviderError('GEMINI_API_KEY is not set', 'http', false);

    const contents = prompt.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const body = {
      system_instruction: { parts: [{ text: prompt.system }] },
      contents,
      generationConfig: {
        temperature: options.temperature,
        maxOutputTokens: options.maxTokens,
      },
      safetySettings: SAFETY,
    };

    const url = `${this.#baseUrl}/v1beta/models/${encodeURIComponent(this.model)}:streamGenerateContent?alt=sse&key=${this.#apiKey}`;
    const response = await fetchWithTimeout(
      url,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
      options.timeoutMs,
      options.signal,
    );
    if (!response.ok) {
      const detail = await safeText(response);
      throw new ProviderError(`Gemini HTTP ${response.status}: ${detail}`, 'http', response.status >= 500);
    }

    for await (const line of sseLines(response)) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      let parsed: GeminiChunk;
      try {
        parsed = JSON.parse(payload) as GeminiChunk;
      } catch {
        continue;
      }
      const blocked = parsed.candidates?.[0]?.finishReason;
      if (blocked === 'SAFETY') {
        throw new ProviderError(
          'Gemini blocked this reply on safety grounds. Rephrase the request, or switch to a local model for offensive-security content.',
          'http',
          false,
        );
      }
      const text = parsed.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      if (text) yield text;
    }
  }
}

// Offensive-security education constantly trips naive safety filters. We relax
// them to the lowest non-off threshold the API allows; the platform's own
// scope guardrails live in the system prompt, not here.
const SAFETY = [
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
];

interface GeminiChunk {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 300);
  } catch {
    return '(no body)';
  }
}
