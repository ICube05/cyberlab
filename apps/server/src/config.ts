import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

/**
 * Configuration.
 *
 * Everything is read from the environment with a safe default, so the platform
 * boots with an empty `.env`. The defaults are chosen so that a fresh clone
 * gives you the full experience: in-process labs, the offline tutor, a local
 * SQLite progress file.
 *
 * One subtlety earns its own machinery here. The dev runner starts the backend
 * with `pnpm --filter @cyberlab/server dev`, and pnpm runs a filtered script
 * with the *package* directory as cwd. Anything resolved relative to cwd —
 * `.env`, `./apps/server/data/cyberlab.db` — therefore lands inside
 * `apps/server/`, which is how a repo ends up with `apps/server/apps/server/`
 * and a `.env` that is silently never read. Every relative path below is
 * resolved against the workspace root instead, found by walking up for
 * `pnpm-workspace.yaml`.
 */
export interface Config {
  port: number;
  host: string;
  dbPath: string;
  corsOrigins: string[];
  ai: {
    provider: 'ollama' | 'gemini' | 'offline';
    /** What the environment asked for, before any fallback was applied. */
    requestedProvider: string;
    temperature: number;
    maxTokens: number;
    timeoutMs: number;
    ollama: { baseUrl: string; model: string; keepAlive: string };
    gemini: { apiKey: string; model: string; baseUrl: string };
  };
  lab: {
    runtime: 'inproc' | 'docker';
    maxInstancesPerUser: number;
    idleTtlMs: number;
    actionTimeoutMs: number;
    docker: { socketPath: string; network: string; memoryMb: number; cpuShares: number };
  };
  contentLocale: 'it' | 'en';
  /** Misconfigurations worth shouting about at boot. Never fatal. */
  diagnostics: string[];
  /** Where the workspace root was found, and which .env files were loaded. */
  env: { root: string; loaded: string[] };
}

function num(value: string | undefined, fallback: number): number {
  const parsed = value ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function str(value: string | undefined, fallback: string): string {
  return value && value.trim().length > 0 ? value.trim() : fallback;
}

/**
 * Walk up from `start` looking for the workspace root.
 *
 * `pnpm-workspace.yaml` is the marker: it exists exactly once, at the root, in
 * this repo and in every pnpm monorepo. Falls back to the git root, then to the
 * starting directory, so this never throws.
 */
export function findWorkspaceRoot(start: string = process.cwd()): string {
  let dir = resolve(start);
  for (let depth = 0; depth < 12; depth += 1) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir;
    if (existsSync(resolve(dir, '.git')) && existsSync(resolve(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(start);
}

/**
 * Like `fromRoot`, but keeps SQLite's `:memory:` sentinel intact.
 *
 * Resolving it as a path turned it into `<root>/:memory:`, so the tests and the
 * e2e run — which set `CYBERLAB_DB=:memory:` precisely to stay ephemeral — were
 * writing a real database file into the repository root instead.
 */
function dbPathFrom(root: string, path: string): string {
  return path === ':memory:' ? path : fromRoot(root, path);
}

/** Resolve a possibly-relative path against the workspace root, not cwd. */
function fromRoot(root: string, path: string): string {
  return isAbsolute(path) ? path : resolve(root, path);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, root = findWorkspaceRoot()): Config {
  const diagnostics: string[] = [];

  const requestedProvider = str(env['AI_PROVIDER'], 'offline').toLowerCase();
  const runtime = str(env['LAB_RUNTIME'], 'inproc');
  const locale = str(env['CONTENT_LOCALE'], 'it');

  const gemini = {
    apiKey: str(env['GEMINI_API_KEY'], ''),
    model: str(env['GEMINI_MODEL'], 'gemini-2.5-flash'),
    baseUrl: str(env['GEMINI_BASE_URL'], 'https://generativelanguage.googleapis.com'),
  };
  const ollama = {
    baseUrl: str(env['OLLAMA_BASE_URL'], 'http://127.0.0.1:11434'),
    model: str(env['OLLAMA_MODEL'], 'qwen2.5:14b-instruct'),
    keepAlive: str(env['OLLAMA_KEEP_ALIVE'], '10m'),
  };

  // Resolve the provider *honestly*: say out loud when we cannot honour the
  // request, instead of quietly serving the offline tutor and letting the user
  // wonder why their key is being ignored.
  let provider: Config['ai']['provider'] = 'offline';
  if (requestedProvider === 'gemini') {
    if (gemini.apiKey) {
      provider = 'gemini';
    } else {
      diagnostics.push(
        'AI_PROVIDER=gemini but GEMINI_API_KEY is empty → falling back to the offline tutor. ' +
          'Put GEMINI_API_KEY=… in the .env at the workspace root (get a key at https://aistudio.google.com/apikey).',
      );
    }
  } else if (requestedProvider === 'ollama') {
    provider = 'ollama';
  } else if (requestedProvider !== 'offline') {
    diagnostics.push(`AI_PROVIDER="${requestedProvider}" is not a known provider (ollama | gemini | offline) → offline.`);
  }

  return {
    port: num(env['PORT'], 5174),
    host: str(env['HOST'], '127.0.0.1'),
    dbPath: dbPathFrom(root, str(env['CYBERLAB_DB'], './apps/server/data/cyberlab.db')),
    corsOrigins: str(env['CORS_ORIGINS'], 'http://localhost:5173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    ai: {
      provider,
      requestedProvider,
      temperature: num(env['AI_TEMPERATURE'], 0.4),
      maxTokens: num(env['AI_MAX_TOKENS'], 1400),
      timeoutMs: num(env['AI_TIMEOUT_MS'], 90_000),
      ollama,
      gemini,
    },
    lab: {
      runtime: runtime === 'docker' ? 'docker' : 'inproc',
      maxInstancesPerUser: num(env['LAB_MAX_INSTANCES'], 6),
      idleTtlMs: num(env['LAB_IDLE_TTL_MS'], 30 * 60_000),
      actionTimeoutMs: num(env['LAB_ACTION_TIMEOUT_MS'], 4000),
      docker: {
        socketPath: str(env['DOCKER_SOCKET'], '/var/run/docker.sock'),
        network: str(env['DOCKER_LAB_NETWORK'], 'cyberlab-internal'),
        memoryMb: num(env['DOCKER_MEMORY_MB'], 512),
        cpuShares: num(env['DOCKER_CPU_SHARES'], 512),
      },
    },
    contentLocale: locale === 'en' ? 'en' : 'it',
    diagnostics,
    env: { root, loaded: [] },
  };
}

/**
 * Minimal .env loader — avoids a dependency for one small feature.
 *
 * Reads the workspace-root `.env` first, then a package-local one if present,
 * so `apps/server/.env` can override the shared file. Real environment
 * variables always win over both.
 */
export function loadDotEnv(root = findWorkspaceRoot()): string[] {
  const loaded: string[] = [];
  const candidates = [
    resolve(root, '.env'),
    resolve(root, '.env.local'),
    resolve(process.cwd(), '.env'),
  ];
  const seen = new Set<string>();

  for (const path of candidates) {
    if (seen.has(path) || !existsSync(path)) continue;
    seen.add(path);
    let content: string;
    try {
      content = readFileSync(path, 'utf8');
    } catch {
      continue;
    }
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim().replace(/^export\s+/, '');
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
    loaded.push(path);
  }
  return loaded;
}
