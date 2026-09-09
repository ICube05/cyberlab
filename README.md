# CyberLab

An interactive platform for learning **cybersecurity and ethical hacking inside an IDE**, not a course. You read the theory, talk to an AI tutor, and then *actually do the exercise* against a real, isolated, deliberately-vulnerable lab — and the platform grades what you did by asking the vulnerable application what really happened inside it.

> The whole learning loop, end to end:
> **explanation → demonstration → exercise → result analysis → AI feedback → mastery → next lesson.**

<p align="center"><em>Dark-first, IDE-inspired UI · real labs that execute · a tutor that reads your actual lab transcript.</em></p>

---

## Why this is not a mockup

Every claim below is backed by code you can run, and by the test suite (`pnpm test`, 48 tests) and the end-to-end walk (`pnpm e2e`, 35 assertions):

- **The SQL injection lab is a real SQLite database.** Typing `' OR '1'='1` genuinely reparses and returns hidden rows; a broken quote surfaces SQLite's own error. Injection is *permitted inside a sandbox*, never simulated.
- **The Broken Access Control lab runs a real authorization policy engine.** Change `?id=15` to `?id=17` and the server really serves another user's profile — because its policy says `ownership: "none"`. Fix that one field in the lab's editor and the *same request* really returns `403`.
- **The Linux lab enforces real Unix permissions.** `cat /root/flag.txt` genuinely fails until you escalate via a real `sudo` misconfiguration.
- **Grading is honest.** The evaluator does not match your payload against an expected string — it reads the *signals the vulnerable app raised about itself* (`authz.horizontal.bypass`, `sqli.auth-bypass`, `privesc.flag-read`). Any valid route to the objective scores.
- **The AI tutor works with no API key.** A deterministic offline tutor composes the lesson's authored pedagogy against your real lab transcript. Point it at Ollama or Gemini for free-form answers.

## Quick start

```bash
# 1. Install (Node ≥ 22.5 for node:sqlite; pnpm)
pnpm install

# 2. Optional config — everything has a safe default, so you can skip this
cp .env.example .env

# 3. Run backend + web together
pnpm dev
#   ▸ open http://localhost:5173
```

That's it. No Docker, no database to provision, no AI key required. The labs run in-process; the tutor runs offline until you configure a provider.

### First run

1. The roadmap (left) shows the whole 11-level curriculum. Three lessons are **live** (fully interactive); the rest are on the map as honest previews.
2. Open **Broken Access Control**. Read Section A (interactive diagrams, a clickable HTTP exchange), answer the inline checks.
3. Click **Avvia laboratorio**, start the mission *"accedi al profilo di un altro utente"*.
4. In the **Browser** surface, log in as `seba`. Switch to **Request**, change `?id=15` to `?id=17`, hit **Send** — you're reading someone else's profile.
5. Enumerate to find the admin, grab the flag, submit. **MISSION COMPLETE**, your `idor` mastery moves, XP lands, the next lesson unlocks.
6. Ask the tutor **"Perché ha funzionato?"** — it explains using the exact requests you sent.

## What's in the box

| Live lesson | Domain | Lab | Techniques that genuinely execute |
|---|---|---|---|
| Broken Access Control | Web | `vault` | IDOR / horizontal & vertical bypass, **and the real fix → 403** |
| SQL Injection | Web | `catalog` | filter bypass, UNION exfiltration, error-based, auth bypass, parameterised fix |
| Linux Privilege Escalation | Linux | `foothold` | permission enumeration, `sudo` GTFOBins escalation to root |

Plus the full **Level 0–10 roadmap** (Foundations → Web → Recon → Pentest → Linux → Windows → AD → Reversing → Malware → Red Team → Blue Team) as structured previews, ready to be filled in with the same architecture.

## Scripts

```bash
pnpm dev          # backend + web dev servers, one URL
pnpm dev:server   # backend only  (Fastify, tsx watch)
pnpm dev:web      # web only      (Vite)
pnpm build        # production web bundle
pnpm start        # run the backend (serves the API)
pnpm test         # unit tests (vitest) — 48 tests
pnpm e2e          # end-to-end walk of the whole learner journey
pnpm typecheck    # typecheck every package
```

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the whole system, module by module, and why it's shaped this way.
- [`docs/CURRICULUM.md`](docs/CURRICULUM.md) — the content model; **how to add a skill, a lesson, an exercise**.
- [`docs/LAB_ENGINE.md`](docs/LAB_ENGINE.md) — the lab runtime; **how to build a new lab**; the Docker growth path.
- [`docs/AI_TUTOR.md`](docs/AI_TUTOR.md) — the tutor; modes, context assembly, **connecting a provider**.
- [`docs/SECURITY.md`](docs/SECURITY.md) — the security-by-design boundaries and the ethical stance.
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) — dev workflow, testing, conventions, extending the platform.

## Legal & ethical use

CyberLab teaches offensive techniques **exclusively for authorized contexts**: its own isolated labs, CTFs, and systems you have explicit written permission to test. Every offensive lesson states its scope, the labs cannot reach the network, and the platform will not help you attack real, unauthorized systems. See [`docs/SECURITY.md`](docs/SECURITY.md).

## Tech stack (and why)

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 19 + TypeScript + Vite + Tailwind v4 | fast, typed, the ecosystem for an IDE-grade UI; a component system without a heavy framework |
| Terminal | xterm.js | the real terminal component; nothing else comes close |
| Backend | Fastify + TypeScript | small, fast, first-class schema validation; shares types with the client |
| Lab DB | `node:sqlite` | a **real** SQL engine with **zero native dependencies** — the reason SQLi labs work out of the box |
| Progress | SQLite (same) | the one thing that must persist; no external DB to run |
| Labs | in-process sandbox (default) + Docker adapter | real execution with no setup, and a clear path to real binaries |
| AI | provider interface: Ollama · Gemini · offline | no lock-in; works with nothing configured |
| State | Zustand | one store, no boilerplate |

Monorepo (pnpm workspaces): `packages/core` (pure domain), `packages/lab-engine`, `packages/ai`, `packages/curriculum`, `apps/server`, `apps/web`.

## Portarsi dietro i progressi

Il database dei progressi è `apps/server/data/cyberlab.db` (SQLite) ed è
**committabile di proposito**: lezioni completate, mastery, quiz e tentativi
viaggiano con il repo, così da un'altra macchina ritrovi le cose fatte.

```bash
git add apps/server/data/cyberlab.db
git commit -m "progressi"
```

Il server ripiega il write-ahead log dentro il `.db` a ogni scrittura e quando
si chiude, quindi il file che committi è completo: i sidecar `-wal` e `-shm`
restano fuori da git perché sono temporanei, non perché servano.

Due avvertenze oneste:

- SQLite è **binario**: git non sa fonderlo. Se avanzi su due macchine senza
  sincronizzare, un conflitto su questo file si risolve tenendo una delle due
  versioni, non unendole. Committa e fai push quando finisci di studiare.
- Il file contiene **i tuoi progressi**, non dati sensibili — ma se rendi
  pubblico il repo, rendi pubblici anche quelli.

## Stato del lavoro

`docs/HANDOFF.md` descrive cosa è fatto, perché, e cosa resta — scritto per chi riprende il lavoro senza il contesto della sessione precedente.
