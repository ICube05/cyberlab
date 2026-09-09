import type { FastifyInstance } from 'fastify';
import {
  createLabSchema,
  labActionSchema,
  type LabActionResponse,
  type LabResponse,
  type LabAction,
} from '@cyberlab/core';
import { resolveExercise } from '../challenges.js';
import type { Services } from '../services.js';
import { userIdFrom } from './util.js';

/**
 * Lab routes.
 *
 * The server is the authority on lab state: the browser sends *actions*, never
 * results. It cannot claim it captured a flag or bypassed a check; it can only
 * ask the lab to run something, and the lab decides what happened. That is the
 * whole trust model, and it lives here.
 */
export function registerLabRoutes(app: FastifyInstance, services: Services): void {
  const { labs, store } = services;

  app.post('/api/labs', async (request, reply) => {
    const userId = userIdFrom(request);
    const body = createLabSchema.parse(request.body);
    const spec = labs.spec(body.specId);
    if (!spec) return reply.code(404).send({ error: 'not_found', message: `Unknown lab ${body.specId}` });
    const state = await labs.create(userId, body.specId, body.seed);
    const response: LabResponse = { state, spec };
    return reply.send(response);
  });

  app.get('/api/labs/:id', async (request, reply) => {
    const userId = userIdFrom(request);
    const { id } = request.params as { id: string };
    try {
      const state = labs.getState(userId, id);
      const spec = labs.getSpec(id)!;
      return reply.send({ state, spec } satisfies LabResponse);
    } catch {
      return reply.code(404).send({ error: 'not_found', message: 'Lab not found or expired' });
    }
  });

  app.post('/api/labs/:id/actions', async (request, reply) => {
    const userId = userIdFrom(request);
    const { id } = request.params as { id: string };
    const action = labActionSchema.parse(request.body) as LabAction;
    try {
      const { result, state, event } = await labs.dispatch(userId, id, action);

      // Live objective preview for the active attempt on this lab, if any.
      let preview: LabActionResponse['preview'];
      const activeAttemptId = activeAttempts.get(`${userId}:${id}`);
      if (activeAttemptId) {
        const attempt = store.getAttempt(activeAttemptId);
        const exercise = attempt ? resolveExercise(attempt.exerciseId) : undefined;
        if (attempt && exercise) {
          const { evaluate } = await import('@cyberlab/core');
          const evaluation = evaluate({
            exercise,
            transcript: labs.transcript(userId, id),
            signals: state.signals,
            state: { flags: state.flags, eventCount: state.eventCount, cookies: state.cookies, shell: state.shell },
            report: attempt.report ?? {},
            hintsUsed: attempt.hintsUsed,
          });
          preview = {
            exerciseId: exercise.id,
            objectives: evaluation.objectives.map((o) => ({ id: o.id, label: o.label, passed: o.passed })),
          };
        }
      }

      const response: LabActionResponse = { result, state, event, ...(preview ? { preview } : {}) };
      return reply.send(response);
    } catch (error) {
      return reply.code(400).send({
        error: 'lab_error',
        message: error instanceof Error ? error.message : 'Lab action failed',
      });
    }
  });

  app.post('/api/labs/:id/reset', async (request, reply) => {
    const userId = userIdFrom(request);
    const { id } = request.params as { id: string };
    try {
      const state = await labs.reset(userId, id);
      return reply.send({ state, spec: labs.getSpec(id)! } satisfies LabResponse);
    } catch (error) {
      return reply.code(400).send({ error: 'lab_error', message: error instanceof Error ? error.message : 'reset failed' });
    }
  });

  app.get('/api/labs/:id/transcript', async (request, reply) => {
    const userId = userIdFrom(request);
    const { id } = request.params as { id: string };
    try {
      return reply.send({ events: labs.transcript(userId, id) });
    } catch {
      return reply.code(404).send({ error: 'not_found', message: 'Lab not found' });
    }
  });

  app.delete('/api/labs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await labs.dispose(id);
    return reply.send({ ok: true });
  });
}

/**
 * Which attempt (if any) is live on a given (user, lab). Set by the attempt
 * routes; read here to produce the live objective preview after each action.
 */
export const activeAttempts = new Map<string, string>();
