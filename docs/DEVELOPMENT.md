# Development

## Prerequisites

- **Node ≥ 22.5** — the labs use `node:sqlite`, which lands in 22.5. Check with `node --version`.
- **pnpm** — `npm install -g pnpm` (or Corepack: `corepack enable`).

## Layout

```
cyberlab/
├── packages/
│   ├── core/          # pure domain — model, mastery, evaluation, planner (no I/O)
│   ├── lab-engine/    # LabRuntime, in-process targets, SQL/VFS/shell sandboxes
│   ├── ai/            # tutor: providers, prompt, offline, TutorService
│   └── curriculum/    # skills, roadmap, lessons, exercises, labs, generator
├── apps/
│   ├── server/        # Fastify API, SQLite progress store, e2e walk
│   └── web/           # React IDE (Vite + Tailwind v4 + Zustand + xterm)
├── scripts/dev.mjs    # runs backend + web together
└── docs/
```

Packages import each other by name (`@cyberlab/core`) via pnpm workspaces, and
those names resolve **to TypeScript source** — there is no build step between
editing a package and using it. `tsx` (server) and Vite (web) run the source
directly.

## Everyday commands

```bash
pnpm install          # once
pnpm dev              # backend + web, one URL (http://localhost:5173)

pnpm dev:server       # just the API (Fastify on :5174, tsx watch)
pnpm dev:web          # just the web (Vite on :5173, proxies /api → :5174)

pnpm test             # vitest, all packages (48 tests)
pnpm test:watch       # vitest watch
pnpm e2e              # boots the server in-process and walks the whole journey
pnpm typecheck        # tsc --noEmit across every package
pnpm build            # production web bundle
pnpm start            # run the API (serve built assets separately, or use a reverse proxy)
```

## Configuration

Everything is environment-driven with safe defaults, so an empty `.env` boots a
fully working platform. Copy `.env.example` to `.env` and edit. Key switches:

| var | default | effect |
|---|---|---|
| `AI_PROVIDER` | `offline` | `ollama` \| `gemini` \| `offline` |
| `LAB_RUNTIME` | `inproc` | `inproc` \| `docker` (falls back to inproc if Docker is unavailable) |
| `CONTENT_LOCALE` | `it` | `it` \| `en` — tutor + lesson prose language |
| `CYBERLAB_DB` | `./apps/server/data/cyberlab.db` | `:memory:` for a throwaway session |
| `PORT` | `5174` | API port |

## Testing philosophy

The domain is pure, so it is heavily unit-tested:

- **`core/__tests__/mastery.test.ts`** — the competence model: monotonicity, determinism, decay, confidence floors.
- **`core/__tests__/evaluation.test.ts`** — the rule DSL and grading: required criteria, hint penalties on weight (not score), each rule type.
- **`core/__tests__/planner.test.ts`** — the progression gate and struggle detection.
- **`lab-engine/__tests__/labs.test.ts`** — the labs *actually executing*: IDOR + fix→403, real SQL injection, `sudo` privesc, reset determinism, isolation, and the SQL sandbox's deny-list.
- **`curriculum/__tests__/integrity.test.ts`** — the whole content graph validates, every ready lesson has a resolvable lab and gradable criteria.
- **`ai/__tests__/tutor.test.ts`** — the hint-never-leaks-the-solution guarantee, context grounding, the offline tutor.

The **e2e** (`apps/server/src/e2e.ts`) boots the real server in-process and drives
the whole learner journey through the HTTP API: open lesson → theory → quiz → lab
→ attempt → interact → hint → submit → mastery moves → lesson unlocks → fix →
reset → generate. Run it after any change to the server or the loop.

For UI changes, a Playwright smoke test drives the real browser (see the project
history); the app must render with **zero console errors**.

## Verification checklist (before calling a change done)

Per the project's own quality bar:

- [ ] `pnpm typecheck` clean
- [ ] `pnpm test` green
- [ ] `pnpm e2e` green (35 assertions)
- [ ] the app compiles and the vertical slice still works end to end
- [ ] labs are still genuinely executable (not just rendering)
- [ ] state is saved (progress survives a reload)
- [ ] the tutor receives the right context (check `hint` never leaks the solution)
- [ ] lab reset works and is deterministic from the seed

## Conventions

- **TypeScript strict**, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`. Imports use `.js` extensions (bundler/tsx resolve them to `.ts`).
- **`@cyberlab/core` stays pure** — no Node built-ins, no fetch, no DOM. If you need I/O, it belongs in the server or an engine package.
- **Ids** follow the pattern `^[a-z0-9]+(?:[.-][a-z0-9]+)*$` and are validated by the integrity checker.
- **Intentional vulnerabilities are explicit**: a lab's unsafe output goes through `raw()`, so `grep raw packages/lab-engine` audits every sink.
- **No `Math.random()` in the engine** — use the seeded `Rng`, so worlds stay reproducible.

## Extending the platform

- **A new lesson / exercise / skill** → [`CURRICULUM.md`](CURRICULUM.md).
- **A new lab world** → [`LAB_ENGINE.md`](LAB_ENGINE.md).
- **A new AI provider** → [`AI_TUTOR.md`](AI_TUTOR.md).
- **A new lab UI surface** → add a `LabSurface`, a renderer in `apps/web/src/components/lab/`, and wire it in `LabPanel.tsx`'s `SurfaceView`.

## Turning a `planned` lesson into a `ready` one

This is the intended growth path, and the architecture is designed for it:

1. Build a `LabTarget` for the lesson's world (or reuse one) and add a `LabSpec`.
2. Write the lesson's theory as `ContentBlock[]` and its practice blocks.
3. Write exercises whose criteria match the signals your target raises.
4. Flip `status: 'planned'` → `'ready'`, add `labSpecId` and `exercises`.
5. `pnpm test` — the integrity checker will tell you immediately if anything is dangling.

The three live lessons are the worked reference; copy their shape.
