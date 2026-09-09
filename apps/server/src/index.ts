import { loadConfig, loadDotEnv } from './config.js';
import { buildServices } from './services.js';
import { buildApp, VERSION } from './app.js';

/**
 * Entry point.
 *
 * Loads `.env`, validates the curriculum (fails fast if broken), wires the
 * services, and starts Fastify. Shuts everything down cleanly on SIGINT/SIGTERM
 * so lab instances and the SQLite handle are released.
 */
async function main(): Promise<void> {
  await loadDotEnv();
  const config = loadConfig();
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
