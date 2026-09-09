import type { FastifyInstance } from 'fastify';
import {
  blockSeenSchema,
  quizAnswerSchema,
  type CurriculumResponse,
  type LessonResponse,
} from '@cyberlab/core';
import {
  SKILLS,
  buildCurriculumIndex,
  getExercisesForLesson,
  getLab,
  getLesson,
  getModule,
  levelIdForLesson,
  lessonPosition,
} from '@cyberlab/curriculum';
import type { Services } from '../services.js';
import { userIdFrom } from './util.js';

/** Curriculum, lessons, and the lightweight learning-progress writes. */
export function registerContentRoutes(app: FastifyInstance, services: Services): void {
  const { progress } = services;

  app.get('/api/curriculum', async (request, reply) => {
    const userId = userIdFrom(request);
    const index = buildCurriculumIndex();
    const { lessonStates } = progress.response(userId);
    const response: CurriculumResponse = { ...index, skills: SKILLS, lessonStates };
    return reply.send(response);
  });

  app.get('/api/lessons/:id', async (request, reply) => {
    const userId = userIdFrom(request);
    const { id } = request.params as { id: string };
    const lesson = getLesson(id);
    if (!lesson) return reply.code(404).send({ error: 'not_found', message: `Unknown lesson ${id}` });

    const module = getModule(lesson.moduleId);
    const exercises = getExercisesForLesson(id);
    const lab = lesson.labSpecId ? getLab(lesson.labSpecId) : undefined;
    const entry = progress.canEnter(userId, id);
    const userProgress = progress.get(userId).lessons[id];

    const response: LessonResponse = {
      lesson,
      exercises,
      ...(lab ? { lab } : {}),
      levelId: levelIdForLesson(id) ?? '',
      moduleTitle: module?.title ?? '',
      position: lessonPosition(id),
      entry: { allowed: entry.allowed, reasons: entry.reasons },
      ...(userProgress
        ? {
            progress: {
              state: entry.state,
              blocksSeen: userProgress.blocksSeen,
              quiz: Object.fromEntries(
                Object.entries(userProgress.quiz).map(([k, v]) => [k, { correct: v.correct, attempts: v.attempts }]),
              ),
              exercises: Object.fromEntries(
                Object.entries(userProgress.exercises).map(([k, v]) => [
                  k,
                  { passed: v.passed, bestScore: v.bestScore, attempts: v.attempts },
                ]),
              ),
            },
          }
        : {}),
    };
    return reply.send(response);
  });

  app.post('/api/lessons/:id/seen', async (request, reply) => {
    const userId = userIdFrom(request);
    const body = blockSeenSchema.parse(request.body);
    const updated = progress.markBlocksSeen(userId, body.lessonId, body.blockIds, body.timeSpentMs);
    return reply.send({ ok: true, xp: updated.xp, level: updated.level });
  });

  app.post('/api/lessons/:id/quiz', async (request, reply) => {
    const userId = userIdFrom(request);
    const body = quizAnswerSchema.parse(request.body);
    const lesson = getLesson(body.lessonId);
    const block = lesson
      ? [...lesson.theory, ...(lesson.practice ?? [])].find((b) => b.id === body.blockId)
      : undefined;
    if (!block || block.kind !== 'quiz') {
      return reply.code(400).send({ error: 'bad_request', message: 'Not a quiz block' });
    }
    const correct =
      body.selected.length === block.correct.length &&
      body.selected.every((s) => block.correct.includes(s));
    progress.recordQuiz(userId, body.lessonId, body.blockId, correct);
    return reply.send({ correct, correctAnswers: block.correct, explanation: block.explanation });
  });
}
