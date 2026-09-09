# The Lab Engine

The lab engine is what makes CyberLab a laboratory rather than a quiz. This
document explains how it runs labs for real, and how to build a new one.

## The boundary

Everything above the engine is runtime-agnostic. The contract is one interface:

```ts
interface LabRuntime {
  readonly kind: 'inproc' | 'docker' | string;
  isAvailable(): Promise<{ available: boolean; detail: string }>;
  create(spec: LabSpec, opts: CreateOptions): Promise<LabInstance>;
  shutdown(): Promise<void>;
}
```

`LabManager` holds a `LabRuntime`, enforces a per-user instance cap, and reaps
idle instances on a timer. The server never knows which runtime it has.

## The in-process runtime (default)

Labs run as real code inside the server process, each inside sandboxes the
target establishes. This is the default because it needs **zero dependencies**
and every technique in the current curriculum genuinely executes.

A **`LabTarget`** is a small, self-contained, deliberately-broken world:

```ts
interface LabTarget {
  readonly surfaces: readonly LabSurface[];
  http?(req, ctx): TargetHttpResponse;      // a socket-less HTTP app
  shell?(command, ctx): ShellResultView;    // a real shell interpreter over a VFS
  sql?(sql, ctx): SqlResultView;            // a real SQLite database
  files?: { list; read; write? };           // a virtual filesystem
  inspect(what, ctx): LabInspectView;        // read-only windows for the UI panels
  serialize(): unknown;  deserialize(d): void;  // for snapshots
}
```

The key object is the **`TargetContext`** handed to every call:

```ts
ctx.signal('authz.horizontal.bypass', { subjectId, objectId });  // ← the backbone of honest grading
ctx.log('warn', 'authz', '…');       // server-side logs for the blue-team panel
ctx.captureFlag('CL{…}');            // idempotent flag capture
ctx.rng                              // seeded PRNG — no Math.random() anywhere
ctx.now()                            // a virtual clock — targets never read the wall clock
```

**Signals are why grading is honest.** A target knows when it just returned a row
it shouldn't have; the evaluator doesn't have to guess from the response body.

### The sandboxes

- **SQL** (`SqlEngine`): a per-instance `:memory:` SQLite database. Injection is *permitted* — targets really concatenate user input into query strings — inside a box that blocks the handful of host-touching features (`ATTACH`, `VACUUM INTO`, `readfile`/`writefile`, `PRAGMA`, extension loading), even when comment-obfuscated. `sqlite_master` is deliberately left open so schema enumeration is practisable.
- **Filesystem** (`Vfs`): owner/group/other rwx bits evaluated in the correct order (first matching class wins), root exempt. `cat /etc/shadow` really fails for a normal user.
- **Shell** (`runCommand`): a real interpreter with `ls, cd, cat, find, grep, chmod, sudo, ps, id …`. `sudo` consults a real sudoers table; `find -exec` runs with the elevated user's authority — a genuine GTFOBins escalation.
- **HTTP** (`Router`, `parseRequest`): requests are values handed to a handler; targets never bind a socket, so a lab cannot reach the network. `html`-templating escapes by default — an injection point must opt in with `raw()`, which makes every intentional vulnerability greppable.

### Determinism & reset

Every lab is created with a **seed**. Same seed → same world (same ids, tokens,
flag). `reset()` rebuilds from the seed; `snapshot()`/`restore()` serialise the
whole world. Nothing calls `Math.random()`.

## How to build a new lab

Two steps. Say we're adding an XSS lab.

### 1. Write the target

Create `packages/lab-engine/src/inproc/targets/comments.ts`:

```ts
import { Router, html, raw, escapeHtml, tpl } from '../http.js';
import type { LabTarget, TargetBuilder, TargetContext } from '../target.js';

class CommentsTarget implements LabTarget {
  readonly surfaces = ['request', 'browser', 'logs'] as const;
  #comments: { author: string; body: string }[] = [];
  #router = new Router<TargetContext>();

  constructor(_spec, ctx: TargetContext) {
    this.#router.post('/comment', (req, ctx) => {
      const body = req.form['body'] ?? '';
      this.#comments.push({ author: 'anon', body });
      // The vulnerability, opted-in explicitly: stored unescaped.
      if (/<script|onerror=/i.test(body)) ctx.signal('xss.stored.injected', { body });
      return html(this.render());
    });
    this.#router.get('/', () => html(this.render()));
  }
  render() {
    // raw() marks the intentional sink — grep for it to audit every vuln.
    return tpl`<h1>Comments</h1>${raw(this.#comments.map(c => `<p>${c.body}</p>`).join(''))}`;
  }
  http(req, ctx) { return this.#router.handle(req, ctx) ?? html('404', { status: 404 }); }
  inspect() { return { kind: 'logs', entries: [] }; }
  serialize() { return { comments: this.#comments }; }
  deserialize(d) { this.#comments = (d as any).comments; }
}

export const commentsBuilder: TargetBuilder = {
  id: 'web.comments',
  description: 'A comment board that stores and reflects HTML unescaped.',
  build: (spec, ctx) => new CommentsTarget(spec, ctx),
};
```

Register it in `packages/lab-engine/src/inproc/targets/index.ts`:

```ts
export const ALL_BUILDERS = [vaultBuilder, injectionBuilder, footholdBuilder, commentsBuilder];
```

### 2. Add the LabSpec

In `packages/curriculum/src/labs.ts`, add a `LabSpec` whose `builderId` is
`'web.comments'`, its `surfaces`, `scenario`, `initialState`, and `seedable`.
The integrity checker verifies the `builderId` resolves.

That's the whole extension surface. A lesson then references the lab by id, and
exercises grade against the signals you raised (`xss.stored.injected`).

## Grading against your lab

Write exercise criteria in the rule DSL that match your signals:

```ts
criteria: [{
  id: 'c-xss', label: 'Stored XSS injected', weight: 2, required: true,
  rule: { type: 'signal', name: 'xss.stored.injected' },
  dimensions: ['exploitation'],
}]
```

See [`CURRICULUM.md`](CURRICULUM.md) for the full rule DSL (`signal`, `http`,
`shell`, `sql`, `flag`, `report`, `state`, and the `allOf`/`anyOf`/`not`/`count`
combinators).

## The Docker runtime (growth path)

`DockerRuntime` exists for labs the in-process runtime cannot serve: real ELF
binaries (reverse engineering), live malware detonation, multi-host AD ranges.
It is currently a **guarded stub** — it tells the truth in `isAvailable()` (the
server reports it on `/api/health` and falls back to in-process) and refuses
clearly in `create()` rather than pretending.

When implementing it, these invariants are **mandatory** (see also
[`SECURITY.md`](SECURITY.md)):

1. Every container joins an **internal** Docker network with **no egress**.
2. Read-only rootfs + a small tmpfs; **all capabilities dropped**; `no-new-privileges`.
3. Hard memory / pid / cpu limits.
4. A per-instance name so the idle reaper can guarantee teardown.
5. Never mount the Docker socket into a lab container.

Enable with `LAB_RUNTIME=docker` and the `DOCKER_*` variables in `.env`.

## Reset, snapshot, lifecycle

- `POST /api/labs/:id/reset` → `LabManager.reset` → rebuild from seed, clear transcript.
- Idle labs (default 30 min) are disposed by the reaper; the per-user cap (default 6) evicts the LRU lab on overflow.
- Labs are never written to disk, so there is nothing to migrate when you change one.
