import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { ZodError } from 'zod';
import { validate as validateCurriculum } from '@cyberlab/curriculum';
import type { HealthResponse, ProgressResponse } from '@cyberlab/core';
import type { Services } from './services.js';
import { userIdFrom } from './routes/util.js';
import { registerContentRoutes } from './routes/content.js';
import { registerLabRoutes } from './routes/labs.js';
import { registerAttemptRoutes } from './routes/attempts.js';
import { registerTutorRoutes } from './routes/tutor.js';

export const VERSION = '0.1.0';

export async function buildApp(services: Services): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env['LOG_LEVEL'] ?? 'warn' },
    bodyLimit: 2_000_000,
  });

  await app.register(cors, {
    origin: services.config.corsOrigins.length ? services.config.corsOrigins : true,
    credentials: true,
  });

  // Several actions (reset, submit-with-no-report) are legitimately body-less
  // POSTs. Treat an empty application/json body as `{}` rather than a 400.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const text = typeof body === 'string' ? body.trim() : '';
    if (text.length === 0) return done(null, {});
    try {
      done(null, JSON.parse(text));
    } catch (error) {
      done(error instanceof Error ? error : new Error('invalid json'), undefined);
    }
  });

  // Uniform validation errors.
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'validation',
        message: 'Request failed validation',
        details: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    app.log.error(error);
    const statusCode = typeof (error as { statusCode?: number }).statusCode === 'number' ? (error as { statusCode: number }).statusCode : 500;
    const message = error instanceof Error ? error.message : 'Internal error';
    return reply.code(statusCode).send({ error: 'internal', message });
  });

  // ── health ─────────────────────────────────────────────────────────────────
  app.get('/api/health', async () => {
    const report = validateCurriculum();
    const probe = await services.tutor.probe();
    const response: HealthResponse = {
      ok: true,
      version: VERSION,
      labRuntime: `${services.labs.runtimeKind} — ${services.runtimeDetail}`,
      aiProvider: services.tutor.providerName,
      aiReachable: probe.reachable,
      aiModel: services.tutor.model,
      contentLocale: services.config.contentLocale,
      curriculum: {
        lessons: report.stats.lessons,
        ready: report.stats.readyLessons,
        labs: report.stats.labs,
        exercises: report.stats.exercises,
      },
    };
    return response;
  });

  // ── progress ───────────────────────────────────────────────────────────────
  app.get('/api/progress', async (request) => {
    const userId = userIdFrom(request);
    return services.progress.response(userId) satisfies ProgressResponse;
  });

  registerContentRoutes(app, services);
  registerLabRoutes(app, services);
  registerAttemptRoutes(app, services);
  registerTutorRoutes(app, services);

  return app;
}
