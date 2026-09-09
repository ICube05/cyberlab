/**
 * Generated challenges — "l'IA inventa la situazione, il motore la valuta".
 *
 * The split matters, and it is the same one the exercise generator already
 * argues for: a model cannot be trusted to invent something *gradable*, because
 * grading needs criteria that match signals a real target actually raises. So
 * nothing here lets a model near the grading.
 *
 *   · the mechanics — lab, objectives, criteria, scoring — come from
 *     `generateExercise`, derived from an authored template on a real lab;
 *   · the AI writes only the *situation*: who the client is, what happened,
 *     why you are looking. Framing, never facts the score depends on.
 *
 * With no provider configured the authored framing is used as-is, so the tab
 * works offline — it is simply less novel, which is an honest trade.
 *
 * The registry exists because a generated exercise is not in the curriculum:
 * without it the attempt routes could not resolve the id, and a challenge would
 * be un-startable and un-gradable.
 */
import type { AiProvider } from '@cyberlab/ai';
import type { Exercise, Lesson } from '@cyberlab/core';
import { getExercise } from '@cyberlab/curriculum';

/** Most recent challenges, newest last. Bounded so a long session cannot grow it forever. */
const generated = new Map<string, Exercise>();
const MAX_KEPT = 200;

export function rememberChallenge(exercise: Exercise): void {
  generated.set(exercise.id, exercise);
  while (generated.size > MAX_KEPT) {
    const oldest = generated.keys().next().value;
    if (oldest === undefined) break;
    generated.delete(oldest);
  }
}

/**
 * Resolve an exercise id from the curriculum first, then from generated
 * challenges. Every route that used `getExercise` must go through this, or a
 * generated challenge silently becomes unplayable.
 */
export function resolveExercise(id: string): Exercise | undefined {
  return getExercise(id) ?? generated.get(id);
}

const SYSTEM = `Sei l'autore degli scenari di un laboratorio di cybersecurity in italiano.
Scrivi SOLO l'ambientazione di un incidente: chi è il cliente, cosa è successo, perché stanno guardando.
Regole assolute:
- 2 o 3 frasi, massimo 55 parole, in italiano, rivolgendoti a chi legge con "tu".
- NON spiegare come si risolve, non suggerire comandi, payload, parametri o passaggi.
- NON promettere risultati né dire cosa troverà chi indaga.
- Nessun elenco puntato, nessun titolo, nessuna formattazione: testo semplice.
Restituisci soltanto il testo dell'ambientazione.`;

/**
 * Ask the model for the scenario framing.
 *
 * Deliberately given the vulnerability class and the objective *labels* but not
 * the criteria: it needs to know what the mission is about to set a scene, not
 * how the mission is scored. Any failure — no provider, timeout, empty or
 * over-long answer — returns null and the caller keeps the authored text.
 */
export async function writeScenario(
  provider: AiProvider,
  lesson: Lesson,
  exercise: Exercise,
  signal?: AbortSignal,
): Promise<string | null> {
  if (provider.name === 'offline') return null;

  const objectives = exercise.objectives.map((o) => `- ${o.label}`).join('\n');
  const prompt = {
    system: SYSTEM,
    messages: [
      {
        role: 'user' as const,
        content:
          `Argomento della lezione: ${lesson.title}\n` +
          `Titolo della missione: ${exercise.title}\n` +
          `Obiettivo: ${exercise.mission.objective}\n` +
          `Punti da dimostrare (solo per capire il tema, non citarli):\n${objectives}\n\n` +
          `Scrivi l'ambientazione.`,
      },
    ],
  };

  try {
    let text = '';
    for await (const delta of provider.stream(prompt, {
      temperature: 0.9,
      maxTokens: 220,
      timeoutMs: 15_000,
      mode: 'challenge',
      ...(signal ? { signal } : {}),
    })) {
      text += delta;
      if (text.length > 1200) break; // A runaway answer is not framing.
    }
    const cleaned = text.trim().replace(/\s+/g, ' ');
    // Too short to be a scene, or long enough to be something other than one.
    if (cleaned.length < 40 || cleaned.length > 600) return null;
    return cleaned;
  } catch {
    return null; // Framing is a nicety; never fail a challenge over it.
  }
}
