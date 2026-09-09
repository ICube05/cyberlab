# The AI Tutor

The tutor is the heart of the app, and it is deliberately **not a generic
chatbot bolted on the side**. It opens with the lesson already loaded, its modes
change what the server assembles as context, it streams token by token, and it
is never dead — with no provider configured it answers from the lesson's
authored pedagogy.

## Modes

Each mode changes *what context is assembled and what the model may reveal*, not
just a prompt suffix.

| mode | what it does | needs a lab? |
|---|---|---|
| `teach` | explain the concept from fundamentals | no |
| `hint` | one nudge — bounded by the authored hint ladder, **never the solution** | yes |
| `review` | analyse what you actually did in the lab | yes |
| `challenge` | propose a harder variant | no |
| `explain` | why did that work? (the mechanism, keyed on real signals) | yes |
| `ask` | open question, answered with lesson + lab context | no |
| `debug` | your attempt didn't work — expected vs actual, from the transcript | yes |

## The single most important guardrail

In `hint` mode the model is handed the *revealed* hints and the *next sealed*
hint to aim at — **the solution is simply not in the context.** A chatty model
cannot leak what it was never given. This is enforced in `prompt.ts` and covered
by a test (`tutor.test.ts` → "NEVER leaks the solution in hint mode"):

```ts
if (mode === 'hint' && exercise.nextHint)
  lines.push(`Prossimo livello di hint da NON superare: (${lvl}) ${text}`);
if (mode !== 'hint' && exercise.solution)      // solution only outside hint mode
  lines.push(`Soluzione: … Spiegazione: …`);
```

## Structured context, not everything-in-the-prompt

`TutorService.assembleContext()` builds a typed `TutorContext` from real state:

- the **lesson** (objectives, skills, a plain-text digest of the theory you've reached, and the exact block you're looking at);
- the **exercise** (objective checklist with live pass/fail, revealed hints, the next sealed hint, and — outside hint mode — the solution for after-the-fact explanation);
- the **lab** (recent transcript events compacted, the signals raised, flags captured);
- the **learner** (level, per-skill mastery, weak/strong skills, recent failures).

The prompt template renders this to compact text, so the exact context is
loggable, diffable and testable. The learner can even be shown "what the tutor
can see".

## Providers

An `AiProvider` turns a rendered prompt into a stream of text and knows nothing
about lessons. Three implementations ship:

### Offline (default) — deterministic, always works
`OfflineProvider` composes the exercise's authored hints/solution/explanation
against the learner's real transcript and evaluation. It cannot free-form, but it
never lies and never leaks a solution in hint mode. `explain` even keys its
mechanism description on the real signals (`authz.horizontal.bypass` →
"the server used the id you supplied and never compared it to your session…").

### Ollama — local models, nothing leaves the machine
```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:14b-instruct
```
Uses the native `/api/chat` streaming endpoint. `/api/health` reports whether the
model is pulled.

### Gemini — Google Generative Language API
```env
AI_PROVIDER=gemini
GEMINI_API_KEY=your-key
GEMINI_MODEL=gemini-2.5-flash
```
Uses `streamGenerateContent?alt=sse`. Safety thresholds are set to the lowest
non-off level the API allows, because offensive-security education constantly
trips naive filters; the platform's own scope guardrails live in the system
prompt.

## Resilience

If a live provider is unreachable or errors mid-stream, `TutorService` falls back
transparently to the offline tutor and labels the reply `offline` — a flaky
Ollama never leaves the learner staring at nothing. The provider is probed at
boot and the result shown on `/api/health` and in the status bar.

## Adding a provider

Implement `AiProvider` (`name`, `model`, `probe()`, `stream()`), then add it to
the factory in `packages/ai/src/index.ts`:

```ts
export interface AiProvider {
  readonly name: string;
  readonly model: string;
  probe(): Promise<{ reachable: boolean; detail: string }>;
  stream(prompt: RenderedPrompt, opts: GenerationOptions): AsyncIterable<string>;
}
```

`fetchWithTimeout`, `sseLines` and `ndjson` helpers in `provider.ts` cover the
common streaming plumbing. An OpenAI-compatible provider (for LM Studio, vLLM,
etc.) is a ~40-line addition against `/v1/chat/completions`.

## Transport

The tutor streams over **SSE** (`POST /api/tutor`), because `EventSource` can't
POST a body. The client reads the stream manually (`streamTutor` in `api.ts`) and
dispatches `meta` / `delta` / `done` / `error` events. A non-streaming
`/api/tutor/once` exists for tests.
