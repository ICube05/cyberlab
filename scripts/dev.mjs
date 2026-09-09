#!/usr/bin/env node
/**
 * One command to run the whole platform in development.
 *
 * Starts the backend (tsx watch) and the Vite dev server together, prefixes and
 * colourises their output, and shuts both down cleanly on Ctrl-C. The web dev
 * server proxies /api to the backend, so there is a single URL to open.
 */
import { spawn, spawnSync } from 'node:child_process';
import { saveProgress } from './progress.mjs';

/**
 * On Windows `pnpm` is `pnpm.cmd`, and since the fix for CVE-2024-27980 Node
 * refuses to spawn a .cmd without a shell — so a plain spawn('pnpm') dies with
 * ENOENT before anything starts. Running through the shell is the portable way
 * to launch a package-manager binary.
 */
const isWindows = process.platform === 'win32';

const procs = [];
const COLORS = { server: '\x1b[36m', web: '\x1b[35m', reset: '\x1b[0m', dim: '\x1b[2m' };

function run(name, command, args, color) {
  // detached on POSIX puts the child in its own process group, which is what
  // makes it possible to signal pnpm *and* the tsx/vite it spawns; without it
  // they survived Ctrl-C and kept holding ports 5173/5174.
  const child = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
    shell: isWindows,
    detached: !isWindows,
  });
  const prefix = `${color}[${name}]${COLORS.reset} `;
  const pipe = (stream, isErr) => {
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) process[isErr ? 'stderr' : 'stdout'].write(prefix + line + '\n');
    });
  };
  pipe(child.stdout, false);
  pipe(child.stderr, true);
  // Without this, a failure to launch (pnpm not on PATH, say) surfaces as an
  // unhandled 'error' event and a raw stack trace instead of something to act on.
  child.on('error', (error) => {
    console.error(`${prefix}impossibile avviare "${command}": ${error.message}`);
    if (error.code === 'ENOENT') {
      console.error(`${prefix}${command} non è nel PATH. Installa pnpm (npm i -g pnpm) e riapri il terminale.`);
    }
    shutdown(1);
  });
  child.on('exit', (code) => {
    if (code && code !== 0 && !shuttingDown) {
      console.error(`${prefix}exited with code ${code}`);
      shutdown(1);
    }
  });
  procs.push(child);
  return child;
}

/**
 * Stop a child and everything it started.
 *
 * Through a shell, `pnpm` is the parent of tsx/vite: signalling only the shell
 * would leave those running and holding the ports, so on Windows the whole tree
 * goes via taskkill.
 */
function killTree(child, signal) {
  if (child.exitCode !== null || !child.pid) return;
  try {
    if (isWindows) {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      process.kill(-child.pid, signal); // negative pid = the whole group
    }
  } catch {
    try {
      child.kill(signal); // the group is already gone; fall back to the child
    } catch {
      /* already dead */
    }
  }
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const p of procs) killTree(p, 'SIGTERM');
  // Give the server a moment to close SQLite (which folds the WAL into the .db)
  // before saving, so what gets committed is the finished session, not the one
  // before it. Inert unless the database is tracked — see scripts/progress.mjs.
  setTimeout(() => {
    // tsx watch and vite install their own SIGTERM handlers and do not always
    // go: without this escalation they outlived Ctrl-C and kept the ports.
    for (const p of procs) killTree(p, 'SIGKILL');
    try {
      saveProgress({ quiet: code !== 0 });
    } catch {
      /* Saving progress must never be the reason a shutdown fails. */
    }
    process.exit(code);
  }, 400);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log(`${COLORS.dim}Starting CyberLab (backend + web)…${COLORS.reset}`);
run('server', 'pnpm', ['--filter', '@cyberlab/server', 'dev'], COLORS.server);
// Give the API a moment so the first proxied request lands.
setTimeout(() => {
  run('web', 'pnpm', ['--filter', '@cyberlab/web', 'dev'], COLORS.web);
  setTimeout(() => {
    console.log(`\n${COLORS.web}  ▸ Open http://localhost:5173${COLORS.reset}\n`);
  }, 1500);
}, 1200);
