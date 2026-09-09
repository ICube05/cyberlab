import type { Exercise } from '@cyberlab/core';

/**
 * Graded missions for the XSS lesson, on the Helpdesk target.
 *
 * Every criterion matches a signal the target raises about itself — a payload
 * that landed in executable position, the agent's session exposed, the staff
 * area actually reached with that session, escaping switched on. Nothing here
 * matches the learner's payload text against an expected string, so any working
 * payload scores and the fix is graded on the target's real behaviour.
 */
export const xssExercises: Exercise[] = [
  // ── 1. Reflected: prove the search box reflects into the page ───────────────
  {
    id: 'ex.xss.reflected',
    lessonId: 'web.xss',
    labSpecId: 'lab.helpdesk',
    title: 'Rifletti uno script dalla ricerca',
    kind: 'guided',
    difficulty: 'beginner',
    estimatedMinutes: 8,
    mission: {
      context: 'Il portale Helpdesk ha una ricerca ticket che rimanda in pagina ciò che cerchi.',
      objective: 'Dimostra che il parametro di ricerca viene inserito nella pagina come markup, non come testo.',
      known: ['La ricerca è pubblica: GET /cerca?q=…', 'Nessun login richiesto.'],
      scope: 'Solo il laboratorio Helpdesk isolato. Nessun sistema esterno, nessun utente reale.',
    },
    objectives: [
      { id: 'o-reflect', label: 'Fai finire un payload eseguibile nella risposta della ricerca', criteria: ['c-reflected'] },
    ],
    hints: [
      { id: 'h1', level: 1, text: 'Prova prima una ricerca normale e guarda dove finisce la tua parola nella pagina ("Risultati per: …").', weightPenalty: 0.1 },
      { id: 'h2', level: 2, text: 'Metti nel parametro q qualcosa che il browser eseguirebbe: un tag <script> o un gestore di evento come <img src=x onerror=alert(1)>.', weightPenalty: 0.25 },
      { id: 'h3', level: 3, text: 'GET /cerca?q=<script>alert(1)</script> — poi controlla i serverNotes: dicono se il valore è stato inserito con o senza escape.', weightPenalty: 0.4 },
    ],
    criteria: [
      {
        id: 'c-reflected',
        label: 'Payload riflesso in posizione eseguibile',
        weight: 1,
        required: true,
        rule: { type: 'signal', name: 'xss.reflected.executed' },
        feedback: 'Il valore di q è stato riflesso come testo o non conteneva markup eseguibile. Prova un <script> o un attributo on… mentre escapeOutput è false.',
        dimensions: ['exploitation'],
      },
    ],
    solution: {
      summary: 'GET /cerca?q=<script>alert(1)</script> viene inserito nella pagina senza escape.',
      steps: [
        'GET /cerca?q=test → osserva "Risultati per: test"',
        'GET /cerca?q=<script>alert(1)</script>',
        'Nei serverNotes: il valore è stato inserito senza htmlspecialchars()',
      ],
      explanation:
        'Il parametro q finisce nel corpo HTML tramite render_user_content(), che applica l’escape solo se config.escapeOutput è true. Ora è false, quindi il tuo markup arriva al browser come markup: è un XSS riflesso. La prova non è una stringa attesa — è il target che dichiara di aver messo il tuo input in posizione eseguibile.',
      mitigation: 'Applicare l’encoding contestuale in uscita: qui, htmlspecialchars() sul valore prima di scriverlo nella pagina.',
    },
    skills: [
      { skillId: 'xss', dimension: 'exploitation', weight: 1.5 },
      { skillId: 'http', dimension: 'recognition', weight: 0.5 },
    ],
    xp: 60,
  },

  // ── 2. Stored: steal the agent session, reach the staff area ───────────────
  {
    id: 'ex.xss.stored',
    lessonId: 'web.xss',
    labSpecId: 'lab.helpdesk',
    title: 'Missione: dirotta la sessione di un agente',
    kind: 'mission',
    difficulty: 'intermediate',
    estimatedMinutes: 18,
    mission: {
      context:
        'I commenti ai ticket sono pubblici e vengono mostrati anche agli agenti di supporto, che aprono i ticket poco dopo un aggiornamento. L’area /staff è riservata a loro.',
      objective:
        'Lascia un commento che esegua nel browser dell’agente, cattura la sua sessione e usala per entrare nell’area staff e leggere il token operativo interno (flag).',
      known: [
        'I commenti si inviano da POST /commento (o dal form del ticket).',
        'L’agente apre il ticket subito dopo un nuovo commento.',
        '/staff richiede il cookie di sessione di un agente.',
      ],
      scope: 'Solo il laboratorio Helpdesk isolato. L’"agente" è simulato: nessuna persona reale è coinvolta.',
    },
    objectives: [
      { id: 'o-store', label: 'Salva un commento con un payload eseguibile', criteria: ['c-persisted'] },
      { id: 'o-exec', label: 'Fai eseguire il payload nella pagina dell’agente', criteria: ['c-agent'] },
      { id: 'o-staff', label: 'Entra nell’area staff con la sessione catturata', criteria: ['c-staff'] },
      { id: 'o-flag', label: 'Recupera il token operativo (flag)', criteria: ['c-flag'] },
    ],
    report: [
      {
        id: 'tipo',
        label: 'Che tipo di XSS hai sfruttato?',
        type: 'select',
        options: [
          { value: 'reflected', label: 'Riflesso' },
          { value: 'stored', label: 'Persistente (stored)' },
          { value: 'dom', label: 'DOM-based' },
        ],
      },
    ],
    hints: [
      { id: 'h1', level: 1, text: 'Un commento viene salvato così com’è e rimostrato a chiunque apra il ticket — te e l’agente. Che tipo di XSS è?', weightPenalty: 0.1 },
      { id: 'h2', level: 2, text: 'Invia un commento con uno script. Dopo l’invio, leggi i serverNotes: la simulazione dell’agente ti dice se il payload è stato eseguito e cosa ha raccolto.', weightPenalty: 0.25 },
      { id: 'h3', level: 3, text: 'Dai serverNotes copia session=… poi GET /staff con header Cookie: session=<valore>. Il cookie jar del lab non ha quella sessione: mettila a mano nell’header.', weightPenalty: 0.4 },
    ],
    criteria: [
      {
        id: 'c-persisted',
        label: 'Commento con markup eseguibile salvato',
        weight: 1,
        required: true,
        rule: { type: 'signal', name: 'xss.stored.persisted' },
        feedback: 'Invia un commento che contenga markup eseguibile (uno <script> o un attributo on…).',
        dimensions: ['exploitation'],
      },
      {
        id: 'c-agent',
        label: 'Sessione dell’agente esposta dal payload',
        weight: 2,
        required: true,
        rule: { type: 'signal', name: 'xss.agent.session.exposed' },
        feedback: 'Il payload deve eseguire quando l’agente apre il ticket. Verifica che escapeOutput sia ancora false e che il commento contenga markup eseguibile.',
        dimensions: ['exploitation'],
      },
      {
        id: 'c-staff',
        label: 'Area staff raggiunta con la sessione catturata',
        weight: 2,
        required: true,
        rule: { type: 'signal', name: 'staff.area.reached' },
        feedback: 'Usa la sessione mostrata nei serverNotes come Cookie sulla richiesta a /staff.',
        dimensions: ['exploitation'],
      },
      {
        id: 'c-flag',
        label: 'Token operativo (flag) recuperato',
        weight: 1,
        rule: { type: 'flag', value: 'CL{xss_' },
        feedback: 'La flag è nel corpo dell’area staff, nel formato CL{xss_...}.',
        dimensions: ['exploitation'],
      },
      {
        id: 'c-report',
        label: 'Tipo di XSS riportato correttamente',
        weight: 0.5,
        rule: { type: 'report', field: 'tipo', equals: 'stored' },
        feedback: 'Il commento è salvato sul server e rimostrato a ogni visitatore: è un XSS persistente.',
        dimensions: ['recognition'],
      },
    ],
    solution: {
      summary:
        'Un commento con <script> viene servito all’agente senza escape; la sua sessione compare nei serverNotes e, usata come Cookie su /staff, apre l’area riservata e la flag.',
      steps: [
        'POST /commento con id di un ticket e testo = <script>fetch(...)</script> (qualsiasi markup eseguibile va bene)',
        'Leggi i serverNotes della risposta: session=sess_…',
        'GET /staff con header Cookie: session=sess_…',
        'Leggi il token operativo CL{xss_...}',
      ],
      explanation:
        'Il commento viene salvato e rimostrato a chiunque apra il ticket, agente compreso: è un XSS persistente. Poiché config.escapeOutput è false, il markup arriva eseguibile nella pagina dell’agente e "cattura" la sua sessione. Una sessione rubata è indistinguibile da quella legittima: /staff la accetta e serve la flag. Nota che nemmeno HttpOnly avrebbe chiuso la partita — le azioni sarebbero comunque partite dalla pagina dell’agente.',
      mitigation:
        'Encoding contestuale in uscita (htmlspecialchars) su ogni contenuto utente, come base; una CSP senza unsafe-inline come secondo strato. Entrambi si abilitano qui rendendo escapeOutput true.',
    },
    skills: [
      { skillId: 'xss', dimension: 'exploitation', weight: 2.5 },
      { skillId: 'cookies', dimension: 'recognition', weight: 1 },
    ],
    xp: 150,
  },

  // ── 3. Fix: turn escaping on, prove neutralisation ─────────────────────────
  {
    id: 'ex.xss.fix',
    lessonId: 'web.xss',
    labSpecId: 'lab.helpdesk',
    title: 'Correggi l’XSS',
    kind: 'fix',
    difficulty: 'intermediate',
    estimatedMinutes: 10,
    mission: {
      context:
        'Hai dimostrato l’XSS. Ora il difensore: la configurazione del portale è un file JSON modificabile nell’editor, e decide se il contenuto utente viene sfuggito in uscita.',
      objective:
        'Modifica /srv/helpdesk/config.json per attivare l’escape in uscita, poi ripeti l’invio di un commento con payload e conferma che ora viene neutralizzato invece di eseguito.',
    },
    objectives: [
      { id: 'o-config', label: 'Attiva escapeOutput nella configurazione', criteria: ['c-config'] },
      { id: 'o-neutral', label: 'Verifica che un payload venga ora neutralizzato', criteria: ['c-neutralised'] },
    ],
    hints: [
      { id: 'h1', level: 1, text: 'Apri /srv/helpdesk/config.json nell’editor. Guarda il campo escapeOutput.', weightPenalty: 0.1 },
      { id: 'h2', level: 2, text: 'Porta "escapeOutput": false a true e salva.', weightPenalty: 0.25 },
      { id: 'h3', level: 3, text: 'Dopo il salvataggio, ripeti /cerca?q=<script>alert(1)</script> o un nuovo commento con payload: il target segnala che è stato neutralizzato.', weightPenalty: 0.4 },
    ],
    criteria: [
      {
        id: 'c-config',
        label: 'escapeOutput attivato',
        weight: 1.5,
        required: true,
        rule: { type: 'signal', name: 'config.updated', where: [{ path: 'escapeOutput', equals: true }] },
        feedback: 'In config.json porta escapeOutput a true e salva.',
        dimensions: ['mitigation'],
      },
      {
        id: 'c-neutralised',
        label: 'Payload eseguibile ora neutralizzato dall’escape',
        weight: 2,
        required: true,
        rule: { type: 'signal', name: 'xss.payload.neutralised' },
        feedback: 'Dopo aver attivato l’escape, invia di nuovo un payload eseguibile: deve risultare neutralizzato, non eseguito.',
        dimensions: ['mitigation'],
      },
    ],
    solution: {
      summary: 'In config.json escapeOutput passa da false a true; lo stesso payload viene ora sfuggito in uscita.',
      steps: [
        'Apri /srv/helpdesk/config.json',
        'Cambia "escapeOutput": false → true, salva',
        'Ripeti /cerca?q=<script>alert(1)</script> o un commento con payload',
        'Il target segnala xss.payload.neutralised',
      ],
      explanation:
        'La stessa funzione di rendering ora applica htmlspecialchars() perché la configurazione lo richiede: il tuo <script> diventa testo visibile e inerte. È lo stesso code path di prima — cambia solo che ora sfugge l’output, che è la difesa vera contro l’XSS.',
      mitigation: 'Encoding contestuale in uscita attivo su tutto il contenuto utente; CSP come secondo strato.',
    },
    skills: [
      { skillId: 'xss', dimension: 'mitigation', weight: 2.5 },
    ],
    xp: 100,
  },
];
