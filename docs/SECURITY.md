# Security & Ethics

CyberLab teaches people to break software. That makes security-by-design and a
clear ethical stance part of the product, not an afterthought. This document
states the boundaries and how they are enforced.

## The ethical stance

CyberLab teaches offensive techniques **exclusively for authorized contexts**:
its own isolated labs, CTFs, and systems you have explicit written permission to
test.

- Every offensive lesson carries a **`legal` callout** stating the scope, in the theory itself.
- Every offensive exercise has an explicit **scope statement** in its mission brief (the integrity checker warns when one is missing).
- The AI tutor's system prompt instructs it to frame every technique for authorized use and to **refuse and explain** when asked to help attack real, unauthorized systems.
- The platform teaches the **fix**, not just the exploit: every web vulnerability lesson ends with a real remediation the learner performs and verifies.

## The two worlds, kept apart

The core architectural boundary is between **educational labs** and **real-world
network access**. They never touch.

```
   Educational Labs                    Real-world network
   (sandboxed, no egress)      ✗       (never reachable from a lab)
```

- **Labs cannot reach the network.** In-process targets never bind a socket and never make outbound requests — HTTP "requests" are values passed to a handler function. There is no code path from a lab to `fetch`, DNS, or a raw socket.
- **No arbitrary host scanning.** The platform never scans or connects to arbitrary Internet systems. There is no feature that takes a user-supplied hostname and touches it.
- **No arbitrary host command execution.** The lab "terminal" is a small, purpose-built interpreter over a virtual filesystem. It does **not** shell out to the host. `sudo`, `find`, `cat` are functions you can read in `shell.ts`, not `child_process` calls.

## Sandbox specifics (in-process runtime)

| Surface | Sandbox |
|---|---|
| **SQL** | a per-instance `:memory:` SQLite DB, extension loading off. A deny-list blocks `ATTACH`, `DETACH`, `VACUUM INTO`, `readfile`/`writefile`/`fileio_*`, and `PRAGMA` — even comment-obfuscated (comments are stripped before matching). Statement length capped, row count capped. Injection is *permitted inside this box*; escape from it is not. |
| **Filesystem** | a virtual FS in memory. There is no bridge to the host filesystem; a "file" is a node in a `Map`. |
| **Shell** | a fixed command set implemented as pure functions. Unknown commands return `command not found`. No process spawning. |
| **HTTP** | a socket-less router. Intentional vulnerabilities must opt in via `raw()` (unescaped output) — so every one is greppable and auditable. |
| **Randomness** | a seeded PRNG; no `Math.random()`. Worlds are deterministic and reproducible. |
| **Clock** | a virtual clock; targets never read wall-clock time. |

## The browser surface

The lab "browser" renders a target's HTML in a sandboxed `<iframe>` with
`sandbox="allow-scripts allow-forms"` and, deliberately, **without
`allow-same-origin`**. The (intentionally vulnerable) page therefore runs in a
null origin: it cannot read the parent's cookies, storage, or DOM. `allow-scripts`
is present only so the small navigation/form bridge can `postMessage` link clicks
and form submits back to the lab engine; the parent acts only on
`cyberlabNav`/`cyberlabSubmit` messages, which drive lab actions the learner could
perform anyway.

The request/response viewer renders response bodies in a fully locked-down
`sandbox=""` iframe (no scripts) for display only.

## Trust model

- **The server is the authority.** The browser sends *actions*, never *results*. It cannot claim it captured a flag or bypassed a check — it can only ask the lab to run something, and the lab decides what happened. Grading always runs server-side against the authoritative transcript.
- **Input validation at the edge.** Every request body is validated with a zod schema before it reaches a handler. Action payloads, SQL length, path length, and history size are bounded.
- **User isolation.** Each lab belongs to one user id; another user's request for it is refused. (Identity is a single header today — the one seam to widen for real auth; every route already funnels through `userIdFrom`.)
- **Resource bounds.** A per-user instance cap evicts the LRU lab; an idle reaper disposes abandoned labs; a per-action time budget flags a runaway target.

## Privacy

CyberLab runs locally. Progress lives in a local SQLite file. With the offline or
Ollama tutor, **no learner data leaves the machine**. Only the Gemini provider
sends prompt context to a third party, and only when you explicitly configure it.

## The Docker runtime contract

When the Docker runtime is implemented (it is a guarded stub today), it **must**
honour these invariants, enforced at container creation:

1. Every container joins an **internal** Docker network — **no egress**.
2. Read-only rootfs + minimal tmpfs; **all Linux capabilities dropped**; `--security-opt no-new-privileges`.
3. Hard memory / pid / cpu limits.
4. A deterministic per-instance name so the idle reaper guarantees teardown.
5. The Docker socket is **never** mounted into a lab container.

Until those hold, `DockerRuntime.isAvailable()` reports unavailable and the server
falls back to the in-process runtime rather than running a lab unsafely.

## Reporting

This is an educational project. If you find a way for a lab to escape its
sandbox — reach the network, touch the host filesystem, or run a host command —
that is a real bug: please treat it as one.
