import type { FastifyInstance } from 'fastify';
import {
  evaluate,
  generateExerciseSchema,
  revealHintSchema,
  startAttemptSchema,
  submitAttemptSchema,
  type Attempt,
  type AttemptResponse,
  type GenerateExerciseResponse,
  type SubmitAttemptResponse,
} from '@cyberlab/core';
import { generateExercise, getExercise, getExercisesForLesson, getLesson } from '@cyberlab/curriculum';
import type { Services } from '../services.js';
import { userIdFrom } from './util.js';
import { activeAttempts } from './labs.js';

/**
 * Attempts — the graded path.
 *
 * Start binds an attempt to a lab; hints are revealed one at a time and their
 * cost is recorded; submit runs the authoritative evaluation on the server
 * against the real transcript and applies the result to durable progress. The
 * browser never grades itself.
 */
export function registerAttemptRoutes(app: FastifyInstance, services: Services): void {
  const { store, progress, labs } = services;

  app.post('/api/attempts', async (request, reply) => {
    const userId = userIdFrom(request);
    const body = startAttemptSchema.parse(request.body);
    const exercise = getExercise(body.exerciseId);
    if (!exercise) return reply.code(404).send({ error: 'not_found', message: 'Unknown exercise' });

    const attempt: Attempt = {
      id: `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      exerciseId: exercise.id,
      ...(body.labInstanceId ? { labInstanceId: body.labInstanceId } : {}),
      startedAt: Date.now(),
      hintsUsed: [],
    };
    store.saveAttempt(attempt);
    if (body.labInstanceId) activeAttempts.set(`${userId}:${body.labInstanceId}`, attempt.id);

    const response: AttemptResponse = {
      attemptId: attempt.id,
      exerciseId: attempt.exerciseId,
      startedAt: attempt.startedAt,
      hintsUsed: attempt.hintsUsed,
    };
    return reply.send(response);
  });

  app.post('/api/attempts/:id/hint', async (request, reply) => {
    const userId = userIdFrom(request);
    const { id } = request.params as { id: string };
    const body = revealHintSchema.parse(request.body);
    const attempt = store.getAttempt(id);
    if (!attempt || attempt.userId !== userId) {
      return reply.code(404).send({ error: 'not_found', message: 'Attempt not found' });
    }
    const exercise = getExercise(attempt.exerciseId);
    const hint = exercise?.hints.find((h) => h.id === body.hintId);
    if (!hint) return reply.code(404).send({ error: 'not_found', message: 'Unknown hint' });

    if (!attempt.hintsUsed.includes(hint.id)) {
      attempt.hintsUsed.push(hint.id);
      store.saveAttempt(attempt);
    }
    return reply.send({
      hint: { id: hint.id, level: hint.level, text: hint.text },
      hintsUsed: attempt.hintsUsed,
      remaining: (exercise?.hints.length ?? 0) - attempt.hintsUsed.length,
    });
  });

  /**
   * Abandon an attempt.
   *
   * A learner who opens the wrong mission — or wants to read the theory again
   * before being graded — needs a way out that is not "submit and fail". The
   * attempt is closed without evaluation, so it never reaches the mastery
   * model, and the lab is released from the live-objective preview.
   */
  app.delete('/api/attempts/:id', async (request, reply) => {
    const userId = userIdFrom(request);
    const { id } = request.params as { id: string };
    const attempt = store.getAttempt(id);
    if (!attempt || attempt.userId !== userId) {
      return reply.code(404).send({ error: 'not_found', message: 'Attempt not found' });
    }
    if (attempt.finishedAt) {
      return reply.send({ ok: true, alreadyFinished: true });
    }
    attempt.finishedAt = Date.now();
    attempt.abandoned = true;
    store.saveAttempt(attempt);
    if (attempt.labInstanceId) activeAttempts.delete(`${userId}:${attempt.labInstanceId}`);
    return reply.send({ ok: true, alreadyFinished: false });
  });

  app.post('/api/attempts/:id/submit', async (request, reply) => {
    const userId = userIdFrom(request);
    const { id } = request.params as { id: string };
    const body = submitAttemptSchema.parse(request.body ?? {});
    const attempt = store.getAttempt(id);
    if (!attempt || attempt.userId !== userId) {
      return reply.code(404).send({ error: 'not_found', message: 'Attempt not found' });
    }
    const exercise = getExercise(attempt.exerciseId);
    if (!exercise) return reply.code(404).send({ error: 'not_found', message: 'Exercise gone' });

    // Gather the authoritative lab evidence.
    let transcript = attempt.labInstanceId ? safeTranscript(labs, userId, attempt.labInstanceId) : [];
    let state = attempt.labInstanceId ? safeState(labs, userId, attempt.labInstanceId) : undefined;

    const evaluation = evaluate({
      exercise,
      transcript,
      signals: state?.signals ?? [],
      state: {
        flags: state?.flags ?? [],
        eventCount: state?.eventCount ?? 0,
        cookies: state?.cookies ?? [],
        ...(state?.shell ? { shell: state.shell } : {}),
      },
      report: body.report ?? {},
      hintsUsed: attempt.hintsUsed,
    });

    attempt.finishedAt = Date.now();
    if (body.report) attempt.report = body.report;
    attempt.evaluation = evaluation;
    store.saveAttempt(attempt);

    const applied = progress.applyEvaluation(userId, exercise, evaluation, attempt);
    const response: SubmitAttemptResponse = {
      evaluation,
      progress: applied.response,
      masteryDeltas: applied.masteryDeltas,
      unlockedLessons: applied.unlockedLessons,
      newBadges: applied.newBadges,
    };
    return reply.send(response);
  });

  // Generate a fresh, harder variant on the same lab.
  app.post('/api/exercises/generate', async (request, reply) => {
    const body = generateExerciseSchema.parse(request.body);
    const lesson = getLesson(body.lessonId);
    if (!lesson) return reply.code(404).send({ error: 'not_found', message: 'Unknown lesson' });
    const templates = getExercisesForLesson(body.lessonId);
    if (templates.length === 0) {
      return reply.code(400).send({ error: 'bad_request', message: 'Lesson has no exercises to derive from' });
    }
    const seed = body.seed ?? Math.random().toString(36).slice(2, 10);
    const { exercise, derivedFrom } = generateExercise({
      lesson,
      templates,
      difficultyShift: body.difficultyShift,
      seed,
    });
    return reply.send({ exercise, derivedFrom } satisfies GenerateExerciseResponse);
  });
}

function safeTranscript(labs: Services['labs'], userId: string, instanceId: string) {
  try {
    return labs.transcript(userId, instanceId);
  } catch {
    return [];
  }
}

function safeState(labs: Services['labs'], userId: string, instanceId: string) {
  try {
    return labs.getState(userId, instanceId);
  } catch {
    return undefined;
  }
}
