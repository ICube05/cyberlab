import {
  compactEvent,
  type Exercise,
  type Lesson,
  type SkillMastery,
  type TutorContext,
  type TutorMessage,
  type TutorMode,
  type TutorStreamChunk,
  blockToPlainText,
  masteryToContext,
  weakestSkills,
  strongestSkills,
  type EvaluationResult,
  type LabState,
  type LabEvent,
  type UserProgress,
} from '@cyberlab/core';
import type { AiProvider, GenerationOptions } from './provider.js';
import { ProviderError } from './provider.js';
import { buildPrompt } from './prompt.js';
import { OfflineProvider, compose } from './offline.js';

/**
 * The tutor service.
 *
 * It assembles the structured `TutorContext` (this is the "AI receives
 * structured context, not everything in the prompt" requirement made concrete),
 * picks a provider, streams the reply, and — critically — falls back to the
 * deterministic tutor if the live provider is unreachable or errors mid-stream,
 * so a flaky Ollama never leaves the learner staring at nothing.
 */
export interface TutorServiceOptions {
  provider: AiProvider;
  locale: 'it' | 'en';
  generation: Omit<GenerationOptions, 'mode' | 'signal'>;
}

export interface AssembleContextInput {
  locale: 'it' | 'en';
  lesson?: Lesson;
  exercise?: Exercise;
  focusBlockId?: string;
  lab?: { state: LabState; transcript: LabEvent[]; scenario: string; title: string };
  progress: UserProgress;
  masteries: SkillMastery[];
  lastEvaluation?: EvaluationResult;
  revealedHintIds?: string[];
  completedLessonIds?: string[];
}

export class TutorService {
  #provider: AiProvider;
  readonly #locale: 'it' | 'en';
  readonly #generation: Omit<GenerationOptions, 'mode' | 'signal'>;
  /** Latest assembled context, read by the offline provider. */
  #lastContext: TutorContext | null = null;
  readonly #offline: OfflineProvider;

  constructor(options: TutorServiceOptions) {
    this.#provider = options.provider;
    this.#locale = options.locale;
    this.#generation = options.generation;
    this.#offline = new OfflineProvider(() => this.#lastContext);
  }

  get providerName(): string {
    return this.#provider.name;
  }
  get model(): string {
    return this.#provider.model;
  }

  probe(): Promise<{ reachable: boolean; detail: string }> {
    return this.#provider.probe();
  }

  assembleContext(input: AssembleContextInput): TutorContext {
    const context: TutorContext = {
      locale: input.locale,
      learner: {
        level: input.progress.level,
        xp: input.progress.xp,
        masteryBySkill: masteryToContext(input.masteries),
        weakSkills: weakestSkills(input.masteries, 4).map((m) => m.skillId),
        strongSkills: strongestSkills(input.masteries, 3).map((m) => m.skillId),
        recentFailures: collectRecentFailures(input.progress),
        completedLessons: input.completedLessonIds ?? [],
      },
    };

    if (input.lesson) {
      const theoryBlocks = [...input.lesson.theory, ...(input.lesson.practice ?? [])];
      const focus = input.focusBlockId
        ? theoryBlocks.find((b) => b.id === input.focusBlockId)
        : undefined;
      context.lesson = {
        id: input.lesson.id,
        title: input.lesson.title,
        difficulty: input.lesson.difficulty,
        objectives: input.lesson.objectives,
        skills: input.lesson.skills,
        theoryDigest: theoryBlocks.map(blockToPlainText).join('\n\n'),
        ...(focus
          ? { focusBlock: { id: focus.id, kind: focus.kind, text: blockToPlainText(focus) } }
          : {}),
      };
    }

    if (input.exercise) {
      const revealed = new Set(input.revealedHintIds ?? []);
      const hintsRevealed = input.exercise.hints
        .filter((h) => revealed.has(h.id))
        .map((h) => ({ level: h.level, text: h.text }));
      const nextHint = input.exercise.hints
        .filter((h) => !revealed.has(h.id))
        .sort((a, b) => a.level - b.level)[0];
      const objectiveStatus = deriveObjectiveStatus(input.exercise, input.lastEvaluation);

      context.exercise = {
        id: input.exercise.id,
        title: input.exercise.title,
        kind: input.exercise.kind,
        objective: input.exercise.mission.objective,
        objectives: objectiveStatus,
        hintsRevealed,
        ...(nextHint ? { nextHint: { level: nextHint.level, text: nextHint.text } } : {}),
        solution: {
          summary: input.exercise.solution.summary,
          explanation: input.exercise.solution.explanation,
        },
      };
    }

    if (input.lab) {
      context.lab = {
        instanceId: input.lab.state.instanceId,
        specId: input.lab.state.specId,
        title: input.lab.title,
        scenario: input.lab.scenario,
        surfaces: input.lab.state.surfaces,
        recentEvents: input.lab.transcript.slice(-12).map(compactEvent),
        signals: [...new Set(input.lab.state.signals.map((s) => s.name))],
        flags: input.lab.state.flags,
      };
    }

    if (input.lastEvaluation) {
      context.lastEvaluation = {
        passed: input.lastEvaluation.passed,
        score: input.lastEvaluation.score,
        ...(input.lastEvaluation.failureReason ? { failureReason: input.lastEvaluation.failureReason } : {}),
        criteria: input.lastEvaluation.criteria.map((c) => ({ label: c.label, passed: c.passed })),
      };
    }

    this.#lastContext = context;
    return context;
  }

  /**
   * Stream a tutor reply. Emits meta first, then deltas, then a final message.
   * On provider failure it transparently switches to the offline tutor and
   * marks the reply `offline: true` so the UI can label it.
   */
  async *respond(
    mode: TutorMode,
    context: TutorContext,
    history: TutorMessage[],
    userMessage: string | undefined,
    signal?: AbortSignal,
  ): AsyncGenerator<TutorStreamChunk> {
    this.#lastContext = context;
    const prompt = buildPrompt(mode, context, history, userMessage);
    const generation: GenerationOptions = {
      ...this.#generation,
      mode,
      ...(signal ? { signal } : {}),
    };

    const isOffline = this.#provider.name === 'offline';
    yield { type: 'meta', provider: this.#provider.name, model: this.#provider.model, offline: isOffline };

    let text = '';
    let usedOffline = isOffline;
    try {
      for await (const delta of this.#provider.stream(prompt, generation)) {
        text += delta;
        yield { type: 'delta', text: delta };
      }
    } catch (error) {
      if (error instanceof ProviderError && error.kind === 'aborted') {
        yield { type: 'error', message: 'Interrotto.' };
        return;
      }
      // Fall back to the deterministic tutor rather than failing the turn.
      usedOffline = true;
      const detail = error instanceof Error ? error.message : String(error);
      const fallback = compose(mode, context);
      if (text.length === 0) {
        yield {
          type: 'delta',
          text: `⚠️ Provider "${this.#provider.name}" non raggiungibile (${detail}). Passo al tutor offline.\n\n`,
        };
        for (const token of fallback.match(/\S+\s*/g) ?? [fallback]) {
          yield { type: 'delta', text: token };
          text += token;
        }
      }
    }

    const message: TutorMessage = {
      id: `tutor_${Date.now().toString(36)}`,
      role: 'tutor',
      mode,
      content: text.trim() || '…',
      at: Date.now(),
      offline: usedOffline,
    };
    yield { type: 'done', message };
  }
}

function deriveObjectiveStatus(
  exercise: Exercise,
  evaluation: EvaluationResult | undefined,
): { label: string; passed: boolean }[] {
  const objResults = evaluation
    ? new Map(evaluation.objectives.map((o) => [o.id, o.passed]))
    : new Map<string, boolean>();
  return exercise.objectives.map((o) => ({ label: o.label, passed: objResults.get(o.id) ?? false }));
}

function collectRecentFailures(
  progress: UserProgress,
): { exerciseId: string; score: number; missed: string[] }[] {
  const failures: { exerciseId: string; score: number; missed: string[]; at: number }[] = [];
  for (const lesson of Object.values(progress.lessons)) {
    for (const [exerciseId, result] of Object.entries(lesson.exercises)) {
      if (!result.passed && result.attempts > 0) {
        failures.push({ exerciseId, score: result.lastScore, missed: [], at: result.lastAttemptAt });
      }
    }
  }
  return failures.sort((a, b) => b.at - a.at).slice(0, 3).map(({ at: _at, ...rest }) => rest);
}
