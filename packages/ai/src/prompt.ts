import type { TutorContext, TutorMessage, TutorMode } from '@cyberlab/core';
import type { RenderedPrompt } from './provider.js';

/**
 * Prompt construction.
 *
 * The system prompt is assembled from three layers: a stable persona, a
 * mode-specific instruction block, and the structured lesson context rendered
 * to compact text. Keeping the layers separate is what makes the tutor's
 * behaviour legible and testable — you can diff exactly what changed between a
 * `hint` turn and an `explain` turn.
 *
 * The single most important rule lives here: in `hint` mode the model is handed
 * the *revealed* hints and the *next sealed* hint to aim at, but never the
 * solution. The solution is simply not in the context, so a chatty model
 * cannot leak it.
 */

const PERSONA_IT = `Sei il tutor AI di CyberLab, una piattaforma per imparare cybersecurity ed ethical hacking dentro un ambiente simile a un IDE. Parli in italiano, con tono da collega esperto e paziente: diretto, concreto, mai paternalista.

Principi:
- Insegni il PERCHÉ prima del COME. Un attacco si capisce solo capendo l'assunzione che rompe.
- Sei conciso. Niente muri di testo. Vai al punto, usa esempi.
- Ti riferisci a ciò che lo studente ha realmente fatto nel laboratorio (te lo passo nel contesto): "hai mandato GET /profile.php?id=17 e il server ha risposto 200..." è mille volte meglio di una spiegazione generica.
- Ogni tecnica offensiva la inquadri in un contesto autorizzato: laboratori isolati, CTF, sistemi con permesso esplicito. Non fornisci indicazioni per colpire sistemi reali non autorizzati, e se te lo chiedono lo rifiuti spiegando perché.
- Non inventi. Se un dato non è nel contesto, lo dici invece di inventarlo.
- Usi i termini tecnici in inglese (SQL injection, broken access control, privilege escalation) perché sono lo standard, ma spieghi in italiano.`;

const PERSONA_EN = `You are the CyberLab AI tutor, for a platform that teaches cybersecurity and ethical hacking inside an IDE-like environment. You speak plainly, like an experienced, patient colleague: direct, concrete, never condescending.

Principles:
- Teach the WHY before the HOW. An attack only makes sense once you see the assumption it breaks.
- Be concise. No walls of text. Get to the point; use examples.
- Refer to what the learner actually did in the lab (provided in context): "you sent GET /profile.php?id=17 and the server returned 200…" beats a generic explanation every time.
- Frame every offensive technique for authorised contexts only: isolated labs, CTFs, systems with explicit permission. Never give guidance for attacking real, unauthorised systems; refuse and explain why if asked.
- Do not make things up. If a fact is not in context, say so rather than inventing it.`;

const MODE_INSTRUCTIONS_IT: Record<TutorMode, string> = {
  teach:
    'MODALITÀ: TEACH. Spiega il concetto della lezione corrente partendo dai fondamenti. Struttura: cos\'è, perché esiste, come si manifesta, un esempio concreto. Collega alla teoria che lo studente ha già visto.',
  hint:
    'MODALITÀ: HINT. Lo studente è bloccato su un esercizio. Dagli UN SOLO passo avanti — la spinta più piccola che lo sblocca. NON rivelare la soluzione completa. Nel contesto trovi gli hint già visti e il prossimo hint sigillato: puntа a quel livello, non oltre. Fai una domanda che lo guidi a scoprirlo da solo quando puoi.',
  review:
    'MODALITÀ: REVIEW. Analizza ciò che lo studente ha fatto nel laboratorio (transcript nel contesto). Di\' cosa ha funzionato, cosa no, e perché. Sii specifico sulle richieste/comandi reali che ha eseguito.',
  challenge:
    'MODALITÀ: CHALLENGE. Proponi una variante più difficile di ciò che ha appena imparato. Descrivi obiettivo e vincoli; non risolverla per lui.',
  explain:
    'MODALITÀ: EXPLAIN. Lo studente ha ottenuto un risultato e vuole capire perché ha funzionato. Spiega il meccanismo esatto, dal suo input al comportamento del server, usando gli eventi reali del laboratorio.',
  ask: 'MODALITÀ: ASK. Rispondi alla domanda dello studente usando il contesto della lezione e del laboratorio. Se la domanda esce dallo scope della lezione, rispondi comunque ma riconducila al filo.',
  debug:
    'MODALITÀ: DEBUG. Il tentativo dello studente non ha prodotto il risultato atteso. Aiutalo a capire perché: confronta cosa si aspettava con cosa è successo davvero (transcript e segnali nel contesto). Guidalo alla diagnosi, non limitarti a dare la risposta.',
};

const MODE_INSTRUCTIONS_EN: Record<TutorMode, string> = {
  teach: 'MODE: TEACH. Explain the current lesson concept from fundamentals: what it is, why it exists, how it shows up, one concrete example.',
  hint: 'MODE: HINT. The learner is stuck. Give exactly ONE step forward — the smallest nudge that unblocks them. Do NOT reveal the full solution. Aim at the next sealed hint level in context, no further.',
  review: 'MODE: REVIEW. Analyse what the learner did in the lab (transcript in context). Be specific about the real requests/commands they ran.',
  challenge: 'MODE: CHALLENGE. Propose a harder variant. Give objective and constraints; do not solve it for them.',
  explain: 'MODE: EXPLAIN. Explain the exact mechanism from their input to the server behaviour, using the real lab events.',
  ask: 'MODE: ASK. Answer using the lesson and lab context.',
  debug: 'MODE: DEBUG. Their attempt did not do what they expected. Compare expected vs actual using the transcript and signals; guide them to the diagnosis.',
};

export function buildPrompt(
  mode: TutorMode,
  context: TutorContext,
  history: TutorMessage[],
  userMessage: string | undefined,
): RenderedPrompt {
  const locale = context.locale;
  const persona = locale === 'it' ? PERSONA_IT : PERSONA_EN;
  const modeBlock = (locale === 'it' ? MODE_INSTRUCTIONS_IT : MODE_INSTRUCTIONS_EN)[mode];

  const system = [persona, '', modeBlock, '', '--- CONTESTO STRUTTURATO ---', renderContext(context, mode)].join('\n');

  const messages = history
    .filter((m) => m.content.trim().length > 0)
    .slice(-12)
    .map((m) => ({ role: m.role === 'tutor' ? ('assistant' as const) : ('user' as const), content: m.content }));

  const finalUser = userMessage?.trim() || defaultUserTurn(mode, locale);
  if (messages.length === 0 || messages[messages.length - 1]!.role !== 'user') {
    messages.push({ role: 'user', content: finalUser });
  } else {
    messages[messages.length - 1] = { role: 'user', content: finalUser };
  }

  return { system, messages };
}

function defaultUserTurn(mode: TutorMode, locale: 'it' | 'en'): string {
  const it: Record<TutorMode, string> = {
    teach: 'Spiegami questo argomento.',
    hint: 'Sono bloccato, dammi un indizio.',
    review: 'Rivedi quello che ho fatto finora.',
    challenge: 'Dammi una sfida più difficile.',
    explain: 'Perché ha funzionato?',
    ask: 'Ho una domanda su questa lezione.',
    debug: 'Il mio tentativo non funziona, aiutami a capire perché.',
  };
  const en: Record<TutorMode, string> = {
    teach: 'Explain this topic to me.',
    hint: "I'm stuck, give me a hint.",
    review: 'Review what I have done so far.',
    challenge: 'Give me a harder challenge.',
    explain: 'Why did that work?',
    ask: 'I have a question about this lesson.',
    debug: 'My attempt is not working, help me understand why.',
  };
  return (locale === 'it' ? it : en)[mode];
}

/** Render the structured context to compact, model-friendly text. */
export function renderContext(context: TutorContext, mode: TutorMode): string {
  const lines: string[] = [];

  if (context.lesson) {
    const l = context.lesson;
    lines.push(`LEZIONE: ${l.title} (difficoltà: ${l.difficulty})`);
    lines.push(`Obiettivi: ${l.objectives.join('; ')}`);
    lines.push(`Skill coinvolte: ${l.skills.join(', ')}`);
    if (l.focusBlock) {
      lines.push(`Lo studente sta guardando il blocco "${l.focusBlock.kind}": ${clip(l.focusBlock.text, 280)}`);
    }
    if (mode === 'teach' || mode === 'ask') {
      lines.push(`Sintesi teoria vista: ${clip(l.theoryDigest, 900)}`);
    } else {
      lines.push(`Sintesi teoria: ${clip(l.theoryDigest, 400)}`);
    }
  }

  if (context.exercise) {
    const e = context.exercise;
    lines.push('');
    lines.push(`ESERCIZIO: ${e.title} [${e.kind}]`);
    lines.push(`Obiettivo: ${e.objective}`);
    lines.push(
      `Checklist: ${e.objectives.map((o) => `${o.passed ? '✓' : '✗'} ${o.label}`).join(' | ')}`,
    );
    if (e.hintsRevealed.length > 0) {
      lines.push(`Hint già mostrati: ${e.hintsRevealed.map((h) => `(${h.level}) ${h.text}`).join(' ')}`);
    }
    // The crucial guardrail: hint mode gets the *next* hint to aim at, and the
    // solution is deliberately absent.
    if (mode === 'hint' && e.nextHint) {
      lines.push(`Prossimo livello di hint da NON superare: (${e.nextHint.level}) ${e.nextHint.text}`);
    }
    if (mode !== 'hint' && e.solution) {
      lines.push(`Soluzione (uso interno, per spiegare dopo): ${clip(e.solution.summary, 300)}`);
      lines.push(`Spiegazione: ${clip(e.solution.explanation, 500)}`);
    }
  }

  if (context.lab) {
    const lab = context.lab;
    lines.push('');
    lines.push(`LABORATORIO: ${lab.title} — ${clip(lab.scenario, 200)}`);
    lines.push(`Superfici disponibili: ${lab.surfaces.join(', ')}`);
    if (lab.recentEvents.length > 0) {
      lines.push('Azioni recenti dello studente (le più recenti in fondo):');
      for (const event of lab.recentEvents.slice(-10)) {
        const sig = event.signals?.length ? ` [segnali: ${event.signals.join(', ')}]` : '';
        lines.push(`  #${event.seq} ${event.summary} → ${event.outcome}${sig}`);
      }
    } else {
      lines.push('Lo studente non ha ancora interagito con il laboratorio.');
    }
    if (lab.signals.length > 0) lines.push(`Segnali di sicurezza osservati: ${lab.signals.join(', ')}`);
    if (lab.flags.length > 0) lines.push(`Flag catturate: ${lab.flags.join(', ')}`);
  }

  if (context.lastEvaluation) {
    const ev = context.lastEvaluation;
    lines.push('');
    lines.push(
      `ULTIMA VALUTAZIONE: ${ev.passed ? 'superato' : 'non superato'}, score ${ev.score}/100.` +
        (ev.failureReason ? ` Motivo: ${ev.failureReason}` : ''),
    );
    lines.push(`Criteri: ${ev.criteria.map((c) => `${c.passed ? '✓' : '✗'} ${c.label}`).join(' | ')}`);
  }

  const learner = context.learner;
  lines.push('');
  lines.push(`STUDENTE: livello ${learner.level}.`);
  if (learner.weakSkills.length) lines.push(`Punti deboli: ${learner.weakSkills.join(', ')}.`);
  if (learner.strongSkills.length) lines.push(`Punti forti: ${learner.strongSkills.join(', ')}.`);
  if (learner.recentFailures.length) {
    lines.push(
      `Fallimenti recenti: ${learner.recentFailures
        .map((f) => `${f.exerciseId} (${f.score}%, mancava: ${f.missed.join('/') || '—'})`)
        .join('; ')}.`,
    );
  }

  return lines.join('\n');
}

function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max - 1) + '…' : value;
}
