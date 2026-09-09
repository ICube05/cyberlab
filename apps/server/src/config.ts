/**
 * Configuration.
 *
 * Everything is read from the environment with a safe default, so the platform
 * boots with an empty `.env`. The defaults are chosen so that a fresh clone
 * gives you the full experience: in-process labs, the offline tutor, a local
 * SQLite progress file.
 */
export interface Config {
  port: number;
  host: string;
  dbPath: string;
  corsOrigins: string[];
  ai: {
    provider: 'ollama' | 'gemini' | 'offline';
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
}

function num(value: string | undefined, fallback: number): number {
  const parsed = value ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function str(value: string | undefined, fallback: string): string {
  return value && value.length > 0 ? value : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const provider = str(env['AI_PROVIDER'], 'offline');
  const runtime = str(env['LAB_RUNTIME'], 'inproc');
  const locale = str(env['CONTENT_LOCALE'], 'it');

  return {
    port: num(env['PORT'], 5174),
    host: str(env['HOST'], '127.0.0.1'),
    dbPath: str(env['CYBERLAB_DB'], './apps/server/data/cyberlab.db'),
    corsOrigins: str(env['CORS_ORIGINS'], 'http://localhost:5173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    ai: {
      provider: provider === 'ollama' || provider === 'gemini' ? provider : 'offline',
      temperature: num(env['AI_TEMPERATURE'], 0.4),
      maxTokens: num(env['AI_MAX_TOKENS'], 1400),
      timeoutMs: num(env['AI_TIMEOUT_MS'], 90_000),
      ollama: {
        baseUrl: str(env['OLLAMA_BASE_URL'], 'http://127.0.0.1:11434'),
        model: str(env['OLLAMA_MODEL'], 'qwen2.5:14b-instruct'),
        keepAlive: str(env['OLLAMA_KEEP_ALIVE'], '10m'),
      },
      gemini: {
        apiKey: str(env['GEMINI_API_KEY'], ''),
        model: str(env['GEMINI_MODEL'], 'gemini-2.5-flash'),
        baseUrl: str(env['GEMINI_BASE_URL'], 'https://generativelanguage.googleapis.com'),
      },
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
  };
}

/** Minimal .env loader — avoids a dependency for one small feature. */
export async function loadDotEnv(path = '.env'): Promise<void> {
  try {
    const { readFile } = await import('node:fs/promises');
    const content = await readFile(path, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // No .env file is fine; defaults apply.
  }
}
