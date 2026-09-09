import type {
  AttemptResponse,
  CurriculumResponse,
  GenerateExerciseResponse,
  HealthResponse,
  LabAction,
  LabActionResponse,
  LabResponse,
  LessonResponse,
  ProgressResponse,
  SubmitAttemptResponse,
  TranscriptResponse,
  TutorMessage,
  TutorMode,
  TutorStreamChunk,
} from '@cyberlab/core';

/**
 * The typed client.
 *
 * Every method returns the exact response type the server declares in
 * @cyberlab/core, so the two cannot drift. The tutor uses SSE; everything else
 * is plain JSON.
 */

const USER_HEADER = 'x-cyberlab-user';
const userId = 'local';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json', [USER_HEADER]: userId },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      message = err.message ?? message;
    } catch {
      /* ignore */
    }
    throw new ApiError(message, res.status);
  }
  return (await res.json()) as T;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const api = {
  health: () => request<HealthResponse>('GET', '/api/health'),
  curriculum: () => request<CurriculumResponse>('GET', '/api/curriculum'),
  progress: () => request<ProgressResponse>('GET', '/api/progress'),
  lesson: (id: string) => request<LessonResponse>('GET', `/api/lessons/${id}`),

  markSeen: (lessonId: string, blockIds: string[], timeSpentMs?: number) =>
    request<{ ok: boolean; xp: number; level: number }>('POST', `/api/lessons/${lessonId}/seen`, {
      lessonId,
      blockIds,
      ...(timeSpentMs ? { timeSpentMs } : {}),
    }),

  answerQuiz: (lessonId: string, blockId: string, selected: string[]) =>
    request<{ correct: boolean; correctAnswers: string[]; explanation: string }>(
      'POST',
      `/api/lessons/${lessonId}/quiz`,
      { lessonId, blockId, selected },
    ),

  createLab: (specId: string, seed?: string) =>
    request<LabResponse>('POST', '/api/labs', { specId, ...(seed ? { seed } : {}) }),
  getLab: (id: string) => request<LabResponse>('GET', `/api/labs/${id}`),
  labAction: (id: string, action: LabAction) =>
    request<LabActionResponse>('POST', `/api/labs/${id}/actions`, action),
  resetLab: (id: string) => request<LabResponse>('POST', `/api/labs/${id}/reset`),
  transcript: (id: string) => request<TranscriptResponse>('GET', `/api/labs/${id}/transcript`),

  startAttempt: (exerciseId: string, labInstanceId?: string) =>
    request<AttemptResponse>('POST', '/api/attempts', {
      exerciseId,
      ...(labInstanceId ? { labInstanceId } : {}),
    }),
  revealHint: (attemptId: string, hintId: string) =>
    request<{ hint: { id: string; level: number; text: string }; hintsUsed: string[]; remaining: number }>(
      'POST',
      `/api/attempts/${attemptId}/hint`,
      { hintId },
    ),
  submitAttempt: (attemptId: string, report?: Record<string, string>) =>
    request<SubmitAttemptResponse>('POST', `/api/attempts/${attemptId}/submit`, report ? { report } : {}),

  generate: (lessonId: string, difficultyShift: number) =>
    request<GenerateExerciseResponse>('POST', '/api/exercises/generate', { lessonId, difficultyShift }),
};

/**
 * Stream a tutor reply over SSE. Calls `onChunk` for each event and resolves
 * with the final message text. Uses fetch + a manual reader so we can POST a
 * body (EventSource cannot).
 */
export async function streamTutor(
  req: {
    mode: TutorMode;
    message?: string;
    lessonId?: string;
    exerciseId?: string;
    labInstanceId?: string;
    focusBlockId?: string;
    history: TutorMessage[];
  },
  onChunk: (chunk: TutorStreamChunk) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch('/api/tutor', {
    method: 'POST',
    headers: { 'content-type': 'application/json', [USER_HEADER]: userId },
    body: JSON.stringify(req),
    ...(signal ? { signal } : {}),
  });
  if (!res.ok || !res.body) throw new ApiError(`Tutor HTTP ${res.status}`, res.status);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const event = parseSse(raw);
      if (!event) continue;
      if (event.event === 'end') return;
      dispatch(event, onChunk);
    }
  }
}

function parseSse(raw: string): { event: string; data: string } | null {
  let event = 'message';
  let data = '';
  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data += line.slice(5).trim();
  }
  return data || event === 'end' ? { event, data } : null;
}

function dispatch(event: { event: string; data: string }, onChunk: (c: TutorStreamChunk) => void): void {
  try {
    const payload = event.data ? JSON.parse(event.data) : {};
    switch (event.event) {
      case 'meta':
        onChunk({ type: 'meta', provider: payload.provider, model: payload.model, offline: payload.offline });
        break;
      case 'delta':
        onChunk({ type: 'delta', text: payload.text });
        break;
      case 'done':
        onChunk({ type: 'done', message: payload });
        break;
      case 'error':
        onChunk({ type: 'error', message: payload.message });
        break;
    }
  } catch {
    /* skip malformed frame */
  }
}
