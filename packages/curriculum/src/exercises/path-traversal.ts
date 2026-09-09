import type { Exercise } from '@cyberlab/core';

/**
 * Graded missions for the Path Traversal lesson, on the Helpdesk target.
 *
 * The reads go through the same Vfs the Linux labs use, so the permission
 * boundary is real: /etc/passwd comes back, /etc/shadow does not, and the
 * target raises a distinct signal for each outcome. The fix is graded on the
 * target refusing an out-of-root path once confineAttachments is on.
 */
export const pathTraversalExercises: Exercise[] = [
  // ── 1. Escape the attachment directory ─────────────────────────────────────
  {
    id: 'ex.pt.escape',
    lessonId: 'web.path-traversal',
    labSpecId: 'lab.helpdesk',
    title: 'Missione: esci dalla cartella degli allegati',
    kind: 'mission',
    difficulty: 'intermediate',
    estimatedMinutes: 14,
    mission: {
      context:
        'Il download degli allegati costruisce il percorso concatenando il nome file che gli passi alla cartella degli allegati.',
      objective:
        'Esci dalla directory prevista e leggi un file di sistema fuori da essa, poi recupera il segreto dell’applicazione dal file di configurazione .env.',
      known: [
        'Gli allegati si scaricano da GET /allegato?file=nome.txt',
        'attachmentRoot = /srv/helpdesk/allegati',
        'Il file .env dell’app si trova in /srv/helpdesk/.env',
      ],
      scope: 'Solo il laboratorio Helpdesk isolato. Non leggere nulla fuori dal lab.',
    },
    objectives: [
      { id: 'o-escape', label: 'Leggi un file fuori dalla cartella allegati', criteria: ['c-escaped'] },
      { id: 'o-passwd', label: 'Recupera /etc/passwd come prova della risalita', criteria: ['c-passwd'] },
      { id: 'o-env', label: 'Leggi /srv/helpdesk/.env e recupera il segreto (flag)', criteria: ['c-env', 'c-flag'] },
      { id: 'o-report', label: 'Riporta la sequenza usata per risalire', criteria: ['c-report'] },
    ],
    report: [
      {
        id: 'sequenza',
        label: 'Quale sequenza fa risalire di una cartella?',
        type: 'text',
        placeholder: 'es. ../',
        help: 'I caratteri che, ripetuti, escono dalla directory prevista.',
      },
    ],
    hints: [
      { id: 'h1', level: 1, text: 'Scarica prima un allegato normale: GET /allegato?file=nota-cliente.txt. Guarda nei serverNotes il percorso risolto.', weightPenalty: 0.1 },
      { id: 'h2', level: 2, text: 'Per salire di una cartella si usa ../ . Da /srv/helpdesk/allegati, quante volte devi salire per arrivare a /etc?', weightPenalty: 0.25 },
      { id: 'h3', level: 3, text: 'GET /allegato?file=../../../etc/passwd per la prova; GET /allegato?file=../.env per il segreto dell’app.', weightPenalty: 0.4 },
    ],
    criteria: [
      {
        id: 'c-escaped',
        label: 'Percorso risolto fuori dalla directory allegati',
        weight: 1.5,
        required: true,
        rule: { type: 'signal', name: 'traversal.escaped' },
        feedback: 'Il file richiesto è rimasto dentro la cartella allegati. Usa ../ per risalire prima di indicare il file.',
        dimensions: ['exploitation'],
      },
      {
        id: 'c-passwd',
        label: '/etc/passwd letto',
        weight: 1,
        rule: {
          type: 'signal',
          name: 'traversal.escaped',
          where: [{ path: 'resolved', matches: '/etc/passwd$' }],
        },
        feedback: 'Punta esattamente a /etc/passwd risalendo dalla cartella allegati.',
        dimensions: ['exploitation'],
      },
      {
        id: 'c-env',
        label: 'File .env dell’app letto',
        weight: 1.5,
        required: true,
        rule: { type: 'signal', name: 'traversal.sensitive.read' },
        feedback: 'Il .env è in /srv/helpdesk/.env: dalla cartella allegati devi risalire di uno.',
        dimensions: ['exploitation'],
      },
      {
        id: 'c-flag',
        label: 'Segreto dell’applicazione (flag) recuperato',
        weight: 1,
        rule: { type: 'flag', value: 'CL{traversal_' },
        feedback: 'Il segreto è il valore di HELPDESK_TOKEN nel .env, nel formato CL{traversal_...}.',
        dimensions: ['exploitation'],
      },
      {
        id: 'c-report',
        label: 'Sequenza di risalita riportata',
        weight: 0.5,
        rule: { type: 'report', field: 'sequenza', matches: '\\.\\./' },
        feedback: 'Indica nel report la sequenza che fa salire di una cartella.',
        dimensions: ['recognition'],
      },
    ],
    solution: {
      summary:
        'Da /allegato?file=… si risale con ../ fino a /etc/passwd (prova) e a /srv/helpdesk/.env (segreto dell’app).',
      steps: [
        'GET /allegato?file=nota-cliente.txt → percorso risolto /srv/helpdesk/allegati/nota-cliente.txt',
        'GET /allegato?file=../../../etc/passwd → contenuto di /etc/passwd',
        'GET /allegato?file=../.env → contenuto di /srv/helpdesk/.env, con HELPDESK_TOKEN',
        'Riporta la sequenza: ../',
      ],
      explanation:
        'Il nome file viene concatenato alla cartella allegati e il percorso viene normalizzato dal sistema: i ../ risalgono l’albero e il file aperto non è più quello che l’app credeva. La lettura riesce perché il processo web (www-data) ha il permesso su quei file — è il permesso, non l’HTTP, a decidere cosa vedi.',
      mitigation:
        'Canonicalizzare il percorso e verificare che resti dentro la radice consentita; qui, attivare confineAttachments in config.json.',
    },
    skills: [
      { skillId: 'path-traversal', dimension: 'exploitation', weight: 2.5 },
      { skillId: 'permissions', dimension: 'recognition', weight: 1 },
    ],
    xp: 140,
  },

  // ── 2. Hit the permission wall on /etc/shadow ──────────────────────────────
  {
    id: 'ex.pt.permission',
    lessonId: 'web.path-traversal',
    labSpecId: 'lab.helpdesk',
    title: 'Il muro dei permessi',
    kind: 'guided',
    difficulty: 'intermediate',
    estimatedMinutes: 8,
    mission: {
      context:
        'Il traversal ti fa chiedere qualunque percorso, ma la lettura la decide chi sei sul sistema.',
      objective:
        'Prova a leggere /etc/shadow con lo stesso traversal e osserva che la lettura viene negata dai permessi — non dal filtro.',
      known: ['Il processo web gira come www-data.', '/etc/shadow è leggibile solo da root e dal gruppo shadow.'],
      scope: 'Solo il laboratorio Helpdesk isolato.',
    },
    objectives: [
      { id: 'o-denied', label: 'Ottieni una lettura negata dai permessi su /etc/shadow', criteria: ['c-denied'] },
    ],
    hints: [
      { id: 'h1', level: 1, text: 'Usa lo stesso traversal della missione precedente, ma punta a /etc/shadow.', weightPenalty: 0.1 },
      { id: 'h2', level: 2, text: 'GET /allegato?file=../../../etc/shadow. La richiesta va a buon fine, la lettura no: leggi i serverNotes.', weightPenalty: 0.3 },
    ],
    criteria: [
      {
        id: 'c-denied',
        label: 'Lettura negata dai permessi del filesystem',
        weight: 1,
        required: true,
        rule: {
          type: 'signal',
          name: 'traversal.permission.denied',
          where: [{ path: 'resolved', matches: '/etc/shadow$' }],
        },
        feedback: 'Punta a /etc/shadow con il traversal: il percorso si risolve ma la lettura come www-data deve fallire.',
        dimensions: ['recognition'],
      },
    ],
    solution: {
      summary: 'GET /allegato?file=../../../etc/shadow raggiunge il file ma la lettura è negata a www-data.',
      steps: [
        'GET /allegato?file=../../../etc/shadow',
        'Nei serverNotes: il traversal ha funzionato, la lettura è negata dai permessi',
      ],
      explanation:
        'Il traversal non ha confini di cartella, ma /etc/shadow è 0640 root:shadow e www-data non è né il proprietario né nel gruppo shadow. La differenza con /etc/passwd (0644) è esattamente la lezione di Permessi Linux: a decidere cosa leggi è l’utente del processo, non l’HTTP. Hai anche confermato di non girare come root.',
      mitigation: 'Difesa in profondità: privilegi minimi per il processo web, così che anche un traversal riuscito trovi poco da leggere.',
    },
    skills: [
      { skillId: 'permissions', dimension: 'recognition', weight: 1.5 },
      { skillId: 'path-traversal', dimension: 'recognition', weight: 1 },
    ],
    xp: 70,
  },

  // ── 3. Fix: confine attachments to the root ────────────────────────────────
  {
    id: 'ex.pt.fix',
    lessonId: 'web.path-traversal',
    labSpecId: 'lab.helpdesk',
    title: 'Correggi il path traversal',
    kind: 'fix',
    difficulty: 'intermediate',
    estimatedMinutes: 10,
    mission: {
      context:
        'Hai dimostrato la risalita. Ora il difensore: la configurazione decide se il percorso risolto deve restare dentro la cartella degli allegati.',
      objective:
        'Attiva il confinamento in /srv/helpdesk/config.json, poi ripeti il traversal e conferma che ora viene respinto — mentre un allegato legittimo si scarica ancora.',
    },
    objectives: [
      { id: 'o-config', label: 'Attiva confineAttachments nella configurazione', criteria: ['c-config'] },
      { id: 'o-blocked', label: 'Verifica che il traversal ora sia respinto', criteria: ['c-blocked'] },
    ],
    hints: [
      { id: 'h1', level: 1, text: 'Apri /srv/helpdesk/config.json e guarda il campo confineAttachments.', weightPenalty: 0.1 },
      { id: 'h2', level: 2, text: 'Porta "confineAttachments": false a true e salva.', weightPenalty: 0.25 },
      { id: 'h3', level: 3, text: 'Dopo il salvataggio, ripeti GET /allegato?file=../../../etc/passwd: deve tornare 403. Un file legittimo come nota-cliente.txt deve ancora scaricarsi.', weightPenalty: 0.4 },
    ],
    criteria: [
      {
        id: 'c-config',
        label: 'confineAttachments attivato',
        weight: 1.5,
        required: true,
        rule: { type: 'signal', name: 'config.updated', where: [{ path: 'confineAttachments', equals: true }] },
        feedback: 'In config.json porta confineAttachments a true e salva.',
        dimensions: ['mitigation'],
      },
      {
        id: 'c-blocked',
        label: 'Percorso fuori dalla radice ora respinto',
        weight: 2,
        required: true,
        rule: {
          type: 'allOf',
          rules: [
            { type: 'signal', name: 'traversal.blocked' },
            { type: 'http', pathMatches: '/allegato', statusIn: [403] },
          ],
        },
        feedback: 'Dopo il fix, ripeti il traversal: il percorso risolto è fuori dalla radice e deve tornare 403.',
        dimensions: ['mitigation'],
      },
    ],
    solution: {
      summary:
        'In config.json confineAttachments passa a true; un percorso risolto fuori dalla radice degli allegati viene respinto con 403.',
      steps: [
        'Apri /srv/helpdesk/config.json',
        'Cambia "confineAttachments": false → true, salva',
        'GET /allegato?file=../../../etc/passwd → 403',
        'GET /allegato?file=nota-cliente.txt → ancora 200',
      ],
      explanation:
        'Con il confinamento attivo il server risolve il percorso e verifica che resti dentro la cartella degli allegati prima di leggere: i ../ vengono normalizzati e il risultato, essendo fuori dalla radice, viene rifiutato. È la stessa correzione della lezione — decidere sul percorso reale risolto, non sulla stringa in arrivo — e non blocca gli allegati legittimi.',
      mitigation: 'Canonicalizzazione e verifica del prefisso sul percorso risolto; nomi di file non concatenati direttamente.',
    },
    skills: [
      { skillId: 'path-traversal', dimension: 'mitigation', weight: 2.5 },
    ],
    xp: 100,
  },
];
