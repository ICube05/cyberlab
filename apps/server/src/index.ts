import { relative } from 'node:path';
import { findWorkspaceRoot, loadConfig, loadDotEnv } from './config.js';
import { buildServices } from './services.js';
import { buildApp, VERSION } from './app.js';

/**
 * Entry point.
 *
 * Loads `.env` from the workspace root (not from whatever cwd pnpm happened to
 * hand us), validates the curriculum (fails fast if broken), wires the services,
 * and starts Fastify. Shuts everything down cleanly on SIGINT/SIGTERM so lab
 * instances and the SQLite handle are released.
 */
async function main(): Promise<void> {
  const root = findWorkspaceRoot();
  const loaded = loadDotEnv(root);
  const config = loadConfig(process.env, root);
  config.env.loaded = loaded;

  console.log(
    loaded.length > 0
      ? `[env] loaded ${loaded.map((p) => relative(root, p) || p).join(', ')} (root: ${root})`
      : `[env] no .env found at ${root} — using defaults. Copy .env.example to .env to configure the AI provider.`,
  );
  for (const diagnostic of config.diagnostics) console.warn(`[config] ⚠ ${diagnostic}`);

  const services = await buildServices(config);
  const app = await buildApp(services);

  const shutdown = async (signal: string) => {
    console.log(`\n[server] ${signal} received, shutting down…`);
    try {
      await app.close();
      await services.dispose();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: config.port, host: config.host });
  console.log(
    `\n  CyberLab server v${VERSION}\n` +
      `  → http://${config.host}:${config.port}\n` +
      `  lab runtime: ${services.labs.runtimeKind}\n` +
      `  ai provider: ${services.tutor.providerName} (${services.aiProbe.reachable ? 'reachable' : 'offline fallback'})\n`,
  );
}

main().catch((error) => {
  console.error('[server] fatal:', error);
  process.exit(1);
});
