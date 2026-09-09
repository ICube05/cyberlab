# Architecture

CyberLab is a pnpm monorepo split into pure-domain packages and two apps. The
guiding rule: **the domain is pure and shared, execution is pluggable, and the
server is the single authority on what actually happened.**

```
┌──────────────────────────────────────────────────────────────────────┐
│                          apps/web  (React IDE)                         │
│   roadmap · lesson (theory as data) · live lab · mission · AI tutor    │
└───────────────────────────────┬──────────────────────────────────────┘
                                 │ typed HTTP + SSE  (contracts in @cyberlab/core)
┌───────────────────────────────▼──────────────────────────────────────┐
│                        apps/server  (Fastify)                          │
│   routes · progress engine · evaluation · lab orchestration · tutor    │
└───────┬───────────────┬───────────────┬───────────────┬───────────────┘
        │               │               │               │
┌───────▼──────┐ ┌──────▼───────┐ ┌─────▼──────┐ ┌──────▼───────┐
│ @cyberlab/   │ │ @cyberlab/   │ │ @cyberlab/ │ │ @cyberlab/   │
│    core      │ │  lab-engine  │ │     ai     │ │  curriculum  │
│  (pure)      │ │              │ │            │ │  (content)   │
│ model,       │ │ LabRuntime:  │ │ providers, │ │ skills,      │
│ mastery,     │ │  • in-proc   │ │ prompt,    │ │ lessons,     │
│ evaluation,  │ │  • docker    │ │ offline,   │ │ exercises,   │
│ planner, xp  │ │ targets, sql │ │ tutor svc  │ │ labs, gen    │
└──────────────┘ └──────────────┘ └────────────┘ └──────────────┘
```

## The packages

### `@cyberlab/core` — the shared language
Pure TypeScript: **no Node built-ins, no fetch, no DOM.** It is imported by the
server *and* the browser, which is the single most important architectural
decision in the project. Because grading, mastery and progression are pure
functions here, the server can grade authoritatively and the browser can preview
the same grade with zero duplicated logic.

Contents:
- **Domain types** — `Skill`, `Lesson`, `Exercise`, `LabSpec`, `Criterion`, the content graph.
- **`mastery.ts`** — a deterministic Beta-Bernoulli competence model with time decay (see below).
- **`evaluation.ts`** — the rule DSL and the pure `evaluate()` function.
- **`planner.ts`** — the progression gate and the adaptive recommender.
- **`xp.ts`, `progress.ts`** — levelling and the durable progress shape.
- **`integrity.ts`** — validates the whole content graph at boot.
- **`api.ts`** — the HTTP contract, with zod schemas re-exported to the client.

### `@cyberlab/lab-engine` — real execution behind a pluggable boundary
A `LabRuntime` interface with two implementations. `InProcessRuntime` (default)
runs labs as real code — a private in-memory SQLite DB, a virtual filesystem
with enforced permissions, a socket-less HTTP router. `DockerRuntime` is the
growth path for real binaries. The server talks only to `LabManager`; swapping
runtimes changes nothing above it. See [`LAB_ENGINE.md`](LAB_ENGINE.md).

### `@cyberlab/ai` — the tutor, provider-agnostic
An `AiProvider` interface (Ollama, Gemini, and a deterministic Offline provider)
behind a `TutorService` that assembles structured context and streams replies.
Modes change *what context is assembled*, not just the prompt suffix. See
[`AI_TUTOR.md`](AI_TUTOR.md).

### `@cyberlab/curriculum` — content as data
Skills, the 11-level roadmap, lab specs, fully-interactive lessons, graded
exercises, and the exercise generator. Everything is validated by
`assertValidCurriculum()` at server start. See [`CURRICULUM.md`](CURRICULUM.md).

### `apps/server` — the authority
Fastify. Owns the SQLite progress store, orchestrates labs, runs the
authoritative evaluation, and streams the tutor. The browser sends *actions*,
never results.

### `apps/web` — the IDE
React 19 + Zustand + Tailwind v4 + xterm.js. One store, sliced by concern. Theory
is rendered from data blocks; the lab surfaces (request editor, terminal, SQL
console, file explorer, DB viewer, log viewer) are dictated by the lab spec.

## Three decisions worth calling out

### 1. The transcript is the source of truth
Every lab action is appended to an ordered transcript, and the target raises
**semantic signals** about its own security invariants (`authz.check.skipped`,
`sqli.auth-bypass`). Grading, tutoring and progression all read this transcript.
Consequences:
- Grading is a **pure function** of `(exercise, transcript, signals, state, report)` — fully unit-testable, reproducible, runnable on both server and client.
- The tutor is grounded in what the learner *actually did*, not a generic script.
- We never grade by string-matching a payload, so any valid technique scores.

### 2. Competence is four numbers, not one
Each `(skill, dimension)` pair — theory / recognition / exploitation / mitigation
— is tracked as Beta evidence `(α, β)` with time decay. This buys **confidence**
as well as value (3/4 ≠ 75/100), lets a mission say "you exploited it but can't
explain the fix", and gives the planner something honest to gate on. XP exists
but never gates progression — mastery does.

### 3. The roadmap is complete but honest
All 11 levels are visible because a learner deserves the whole map. But a lesson
that is only an outline is marked `planned` and rendered as a non-enterable
preview; a `ready` lesson has theory, a lab and graded exercises, enforced by the
integrity checker. Nothing pretends to be built that isn't.

## Request lifecycles

**Running a lab action**
```
UI action → POST /api/labs/:id/actions
          → LabManager.dispatch → InProcLabInstance.dispatch
          → target handles it (real HTTP/SQL/shell), raises signals
          → transcript appended, state returned
          → server computes a live objective preview for the active attempt
          → UI updates lab state + ticks objectives
```

**Grading an attempt**
```
UI submit → POST /api/attempts/:id/submit
          → server gathers the authoritative transcript + signals + state
          → evaluate()  (pure, in @cyberlab/core)
          → ProgressService.applyEvaluation:
              observe() mastery · award XP · recompute lesson states · grant badges
          → returns evaluation + mastery deltas + unlocked lessons + new badges
          → UI shows MISSION COMPLETE, animates mastery, fires toasts
```

**Asking the tutor**
```
UI mode/question → POST /api/tutor  (SSE)
                 → TutorService.assembleContext (lesson, exercise w/ sealed hints,
                   live lab transcript, learner mastery)
                 → provider.stream → tokens streamed back as SSE deltas
                 → on provider failure, transparent fallback to the offline tutor
```

## Data flow of types

`@cyberlab/core` defines a type once; the server produces it and the client
consumes it. Request bodies are validated with zod at the edge using the *same*
schema the client imports. There is no code generation and no drift.

## Where state lives

- **Durable**: user progress (mastery evidence, XP, lessons, badges) → SQLite, one JSON document per user.
- **Ephemeral**: labs → in memory, rebuilt from a seed, reaped when idle. Never persisted, so a lab change needs no migration.
- **Client**: a Zustand store; only lightweight UI conveniences touch `localStorage`.
