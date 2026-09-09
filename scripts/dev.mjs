#!/usr/bin/env node
/**
 * One command to run the whole platform in development.
 *
 * Starts the backend (tsx watch) and the Vite dev server together, prefixes and
 * colourises their output, and shuts both down cleanly on Ctrl-C. The web dev
 * server proxies /api to the backend, so there is a single URL to open.
 */
import { spawn } from 'node:child_process';
import { saveProgress } from './progress.mjs';

const procs = [];
const COLORS = { server: '\x1b[36m', web: '\x1b[35m', reset: '\x1b[0m', dim: '\x1b[2m' };

function run(name, command, args, color) {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
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
  child.on('exit', (code) => {
    if (code && code !== 0 && !shuttingDown) {
      console.error(`${prefix}exited with code ${code}`);
      shutdown(1);
    }
  });
  procs.push(child);
  return child;
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const p of procs) p.kill('SIGTERM');
  // Give the server a moment to close SQLite (which folds the WAL into the .db)
  // before saving, so what gets committed is the finished session, not the one
  // before it. Inert unless the database is tracked — see scripts/progress.mjs.
  setTimeout(() => {
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
