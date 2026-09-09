#!/usr/bin/env node
/**
 * Save your progress to git, so it is there on the next machine.
 *
 * The progress database is a committed file (see the README), which means
 * "keeping it" is a commit and a push. Doing that by hand after every study
 * session is exactly the kind of chore that gets forgotten, so `pnpm dev` runs
 * this on shutdown and `pnpm progress:save` runs it on demand.
 *
 * Three rules keep it from ever being a nuisance:
 *
 *  1. It only ever touches ONE path — the database. Whatever else you have
 *     staged or half-written stays untouched, because the commit names the file
 *     explicitly rather than sweeping up the index.
 *  2. It is inert until you opt in. Nothing happens unless the database is
 *     already tracked by git, which only becomes true once you have committed
 *     it yourself. A fresh clone that never does gets no commits and no pushes.
 *  3. It never resolves a conflict for you. SQLite is binary and git cannot
 *     merge it; if two machines diverge, this stops and says so rather than
 *     silently discarding one side's work.
 */
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DB = 'apps/server/data/cyberlab.db';

const C = { dim: '\x1b[2m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', reset: '\x1b[0m' };
const say = (msg) => console.log(`${C.dim}[progress]${C.reset} ${msg}`);
const warn = (msg) => console.log(`${C.yellow}[progress]${C.reset} ${msg}`);
const fail = (msg) => console.log(`${C.red}[progress]${C.reset} ${msg}`);

/** Run git, returning {ok, out}. Never throws — callers decide what a failure means. */
function git(args) {
  try {
    const out = execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, out: out.trim() };
  } catch (error) {
    const out = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
    return { ok: false, out };
  }
}

/** True when the learner has opted in by committing the database at least once. */
function isTracked() {
  return git(['ls-files', '--error-unmatch', DB]).ok;
}

function hasChanges() {
  // Staged, unstaged or untracked — any of them means there is something to save.
  return git(['status', '--porcelain', '--', DB]).out.length > 0;
}

/**
 * How many learners the database has anything recorded for.
 *
 * Zero means the file was just created and nothing has been studied in it yet —
 * the signal that distinguishes "a fresh empty database" from "a session worth
 * committing". Unreadable counts as unknown (-1) so a quirk here can never be
 * the reason a real save is skipped.
 */
function countProgressRows() {
  try {
    const db = new DatabaseSync(resolve(ROOT, DB), { readOnly: true });
    try {
      const row = db.prepare('SELECT COUNT(*) AS n FROM progress').get();
      return Number(row?.n ?? 0);
    } finally {
      db.close();
    }
  } catch {
    return -1;
  }
}

export function saveProgress({ quiet = false } = {}) {
  if (!git(['rev-parse', '--is-inside-work-tree']).ok) return { status: 'skipped', reason: 'not a git repository' };
  if (!existsSync(resolve(ROOT, DB))) return { status: 'skipped', reason: 'no database yet' };

  if (!isTracked()) {
    // The opt-in signal. Said once, quietly, and only when there is a database
    // worth saving — never nagged on every shutdown.
    if (!quiet) {
      say(`i progressi non sono ancora sotto git. Per attivarli:`);
      say(`  ${C.green}git add -f ${DB} && git commit -m "progressi"${C.reset}`);
      say(`da lì in poi vengono salvati da soli.`);
    }
    return { status: 'skipped', reason: 'database not tracked (opt-in)' };
  }

  if (!hasChanges()) return { status: 'clean', reason: 'nothing new' };

  // Never let an empty database overwrite a saved one.
  //
  // `pnpm clean` deletes apps/server/data, and a fresh clone starts without it;
  // the server then recreates an empty database, and committing that on top of
  // the tracked one would erase the very progress this is meant to protect.
  // Nothing recorded means nothing to save — say so and stop.
  if (isTracked() && countProgressRows() === 0) {
    warn('il database è vuoto (ricreato da zero?): non lo committo sopra i progressi già salvati.');
    warn(`  per ripristinare quelli nel repo: ${C.green}git checkout -- ${DB}${C.reset}`);
    return { status: 'skipped', reason: 'refusing to overwrite with an empty database' };
  }

  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  git(['add', '--', DB]);
  // Commit this path only: unrelated staged work is not swept into it.
  const committed = git(['commit', '-m', `progressi ${stamp}`, '--', DB]);
  if (!committed.ok) {
    fail(`commit non riuscito:\n${committed.out}`);
    return { status: 'error', reason: 'commit failed' };
  }
  say(`salvati ${C.green}✓${C.reset}`);

  // Pushing is best-effort: no remote, no upstream or no credentials must never
  // turn a finished study session into an error.
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).out;
  if (!git(['rev-parse', '--abbrev-ref', `${branch}@{upstream}`]).ok) {
    warn(`nessun upstream per "${branch}": commit fatto, push da fare a mano.`);
    return { status: 'committed', reason: 'no upstream' };
  }

  if (git(['push']).ok) {
    say(`inviati a ${branch} ${C.green}✓${C.reset}`);
    return { status: 'pushed' };
  }

  // Rejected almost always means the remote moved on. Rebase on top of it —
  // --autostash so uncommitted work elsewhere does not block the rebase.
  say('il remoto è avanti, riallineo…');
  const rebased = git(['pull', '--rebase', '--autostash']);
  if (!rebased.ok) {
    git(['rebase', '--abort']);
    fail(
      'i progressi divergono fra due macchine e git non sa fondere un file binario.\n' +
        `           Il commit locale c'è. Scegli quale versione tenere, per esempio:\n` +
        `             ${C.green}git checkout --ours ${DB} && git rebase --continue${C.reset}   (tieni i tuoi)\n` +
        `             ${C.green}git checkout --theirs ${DB} && git rebase --continue${C.reset} (tieni quelli remoti)`,
    );
    return { status: 'conflict' };
  }

  if (git(['push']).ok) {
    say(`inviati a ${branch} ${C.green}✓${C.reset}`);
    return { status: 'pushed' };
  }
  warn('push non riuscito (credenziali o rete?): il commit è salvato in locale.');
  return { status: 'committed', reason: 'push failed' };
}

// Run directly (`pnpm progress:save`) rather than imported by the dev runner.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const result = saveProgress();
  if (result.status === 'clean') say('niente di nuovo da salvare.');
  process.exit(result.status === 'error' || result.status === 'conflict' ? 1 : 0);
}
