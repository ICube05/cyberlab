import { create } from 'zustand';
import type {
  CurriculumResponse,
  Exercise,
  HealthResponse,
  LabAction,
  LabActionResponse,
  LabState,
  LessonResponse,
  ProgressResponse,
  SubmitAttemptResponse,
  TutorMessage,
  TutorMode,
} from '@cyberlab/core';
import { api, streamTutor } from './api.js';

/**
 * The single client store.
 *
 * One store, sliced by concern (session/health, curriculum, the open lesson,
 * the live lab, the active attempt, the tutor). Keeping it in one place means
 * the lab panel, the mission panel and the tutor all read the same lab state —
 * no prop-drilling, no duplicated fetches, and the "mastery updated" animation
 * can fire from wherever the submit resolves.
 */

export interface Toast {
  id: string;
  kind: 'info' | 'success' | 'warn' | 'error' | 'xp' | 'badge' | 'unlock';
  title: string;
  detail?: string;
}

export interface AttemptUi {
  attemptId: string;
  exercise: Exercise;
  hintsRevealed: { id: string; level: number; text: string }[];
  report: Record<string, string>;
  liveObjectives: { id: string; label: string; passed: boolean }[];
  result?: SubmitAttemptResponse;
  submitting: boolean;
}

interface State {
  // session
  health?: HealthResponse;
  booted: boolean;
  bootError?: string;

  // curriculum + progress
  curriculum?: CurriculumResponse;
  progress?: ProgressResponse;

  // navigation
  activeLessonId?: string;
  lesson?: LessonResponse;
  lessonLoading: boolean;
  focusBlockId?: string;

  // lab
  lab?: LabState;
  labSpecId?: string;
  labBusy: boolean;
  lastAction?: LabActionResponse;

  // attempt
  attempt?: AttemptUi;

  // tutor
  tutorMode: TutorMode;
  tutorMessages: TutorMessage[];
  tutorStreaming: boolean;
  tutorProvider: string;
  tutorPanelOpen: boolean;

  // ui
  sidebarOpen: boolean;
  /** Collapses the lesson outline inside the roadmap sidebar. */
  outlineCollapsed: boolean;
  commandPaletteOpen: boolean;
  toasts: Toast[];
  seenBlocks: Set<string>;

  // actions
  boot(): Promise<void>;
  refreshProgress(): Promise<void>;
  openLesson(id: string): Promise<void>;
  setFocusBlock(id?: string): void;
  markSeen(blockId: string): void;
  answerQuiz(blockId: string, selected: string[]): Promise<{ correct: boolean; explanation: string; correctAnswers: string[] }>;

  startLab(specId: string, seed?: string): Promise<void>;
  runAction(action: LabAction): Promise<LabActionResponse | undefined>;
  resetLab(): Promise<void>;

  startAttempt(exercise: Exercise): Promise<void>;
  abandonAttempt(): Promise<void>;
  revealHint(hintId: string): Promise<void>;
  setReportField(field: string, value: string): void;
  submitAttempt(): Promise<void>;
  clearAttemptResult(): void;

  setTutorMode(mode: TutorMode): void;
  toggleTutor(open?: boolean): void;
  askTutor(message?: string, mode?: TutorMode): Promise<void>;

  toggleSidebar(open?: boolean): void;
  toggleOutline(collapsed?: boolean): void;
  toggleCommandPalette(open?: boolean): void;
  pushToast(t: Omit<Toast, 'id'>): void;
  dismissToast(id: string): void;
}

let toastSeq = 0;

/**
 * Panel layout is a preference, not session state.
 *
 * Collapsing the tutor or the lesson outline is something a learner does to get
 * room to work; re-expanding it on every reload would undo the choice. These
 * two helpers keep it in localStorage and never throw when it is unavailable.
 */
function readFlag(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw === '1';
  } catch {
    return fallback;
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* private mode, blocked storage — the flag simply does not persist. */
  }
}

/** String equivalents, used to remember which lesson the learner had open. */
function readStr(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStr(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — persistence is best-effort, never fatal. */
  }
}

export const useStore = create<State>((set, get) => ({
  booted: false,
  lessonLoading: false,
  labBusy: false,
  tutorMode: 'ask',
  tutorMessages: [],
  tutorStreaming: false,
  tutorProvider: 'offline',
  tutorPanelOpen: readFlag('cyberlab.tutorOpen', true),
  sidebarOpen: readFlag('cyberlab.sidebarOpen', true),
  outlineCollapsed: readFlag('cyberlab.outlineCollapsed', false),
  commandPaletteOpen: false,
  toasts: [],
  seenBlocks: new Set(),

  async boot() {
    try {
      const [health, curriculum, progress] = await Promise.all([api.health(), api.curriculum(), api.progress()]);
      set({ health, curriculum, progress, booted: true, tutorProvider: health.aiProvider });
      // Reopen the lesson the learner was last on, so a reload lands them where
      // they left off instead of on an empty shell. Only for lessons that can
      // actually be entered — a saved id for a since-locked/planned lesson is
      // ignored rather than throwing a boot-time toast.
      const last = readStr('cyberlab.lastLesson');
      if (last) {
        const summary = curriculum.lessons.find((l) => l.id === last);
        if (summary && summary.status !== 'planned') void get().openLesson(last);
      }
    } catch (error) {
      set({ bootError: error instanceof Error ? error.message : 'boot failed', booted: true });
    }
  },

  /**
   * Refetch progress — and fold it back into the open lesson.
   *
   * `lesson.progress` is filled once, by `openLesson`, so without this it went
   * stale the moment you answered a quiz or finished a mission: the completion
   * panel kept saying "0 risposti", and a passed mission never got its tick.
   * Patching each reader to look somewhere fresher only moved the problem, so
   * the lesson payload is refreshed at the source instead — one place to keep
   * current, and every reader of `lesson.progress` is correct by construction.
   */
  async refreshProgress() {
    const progress = await api.progress();
    const curriculum = await api.curriculum();
    set((s) => {
      const live = s.lesson ? progress.progress.lessons[s.lesson.lesson.id] : undefined;
      if (!s.lesson || !live) return { progress, curriculum };
      return {
        progress,
        curriculum,
        lesson: {
          ...s.lesson,
          progress: {
            state: live.state,
            blocksSeen: live.blocksSeen,
            quiz: live.quiz,
            exercises: live.exercises,
          },
        },
      };
    });
  },

  async openLesson(id) {
    if (get().activeLessonId === id && get().lesson) return;
    set({ lessonLoading: true, activeLessonId: id });
    writeStr('cyberlab.lastLesson', id);
    try {
      const lesson = await api.lesson(id);
      set({ lesson, lessonLoading: false, seenBlocks: new Set(lesson.progress?.blocksSeen ?? []) });
      // Reset tutor thread when switching lessons.
      set({ tutorMessages: [] });
    } catch (error) {
      set({ lessonLoading: false });
      get().pushToast({ kind: 'error', title: 'Impossibile aprire la lezione', detail: String(error) });
    }
  },

  setFocusBlock(id) {
    set({ focusBlockId: id });
  },

  markSeen(blockId) {
    const seen = get().seenBlocks;
    if (seen.has(blockId)) return;
    const next = new Set(seen);
    next.add(blockId);
    set({ seenBlocks: next });
    const lessonId = get().activeLessonId;
    if (lessonId) void api.markSeen(lessonId, [blockId]).then(() => get().refreshProgress());
  },

  async answerQuiz(blockId, selected) {
    const lessonId = get().activeLessonId!;
    const res = await api.answerQuiz(lessonId, blockId, selected);
    void get().refreshProgress();
    if (res.correct) get().pushToast({ kind: 'success', title: 'Corretto', detail: '+XP' });
    return res;
  },

  async startLab(specId, seed) {
    set({ labBusy: true });
    try {
      const res = await api.createLab(specId, seed);
      set({ lab: res.state, labSpecId: specId, labBusy: false, lastAction: undefined });
      get().pushToast({ kind: 'info', title: 'Laboratorio avviato', detail: res.spec.title });
    } catch (error) {
      set({ labBusy: false });
      get().pushToast({ kind: 'error', title: 'Avvio lab fallito', detail: String(error) });
    }
  },

  async runAction(action) {
    const lab = get().lab;
    if (!lab) return undefined;
    set({ labBusy: true });
    try {
      const res = await api.labAction(lab.instanceId, action);
      const prevFlags = get().lab?.flags.length ?? 0;
      set({ lab: res.state, lastAction: res, labBusy: false });
      if (res.preview && get().attempt) {
        set((s) => (s.attempt ? { attempt: { ...s.attempt, liveObjectives: res.preview!.objectives } } : {}));
        // Celebrate a newly-passed objective.
      }
      if (res.state.flags.length > prevFlags) {
        get().pushToast({ kind: 'success', title: '🚩 Flag catturata', detail: res.state.flags.at(-1) });
      }
      return res;
    } catch (error) {
      set({ labBusy: false });
      get().pushToast({ kind: 'error', title: 'Azione fallita', detail: String(error) });
      return undefined;
    }
  },

  async resetLab() {
    const lab = get().lab;
    if (!lab) return;
    const res = await api.resetLab(lab.instanceId);
    set({ lab: res.state, lastAction: undefined });
    get().pushToast({ kind: 'info', title: 'Laboratorio resettato' });
  },

  async startAttempt(exercise) {
    const lab = get().lab;
    try {
      const res = await api.startAttempt(exercise.id, lab?.instanceId);
      set({
        attempt: {
          attemptId: res.attemptId,
          exercise,
          hintsRevealed: [],
          report: {},
          liveObjectives: exercise.objectives.map((o) => ({ id: o.id, label: o.label, passed: false })),
          submitting: false,
        },
      });
      get().pushToast({ kind: 'info', title: 'Missione avviata', detail: exercise.title });
    } catch (error) {
      get().pushToast({ kind: 'error', title: 'Avvio missione fallito', detail: String(error) });
    }
  },

  /**
   * Leave an active mission without being graded.
   *
   * The live mission console had no exit: once started, the only way out was
   * Submit — which meant a failed attempt on record for opening the wrong one.
   * Abandoning closes the attempt server-side so it never reaches mastery, and
   * releases the lab from the objective preview.
   */
  async abandonAttempt() {
    const attempt = get().attempt;
    if (!attempt) return;
    set({ attempt: undefined });
    try {
      await api.abandonAttempt(attempt.attemptId);
    } catch {
      // The mission is already closed for the learner; a failed cleanup call
      // must not put them back inside it.
    }
    get().pushToast({ kind: 'info', title: 'Missione abbandonata', detail: 'Nessuna valutazione registrata.' });
  },

  async revealHint(hintId) {
    const attempt = get().attempt;
    if (!attempt) return;
    const res = await api.revealHint(attempt.attemptId, hintId);
    set((s) =>
      s.attempt ? { attempt: { ...s.attempt, hintsRevealed: [...s.attempt.hintsRevealed, res.hint] } } : {},
    );
  },

  setReportField(field, value) {
    set((s) => (s.attempt ? { attempt: { ...s.attempt, report: { ...s.attempt.report, [field]: value } } } : {}));
  },

  async submitAttempt() {
    const attempt = get().attempt;
    if (!attempt) return;
    set((s) => (s.attempt ? { attempt: { ...s.attempt, submitting: true } } : {}));
    try {
      const result = await api.submitAttempt(attempt.attemptId, attempt.report);
      set((s) => (s.attempt ? { attempt: { ...s.attempt, result, submitting: false } } : {}));
      set({ progress: result.progress });
      // Celebrate.
      if (result.evaluation.passed) {
        get().pushToast({ kind: 'xp', title: `Missione completata · ${result.evaluation.score}/100`, detail: `+${result.evaluation.xpAwarded} XP` });
      }
      for (const badge of result.newBadges) {
        get().pushToast({ kind: 'badge', title: 'Nuovo badge', detail: badge });
      }
      for (const lessonId of result.unlockedLessons) {
        get().pushToast({ kind: 'unlock', title: 'Lezione sbloccata', detail: lessonId });
      }
      void get().refreshProgress();
    } catch (error) {
      set((s) => (s.attempt ? { attempt: { ...s.attempt, submitting: false } } : {}));
      get().pushToast({ kind: 'error', title: 'Valutazione fallita', detail: String(error) });
    }
  },

  /**
   * Close a graded mission and go back to the mission list.
   *
   * Dropping only `result` used to leave the finished attempt in place, so the
   * panel fell back to the live-mission view of a mission that was already
   * evaluated: the objectives were done and the only way out was abandoning.
   * The attempt is closed on the server by the submit itself, so there is
   * nothing to release here — just stop showing it.
   */
  clearAttemptResult() {
    set({ attempt: undefined });
  },

  setTutorMode(mode) {
    set({ tutorMode: mode });
  },

  toggleTutor(open) {
    set((s) => {
      const next = open ?? !s.tutorPanelOpen;
      writeFlag('cyberlab.tutorOpen', next);
      return { tutorPanelOpen: next };
    });
  },

  async askTutor(message, mode) {
    const state = get();
    const useMode = mode ?? state.tutorMode;
    if (mode) set({ tutorMode: mode });
    if (state.tutorStreaming) return;

    const userMsg: TutorMessage | null = message
      ? { id: `u${Date.now()}`, role: 'user', content: message, at: Date.now() }
      : null;
    const history = state.tutorMessages;
    const placeholder: TutorMessage = { id: `t${Date.now()}`, role: 'tutor', mode: useMode, content: '', at: Date.now() };

    set({
      tutorMessages: [...history, ...(userMsg ? [userMsg] : []), placeholder],
      tutorStreaming: true,
      tutorPanelOpen: true,
    });

    try {
      await streamTutor(
        {
          mode: useMode,
          ...(message ? { message } : {}),
          ...(state.activeLessonId ? { lessonId: state.activeLessonId } : {}),
          ...(state.attempt ? { exerciseId: state.attempt.exercise.id } : {}),
          ...(state.lab ? { labInstanceId: state.lab.instanceId } : {}),
          ...(state.focusBlockId ? { focusBlockId: state.focusBlockId } : {}),
          history,
        },
        (chunk) => {
          if (chunk.type === 'meta') {
            set({ tutorProvider: chunk.offline ? 'offline' : chunk.provider });
          } else if (chunk.type === 'delta') {
            set((s) => ({
              tutorMessages: s.tutorMessages.map((m) =>
                m.id === placeholder.id ? { ...m, content: m.content + chunk.text } : m,
              ),
            }));
          } else if (chunk.type === 'done') {
            set((s) => ({
              tutorMessages: s.tutorMessages.map((m) => (m.id === placeholder.id ? { ...chunk.message, id: m.id } : m)),
            }));
          } else if (chunk.type === 'error') {
            set((s) => ({
              tutorMessages: s.tutorMessages.map((m) =>
                m.id === placeholder.id ? { ...m, content: m.content || `⚠️ ${chunk.message}` } : m,
              ),
            }));
          }
        },
      );
    } catch (error) {
      set((s) => ({
        tutorMessages: s.tutorMessages.map((m) =>
          m.id === placeholder.id ? { ...m, content: m.content || `⚠️ ${String(error)}` } : m,
        ),
      }));
    } finally {
      set({ tutorStreaming: false });
    }
  },

  toggleSidebar(open) {
    set((s) => {
      const next = open ?? !s.sidebarOpen;
      writeFlag('cyberlab.sidebarOpen', next);
      return { sidebarOpen: next };
    });
  },
  toggleOutline(collapsed) {
    set((s) => {
      const next = collapsed ?? !s.outlineCollapsed;
      writeFlag('cyberlab.outlineCollapsed', next);
      return { outlineCollapsed: next };
    });
  },
  toggleCommandPalette(open) {
    set((s) => ({ commandPaletteOpen: open ?? !s.commandPaletteOpen }));
  },
  pushToast(t) {
    const id = `toast_${(toastSeq += 1)}`;
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    const ttl = t.kind === 'error' ? 6000 : 3800;
    setTimeout(() => get().dismissToast(id), ttl);
  },
  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));
