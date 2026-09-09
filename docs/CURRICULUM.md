# The Curriculum

Content in CyberLab is **data, not markup**. Theory is authored as typed blocks
so the renderer can make it interactive and the tutor can be handed the exact
block you're looking at. This document is the guide to the content model and to
adding your own.

## The content graph

```
Course → Level → Module → Lesson → Exercise
                            │          │
                          Skill ◄──────┘   (many-to-many; skills are the durable axis)
                            │
Lesson ──► LabSpec ──► TargetBuilder (in @cyberlab/lab-engine)
```

Everything is assembled and **validated at server boot** by
`assertValidCurriculum()`, which catches dangling references, id typos,
prerequisite cycles, uncompilable criterion regexes, and lessons marked `ready`
without a lab or exercises. A platform that lies about what's built is worse than
a small one, so this check is strict.

## Skills — the thing you're actually measured on

Skills outlive lessons. Several lessons feed one skill; one lesson feeds several.
A skill is measured on **four dimensions**: `theory`, `recognition`,
`exploitation`, `mitigation`.

Add one in `packages/curriculum/src/skills.ts`:

```ts
{ id: 'xss', name: 'Cross-site scripting', domain: 'web',
  summary: 'Getting the browser to run your script in someone else’s page.',
  buildsOn: ['http', 'encoding'] }
```

`id` must match the id convention (lowercase, dot/dash separated). `buildsOn` is
advisory (used by the planner), not enforced.

## Lesson status — the honesty contract

| status | meaning | rendered as |
|---|---|---|
| `ready` | theory + interactive blocks + a live lab + graded exercises | fully interactive |
| `theory-only` | theory + interactive blocks, no lab yet | readable, no lab |
| `planned` | title, objectives, outline only | non-enterable preview |

The integrity checker enforces that a `ready` lesson actually has a lab and
exercises.

## Authoring a lesson

A lesson is theory blocks + practice blocks + a lab + exercises. Theory blocks
are a discriminated union (`ContentBlock`); the renderer dispatches on `kind`.

Available block kinds:

| kind | what it is |
|---|---|
| `prose` | text with inline markup: `` `code` ``, `**bold**`, `*italic*`, `[link](url)`, `{{term:tooltip}}` |
| `heading` | section heading with an optional uppercase eyebrow ("SECTION A · THEORY") |
| `callout` | info / tip / warning / danger / **legal** (every offensive lesson carries a legal scope callout) |
| `code` | syntax-tinted code with line highlights and per-line annotations |
| `table`, `comparison` | data table; side-by-side "vulnerable vs fixed" |
| `flow` | an interactive SVG graph with tooltips and optional step-through animation |
| `sequence` | a client/server message sequence you can step through |
| `timeline`, `keypoints` | a vertical timeline; a "remember this" box |
| `quiz` | an inline comprehension check that feeds the `recognition` dimension |
| `http-exchange` | a clickable request/response with per-header explanations |
| `sql-builder` | type an input, watch the query build, **run it for real** against a lab DB |
| `permission-bits` | a live Unix permission calculator using the real VFS rules |

Add a lesson file under `packages/curriculum/src/lessons/`, then register it in
`packages/curriculum/src/index.ts` (`READY_LESSONS`) and place its id in a
module's `lessons` array in `roadmap.ts`.

```ts
export const myLesson: Lesson = {
  id: 'web.xss', moduleId: 'mod.web-client', title: 'Cross-Site Scripting',
  status: 'ready', difficulty: 'intermediate', estimatedMinutes: 30,
  skills: ['xss'], prerequisites: ['web.broken-access-control'],
  objectives: ['…'],
  theory: [ /* ContentBlock[] — Section A */ ],
  practice: [ /* ContentBlock[] — Section B, interactive */ ],
  labSpecId: 'lab.comments',
  exercises: ['ex.xss.stored'],
  recap: ['…'],
};
```

## Authoring an exercise

An exercise has a mission brief, an objective checklist, an escalating hint
ladder, an optional findings report, **criteria in the rule DSL**, a solution,
and the `(skill, dimension)` pairs it provides evidence for.

The heart is the **criteria**, and the heart of a criterion is its **rule** —
which is *data*, so exercises can be generated at runtime and still be gradable,
and so the tutor can reason about *why* a criterion failed.

### The rule DSL

| rule | matches |
|---|---|
| `{ type: 'signal', name, min?, where? }` | the target raised a named signal (the strongest evidence) |
| `{ type: 'http', method?, pathMatches?, statusIn?, bodyMatches?, headerMatches?, minCount? }` | a request in the transcript |
| `{ type: 'shell', commandMatches?, stdoutMatches?, exitCode?, minCount? }` | a shell command + its result |
| `{ type: 'sql', executedMatches?, minRowsReturned?, minCount? }` | the SQL the server *actually ran* |
| `{ type: 'flag', value }` | a captured flag containing `value` (substring — flags are seed-dependent) |
| `{ type: 'report', field, equals?/matches?/oneOf? }` | a value the learner reported |
| `{ type: 'state', path, equals?/gte?/lte?/matches? }` | the lab's final observable state |
| `{ type: 'not' / 'allOf' / 'anyOf' / 'count' }` | combinators |

`where` predicates on a signal's payload use `{ path, equals?, notEquals?, gte?, lte?, matches?, exists? }`.

### Grading semantics

- Score = weighted average of criterion scores (a `count` rule can be partially satisfied).
- A failed **required** criterion fails the whole mission regardless of score.
- Pass threshold is 60% *and* no required criterion missing.
- Revealing a hint reduces **evidence weight**, never the score (a hinted success is still a success — just weaker evidence).
- Each criterion can name `dimensions:` so one mission can distinguish "you exploited it" from "you can explain the fix".

Example (from the real Broken Access Control fix exercise):

```ts
{ id: 'c-denied', label: 'Accesso a un profilo altrui ora negato (403)',
  weight: 2, required: true,
  rule: { type: 'allOf', rules: [
    { type: 'signal', name: 'authz.denied' },
    { type: 'http', pathMatches: '/profile\\.php\\?id=', statusIn: [403] },
  ] },
  dimensions: ['mitigation'] }
```

Add exercise files under `packages/curriculum/src/exercises/`, register them in
`index.ts` (`EXERCISES`), and list their ids in the lesson's `exercises` array.

## The exercise generator

`generateExercise()` derives a fresh, harder challenge from an authored template
on the same lab: it varies the seed and framing, tightens difficulty, and trims
the hint budget — while keeping the **same criteria**, so a generated challenge
is exactly as honestly graded as an authored one. Exposed at
`POST /api/exercises/generate`, surfaced as the tutor's **Challenge** mode.

## Checkpoints

A module can declare a **checkpoint** — a *mastery gate*, not a quiz. It requires
demonstrated competence on specific `(skill, dimension)` pairs above a threshold;
the learner reaches it by doing labs, not by answering more questions. The
planner surfaces it once every lesson in the module is complete.
