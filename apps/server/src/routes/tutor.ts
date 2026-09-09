import type { FastifyInstance } from 'fastify';
import { tutorRequestSchema, type TutorMessage } from '@cyberlab/core';
import { getExercise, getLab, getLesson } from '@cyberlab/curriculum';
import type { Services } from '../services.js';
import { userIdFrom } from './util.js';

/**
 * The tutor endpoint.
 *
 * Streams the reply as Server-Sent Events so the UI renders tokens as they
 * arrive. The context is assembled server-side from real state — the lesson,
 * the active exercise with its revealed hints, the live lab transcript, and the
 * learner's mastery — then handed to whichever provider is configured. The same
 * assembled context is stashed for the offline provider to read.
 */
export function registerTutorRoutes(app: FastifyInstance, services: Services): void {
  const { tutor, progress, labs, store, tutorContextRef } = services;

  app.post('/api/tutor', async (request, reply) => {
    const userId = userIdFrom(request);
    const body = tutorRequestSchema.parse(request.body);

    const lesson = body.lessonId ? getLesson(body.lessonId) : undefined;
    const exercise = body.exerciseId ? getExercise(body.exerciseId) : undefined;

    // Live lab context, if a lab is open.
    let lab: Parameters<typeof tutor.assembleContext>[0]['lab'];
    if (body.labInstanceId) {
      try {
        const state = labs.getState(userId, body.labInstanceId);
        const spec = labs.getSpec(body.labInstanceId);
        lab = {
          state,
          transcript: labs.transcript(userId, body.labInstanceId),
          scenario: spec?.scenario ?? '',
          title: spec?.title ?? state.specId,
        };
      } catch {
        lab = undefined;
      }
    }

    // Revealed hints + last evaluation come from the most recent attempt on this
    // exercise, so hint mode is bounded by what the learner has actually unlocked.
    let revealedHintIds: string[] = [];
    let lastEvaluation;
    if (exercise) {
      const attempts = store.recentAttempts(userId, 10).filter((a) => a.exerciseId === exercise.id);
      const latest = attempts[0];
      if (latest) {
        revealedHintIds = latest.hintsUsed;
        lastEvaluation = latest.evaluation;
      }
    }

    const userProgress = progress.get(userId);
    const context = tutor.assembleContext({
      locale: services.config.contentLocale,
      ...(lesson ? { lesson } : {}),
      ...(exercise ? { exercise } : {}),
      ...(body.focusBlockId ? { focusBlockId: body.focusBlockId } : {}),
      ...(lab ? { lab } : {}),
      progress: userProgress,
      masteries: progress.masteries(userProgress),
      ...(lastEvaluation ? { lastEvaluation } : {}),
      revealedHintIds,
      completedLessonIds: Object.values(userProgress.lessons)
        .filter((l) => l.state === 'completed' || l.state === 'mastered')
        .map((l) => l.lessonId),
    });
    tutorContextRef.current = context;

    // ── SSE stream ─────────────────────────────────────────────────────────────
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });

    const abort = new AbortController();
    request.raw.on('close', () => abort.abort());

    const send = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const history = body.history as TutorMessage[];
      for await (const chunk of tutor.respond(body.mode, context, history, body.message, abort.signal)) {
        if (chunk.type === 'meta') send('meta', chunk);
        else if (chunk.type === 'delta') send('delta', { text: chunk.text });
        else if (chunk.type === 'done') send('done', chunk.message);
        else if (chunk.type === 'error') send('error', { message: chunk.message });
      }
    } catch (error) {
      send('error', { message: error instanceof Error ? error.message : 'tutor failed' });
    } finally {
      reply.raw.write('event: end\ndata: {}\n\n');
      reply.raw.end();
    }
    return reply;
  });

  // Non-streaming variant, handy for tests and non-SSE clients.
  app.post('/api/tutor/once', async (request, reply) => {
    const userId = userIdFrom(request);
    const body = tutorRequestSchema.parse(request.body);
    const lesson = body.lessonId ? getLesson(body.lessonId) : undefined;
    const exercise = body.exerciseId ? getExercise(body.exerciseId) : undefined;
    const userProgress = progress.get(userId);
    const context = tutor.assembleContext({
      locale: services.config.contentLocale,
      ...(lesson ? { lesson } : {}),
      ...(exercise ? { exercise } : {}),
      progress: userProgress,
      masteries: progress.masteries(userProgress),
    });
    tutorContextRef.current = context;
    let text = '';
    let offline = false;
    for await (const chunk of tutor.respond(body.mode, context, body.history as TutorMessage[], body.message)) {
      if (chunk.type === 'delta') text += chunk.text;
      if (chunk.type === 'meta') offline = chunk.offline;
      if (chunk.type === 'done') offline = chunk.message.offline ?? offline;
    }
    return reply.send({ content: text.trim(), offline, provider: tutor.providerName });
  });
}
