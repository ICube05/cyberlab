import type { TutorContext, TutorMode } from '@cyberlab/core';
import type { AiProvider, GenerationOptions, RenderedPrompt } from './provider.js';

/**
 * The deterministic tutor.
 *
 * This is the honest fallback the spec asks for: when no AI provider is
 * configured or reachable, the tutor still works, because the *pedagogy is
 * authored into the content*. Hints, solutions and explanations already exist
 * on every exercise; the offline tutor composes them against the learner's real
 * lab transcript and evaluation. It cannot free-form, but it never lies and it
 * never leaks a solution in hint mode.
 *
 * It implements the same `AiProvider` interface, so the tutor service treats it
 * exactly like Ollama or Gemini — it just happens to read from context instead
 * of a model.
 */
export class OfflineProvider implements AiProvider {
  readonly name = 'offline';
  readonly model = 'deterministic';
  #context: () => TutorContext | null;

  constructor(contextRef: () => TutorContext | null) {
    this.#context = contextRef;
  }

  async probe(): Promise<{ reachable: boolean; detail: string }> {
    return { reachable: true, detail: 'Deterministic offline tutor (authored pedagogy, no model)' };
  }

  async *stream(prompt: RenderedPrompt, options: GenerationOptions): AsyncIterable<string> {
    const context = this.#context();
    const text = context
      ? compose(options.mode, context)
      : "Non ho il contesto della lezione in questo momento. Apri una lezione o un esercizio e riprova.";
    // Stream word by word so the UI behaves identically to a real provider.
    for (const token of text.match(/\S+\s*/g) ?? [text]) {
      if (options.signal?.aborted) return;
      yield token;
    }
  }
}

export function compose(mode: TutorMode, ctx: TutorContext): string {
  switch (mode) {
    case 'teach':
      return composeTeach(ctx);
    case 'hint':
      return composeHint(ctx);
    case 'review':
      return composeReview(ctx);
    case 'explain':
      return composeExplain(ctx);
    case 'debug':
      return composeDebug(ctx);
    case 'challenge':
      return composeChallenge(ctx);
    case 'ask':
      return composeAsk(ctx);
  }
}

function composeTeach(ctx: TutorContext): string {
  const parts: string[] = [];
  if (ctx.lesson) {
    parts.push(`**${ctx.lesson.title}**`);
    if (ctx.lesson.focusBlock?.text) {
      parts.push(ctx.lesson.focusBlock.text);
    } else if (ctx.lesson.theoryDigest) {
      parts.push(firstParagraphs(ctx.lesson.theoryDigest, 2));
    }
    if (ctx.lesson.objectives.length) {
      parts.push('Alla fine di questa lezione saprai:\n' + ctx.lesson.objectives.map((o) => `- ${o}`).join('\n'));
    }
  } else {
    parts.push('Apri una lezione per una spiegazione contestuale.');
  }
  parts.push(offlineNote());
  return parts.join('\n\n');
}

function composeHint(ctx: TutorContext): string {
  const ex = ctx.exercise;
  if (!ex) return 'Avvia un esercizio e ti darò un indizio mirato.' + '\n\n' + offlineNote();

  // Aim exactly at the next sealed hint — never the solution.
  const next = ex.nextHint;
  const pending = ex.objectives.filter((o) => !o.passed);
  const parts: string[] = [];

  if (ex.hintsRevealed.length > 0) {
    parts.push(`Hai già ${ex.hintsRevealed.length} indizio/i. Il prossimo passo:`);
  }
  if (next) {
    parts.push(`💡 ${next.text}`);
  } else if (ex.hintsRevealed.length > 0) {
    parts.push('Hai visto tutti gli indizi disponibili. Rileggi il primo obiettivo ancora aperto e prova la modalità DEBUG per confrontare atteso e reale.');
  } else {
    parts.push('💡 Parti dall\'obiettivo: ' + ex.objective);
  }
  if (pending.length) {
    parts.push(`Obiettivo ancora aperto: **${pending[0]!.label}**.`);
  }
  // Ground the hint in what they actually did.
  const lastEvent = ctx.lab?.recentEvents.at(-1);
  if (lastEvent) {
    parts.push(`(La tua ultima azione: \`${lastEvent.summary}\` → ${lastEvent.outcome}.)`);
  }
  return parts.join('\n\n');
}

function composeReview(ctx: TutorContext): string {
  const events = ctx.lab?.recentEvents ?? [];
  if (events.length === 0) {
    return 'Non hai ancora interagito con il laboratorio, quindi non c\'è niente da rivedere. Manda una richiesta o esegui un comando e poi torna qui.' + '\n\n' + offlineNote();
  }
  const parts: string[] = [`Ho ripercorso le tue ${events.length} azioni nel laboratorio.`];
  const signals = ctx.lab?.signals ?? [];

  const worked = events.filter((e) => e.signals && e.signals.length > 0);
  if (worked.length) {
    parts.push(
      'Azioni che hanno prodotto un segnale di sicurezza:\n' +
        worked
          .slice(-5)
          .map((e) => `- \`${e.summary}\` → ${e.signals!.join(', ')}`)
          .join('\n'),
    );
  }
  if (signals.some((s) => s.includes('bypass'))) {
    parts.push('✅ Hai effettivamente aggirato un controllo di autorizzazione — il server ha servito una risorsa che non era tua. Questo è il cuore dell\'esercizio.');
  }
  if (ctx.lab?.flags.length) {
    parts.push(`🚩 Flag catturata: \`${ctx.lab.flags.join(', ')}\`.`);
  }
  const objectivesLeft = ctx.exercise?.objectives.filter((o) => !o.passed) ?? [];
  if (objectivesLeft.length) {
    parts.push('Manca ancora:\n' + objectivesLeft.map((o) => `- ${o.label}`).join('\n'));
  } else if (ctx.exercise) {
    parts.push('Hai coperto tutti gli obiettivi. Puoi inviare il tentativo per la valutazione.');
  }
  parts.push(offlineNote());
  return parts.join('\n\n');
}

function composeExplain(ctx: TutorContext): string {
  const parts: string[] = [];
  const sol = ctx.exercise?.solution;
  if (sol) {
    parts.push(sol.explanation);
  } else if (ctx.lesson?.theoryDigest) {
    parts.push(firstParagraphs(ctx.lesson.theoryDigest, 1));
  }
  const signals = ctx.lab?.signals ?? [];
  const mechanism = explainSignals(signals);
  if (mechanism) parts.push(mechanism);
  if (parts.length === 0) parts.push('Ottieni prima un risultato nel laboratorio e potrò spiegarti perché ha funzionato.');
  parts.push(offlineNote());
  return parts.join('\n\n');
}

function composeDebug(ctx: TutorContext): string {
  const parts: string[] = [];
  const ev = ctx.lastEvaluation;
  const events = ctx.lab?.recentEvents ?? [];

  if (ev && !ev.passed) {
    const missed = ev.criteria.filter((c) => !c.passed);
    parts.push(`Il tentativo non è passato (score ${ev.score}/100). Criteri non soddisfatti:`);
    parts.push(missed.map((c) => `- ✗ ${c.label}`).join('\n'));
    if (ev.failureReason) parts.push(ev.failureReason);
  }

  const errors = events.filter((e) => /error|denied|4\d\d|5\d\d|exit [1-9]/.test(e.outcome));
  if (errors.length) {
    parts.push(
      'Le azioni che non hanno prodotto il risultato atteso:\n' +
        errors
          .slice(-4)
          .map((e) => `- \`${e.summary}\` → ${e.outcome}`)
          .join('\n'),
    );
    parts.push('Confronta cosa ti aspettavi con cosa è tornato: la differenza è la diagnosi.');
  }
  if (parts.length === 0) {
    parts.push('Descrivi cosa ti aspettavi e cosa è successo. Intanto: le tue ultime azioni non mostrano errori evidenti, quindi forse manca un obiettivo, non un comando.');
  }
  parts.push(offlineNote());
  return parts.join('\n\n');
}

function composeChallenge(ctx: TutorContext): string {
  const skill = ctx.learner.strongSkills[0] ?? ctx.lesson?.skills[0] ?? 'questa tecnica';
  return [
    `Sfida su **${skill}**:`,
    ctx.exercise
      ? `Rifai l'obiettivo "${ctx.exercise.objective}" ma senza usare nessun indizio, e poi scrivi in una frase la mitigazione corretta.`
      : 'Apri un esercizio e prova a completarlo senza indizi, poi spiega la mitigazione.',
    'Quando sei pronto, chiedi al sistema di generare una variante più difficile con il pulsante Challenge.',
    offlineNote(),
  ].join('\n\n');
}

function composeAsk(ctx: TutorContext): string {
  // Without a model we cannot answer arbitrary questions; we point at the most
  // relevant authored material and are honest about the limitation.
  const parts: string[] = [];
  if (ctx.lesson?.focusBlock?.text) parts.push(ctx.lesson.focusBlock.text);
  else if (ctx.lesson?.theoryDigest) parts.push(firstParagraphs(ctx.lesson.theoryDigest, 1));
  parts.push(
    'Per domande libere serve un provider AI attivo (Ollama o Gemini). Senza, posso mostrarti la teoria pertinente e analizzare quello che fai nel laboratorio — prova le modalità Review, Explain o Hint.',
  );
  return parts.join('\n\n');
}

// ── mechanism explanations keyed on real signals ─────────────────────────────

function explainSignals(signals: readonly string[]): string | null {
  const set = new Set(signals);
  if (set.has('authz.horizontal.bypass')) {
    return 'Meccanismo: il server ha usato l\'`id` che hai fornito tu (dal client) per recuperare la risorsa, ma non ha mai confrontato quell\'id con l\'utente della tua sessione. Nessun confronto = nessun controllo di autorizzazione orizzontale. Cambiando l\'id hai chiesto la risorsa di un altro utente e il server te l\'ha data.';
  }
  if (set.has('sqli.auth-bypass')) {
    return 'Meccanismo: la query di login era costruita concatenando il tuo input. Chiudendo la stringa e commentando il resto, la condizione sulla password è sparita dalla query: SQLite ha valutato solo lo username e ha restituito una riga, quindi il server ti ha considerato autenticato.';
  }
  if (set.has('sqli.union.cross-table')) {
    return 'Meccanismo: con UNION SELECT hai aggiunto una seconda query con lo stesso numero di colonne, facendo restituire al server righe che provengono da una tabella diversa da quella prevista.';
  }
  if (set.has('privesc.flag-read') || set.has('privesc.sudo-find')) {
    return 'Meccanismo: `sudo` ti permetteva di eseguire `find` come root. `find -exec` esegue un comando con gli stessi privilegi di find — quindi come root — e root può leggere `/root/flag.txt` che al tuo utente era negato.';
  }
  return null;
}

function firstParagraphs(text: string, count: number): string {
  return text.split('\n\n').slice(0, count).join('\n\n');
}

function offlineNote(): string {
  return '_(Tutor offline deterministico: uso la pedagogia scritta nella lezione e le tue azioni reali nel lab. Per risposte libere, configura Ollama o Gemini.)_';
}
