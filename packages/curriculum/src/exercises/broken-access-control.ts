import type { Exercise } from '@cyberlab/core';

/**
 * The graded missions for the Broken Access Control lesson.
 *
 * Every criterion below is matched against something the vault target genuinely
 * does — a signal it raises, a request in the transcript, the observable state
 * after a fix. Nothing here checks the learner's payload against an expected
 * string, which is why any valid route to the objective scores.
 */
export const brokenAccessControlExercises: Exercise[] = [
  // ── 1. Recon: read the request, identify the object reference ──────────────
  {
    id: 'ex.bac.recon',
    lessonId: 'web.broken-access-control',
    labSpecId: 'lab.vault',
    title: 'Trova il riferimento all’oggetto',
    kind: 'guided',
    difficulty: 'beginner',
    estimatedMinutes: 6,
    mission: {
      context: 'Sei loggato su Vault come seba (id 15). Prima di attaccare, orientati.',
      objective: 'Autenticati e visualizza il tuo profilo, individuando il parametro che identifica l’oggetto richiesto.',
      known: ['Account: seba / PrimaveraFredda!24', 'Il portale ha una pagina profilo.'],
      scope: 'Solo il laboratorio Vault isolato. Nessun sistema esterno.',
    },
    objectives: [
      { id: 'o-login', label: 'Effettua il login come seba', criteria: ['c-session'] },
      { id: 'o-profile', label: 'Apri il tuo profilo (id=15)', criteria: ['c-own-profile'] },
    ],
    hints: [
      { id: 'h1', level: 1, text: 'Usa il browser simulato o il request editor: POST /login.php con username e password nel corpo.', weightPenalty: 0.1 },
      { id: 'h2', level: 2, text: 'Dopo il login, vai su /profile.php?id=15. Guarda il parametro id nell’URL: è lui il “direct object reference”.', weightPenalty: 0.2 },
    ],
    criteria: [
      {
        id: 'c-session',
        label: 'Sessione autenticata creata',
        weight: 1,
        required: true,
        rule: { type: 'signal', name: 'session.created' },
        feedback: 'Non risulta un login riuscito. Invia le credenziali a /login.php con metodo POST.',
        dimensions: ['recognition'],
      },
      {
        id: 'c-own-profile',
        label: 'Profilo proprio visualizzato',
        weight: 1,
        required: true,
        rule: { type: 'signal', name: 'profile.read', where: [{ path: 'own', equals: true }] },
        feedback: 'Apri /profile.php?id=15 (il tuo id) mentre sei autenticato.',
        dimensions: ['recognition'],
      },
    ],
    solution: {
      summary: 'Login come seba, poi apertura di /profile.php?id=15.',
      steps: [
        'POST /login.php con username=seba&password=PrimaveraFredda!24',
        'Segui il redirect alla dashboard',
        'Apri /profile.php?id=15',
      ],
      explanation:
        'Il parametro id nell’URL è il “direct object reference”: identifica l’oggetto (un profilo) direttamente con un numero fornito dal client. È il candidato numero uno per un IDOR.',
    },
    skills: [
      { skillId: 'http', dimension: 'recognition', weight: 1 },
      { skillId: 'access-control', dimension: 'recognition', weight: 1.5 },
    ],
    xp: 40,
  },

  // ── 2. Exploit: change the id, prove horizontal access ─────────────────────
  {
    id: 'ex.bac.exploit',
    lessonId: 'web.broken-access-control',
    labSpecId: 'lab.vault',
    title: 'Missione: accedi al profilo di un altro utente',
    kind: 'mission',
    difficulty: 'beginner',
    estimatedMinutes: 12,
    mission: {
      context:
        'Il portale usa un id fornito dal client per servire i profili. Il team sospetta che il controllo di ownership sia saltato durante una migrazione.',
      objective:
        'Determina se un utente autenticato può leggere il profilo di un ALTRO utente, e recupera il token di recovery dell’amministratore come prova.',
      known: ['Sei autenticato come seba (id 15).', 'Gli id utente sembrano sequenziali attorno a 11–19.'],
      scope: 'Solo il laboratorio Vault isolato. Non attaccare nulla al di fuori del lab.',
    },
    objectives: [
      { id: 'o-bypass', label: 'Accedi al profilo di un utente diverso da te', criteria: ['c-bypass'] },
      { id: 'o-admin', label: 'Individua e leggi il profilo dell’amministratore', criteria: ['c-admin'] },
      { id: 'o-flag', label: 'Recupera il token di recovery (flag)', criteria: ['c-flag'] },
      { id: 'o-report', label: 'Riporta il parametro vulnerabile', criteria: ['c-report'] },
    ],
    report: [
      {
        id: 'parameter',
        label: 'Quale parametro controlla l’accesso?',
        type: 'text',
        placeholder: 'es. id',
        help: 'Il nome del parametro che, modificato, ti dà l’accesso non autorizzato.',
      },
      {
        id: 'severity',
        label: 'Tipo di accesso ottenuto',
        type: 'select',
        options: [
          { value: 'horizontal', label: 'Orizzontale (altro utente, stesso livello)' },
          { value: 'vertical', label: 'Verticale (privilegi più alti / admin)' },
          { value: 'both', label: 'Entrambi' },
        ],
      },
    ],
    hints: [
      { id: 'h1', level: 1, text: 'Hai visto il tuo profilo con id=15. Cosa succede se chiedi id=16?', weightPenalty: 0.1 },
      { id: 'h2', level: 2, text: 'Enumera gli id vicini (11–19). Uno di questi profili ha role=admin. Il suo campo “recovery token” è la flag.', weightPenalty: 0.2 },
      { id: 'h3', level: 3, text: 'Nel request editor cambia solo il numero: GET /profile.php?id=17, id=18… Osserva il campo Role nella risposta e i serverNotes.', weightPenalty: 0.35 },
    ],
    criteria: [
      {
        id: 'c-bypass',
        label: 'Controllo di autorizzazione orizzontale aggirato',
        weight: 2,
        required: true,
        rule: { type: 'signal', name: 'authz.horizontal.bypass' },
        feedback: 'Non risulta l’accesso a un profilo non tuo. Cambia l’id verso un altro utente mentre sei autenticato.',
        dimensions: ['exploitation'],
      },
      {
        id: 'c-admin',
        label: 'Profilo amministratore raggiunto',
        weight: 1.5,
        rule: { type: 'signal', name: 'authz.privilege.admin-profile-read' },
        feedback: 'Uno degli id vicini appartiene a un admin. Continua l’enumerazione.',
        dimensions: ['exploitation'],
      },
      {
        id: 'c-flag',
        label: 'Token di recovery (flag) recuperato',
        weight: 1.5,
        rule: { type: 'flag', value: 'CL{' },
        feedback: 'La flag è il campo recovery_token del profilo admin, nel formato CL{...}.',
        dimensions: ['exploitation'],
      },
      {
        id: 'c-report',
        label: 'Parametro vulnerabile riportato correttamente',
        weight: 1,
        rule: { type: 'report', field: 'parameter', matches: '\\bid\\b' },
        feedback: 'Nel report, indica il nome del parametro che controlla l’accesso (suggerimento: è nell’URL).',
        dimensions: ['recognition'],
      },
    ],
    solution: {
      summary:
        'Autenticato come seba, modificando il parametro id (es. id=17) si ottiene il profilo di un altro utente; enumerando 11–19 si trova l’admin e si legge il suo recovery token.',
      steps: [
        'GET /profile.php?id=15 → il tuo profilo (baseline)',
        'GET /profile.php?id=16, 17, 18… → profili altrui, status 200',
        'Individua il profilo con Role = admin',
        'Leggi il campo recovery_token: è la flag CL{...}',
        'Riporta il parametro: id',
      ],
      explanation:
        'Il server recupera il profilo usando l’id fornito nell’URL e non lo confronta mai con l’utente della sessione. Poiché non c’è alcun controllo di ownership (la policy della rotta dichiara ownership="none"), ogni utente autenticato può leggere qualsiasi profilo semplicemente cambiando il numero. È un IDOR: Broken Access Control orizzontale, che qui scala anche in verticale perché espone il profilo admin.',
      mitigation:
        'Confrontare sempre, lato server e ad ogni richiesta, il soggetto (id dalla sessione) con l’oggetto richiesto; negare con 403 se non combaciano e l’utente non ha un ruolo che lo autorizza esplicitamente.',
    },
    skills: [
      { skillId: 'idor', dimension: 'exploitation', weight: 2 },
      { skillId: 'access-control', dimension: 'exploitation', weight: 2 },
      { skillId: 'authz', dimension: 'recognition', weight: 1 },
    ],
    xp: 120,
  },

  // ── 3. Fix: edit the policy, prove the 403 ─────────────────────────────────
  {
    id: 'ex.bac.fix',
    lessonId: 'web.broken-access-control',
    labSpecId: 'lab.vault',
    title: 'Correggi la vulnerabilità',
    kind: 'fix',
    difficulty: 'intermediate',
    estimatedMinutes: 10,
    mission: {
      context:
        'Hai dimostrato l’IDOR. Ora indossa il cappello del difensore: la policy di autorizzazione del portale è un file JSON che puoi modificare nell’editor.',
      objective:
        'Modifica /srv/vault/policy.json in modo che la rotta /profile.php verifichi la ownership, poi riprova l’accesso a un profilo altrui e conferma che ora risponde 403.',
    },
    objectives: [
      { id: 'o-edit', label: 'Aggiorna la policy di /profile.php', criteria: ['c-policy'] },
      { id: 'o-verify', label: 'Verifica che l’accesso non autorizzato ora sia negato', criteria: ['c-denied'] },
      { id: 'o-noselfblock', label: 'Assicurati di poter ancora vedere il tuo profilo', criteria: ['c-self-ok'] },
    ],
    hints: [
      { id: 'h1', level: 1, text: 'Apri il pannello editor sul file /srv/vault/policy.json. Guarda il campo "ownership" della rotta /profile.php.', weightPenalty: 0.1 },
      { id: 'h2', level: 2, text: 'Cambia "ownership": "none" in "ownership": "match:query.id". Salva.', weightPenalty: 0.25 },
      { id: 'h3', level: 3, text: 'Dopo aver salvato la policy, ripeti GET /profile.php?id=17: ora il confronto soggetto/oggetto viene fatto e deve tornare 403. Controlla che id=15 (il tuo) resti 200.', weightPenalty: 0.4 },
    ],
    criteria: [
      {
        id: 'c-policy',
        label: 'Policy di /profile.php aggiornata a un controllo di ownership',
        weight: 1.5,
        required: true,
        rule: {
          type: 'signal',
          name: 'policy.updated',
          where: [
            { path: 'route', equals: '/profile.php' },
            { path: 'after', matches: '^match:' },
          ],
        },
        feedback: 'La policy di /profile.php deve dichiarare un controllo di ownership (es. "match:query.id"), non "none".',
        dimensions: ['mitigation'],
      },
      {
        id: 'c-denied',
        label: 'Accesso a un profilo altrui ora negato (403)',
        weight: 2,
        required: true,
        rule: {
          type: 'allOf',
          rules: [
            { type: 'signal', name: 'authz.denied' },
            { type: 'http', pathMatches: '/profile\\.php\\?id=', statusIn: [403] },
          ],
        },
        feedback: 'Dopo il fix, ripeti la richiesta a un profilo NON tuo: deve tornare 403. Se torna ancora 200, la policy non è stata applicata a quella rotta.',
        dimensions: ['mitigation'],
      },
      {
        id: 'c-self-ok',
        label: 'Il tuo profilo resta accessibile (nessun over-block)',
        weight: 1,
        rule: { type: 'http', pathMatches: '/profile\\.php\\?id=15', statusIn: [200] },
        feedback: 'Un buon fix nega gli altri ma non te stesso. Verifica che id=15 torni ancora 200.',
        dimensions: ['mitigation'],
      },
    ],
    solution: {
      summary: 'In policy.json, /profile.php passa da ownership "none" a "match:query.id"; l’accesso ad altri profili diventa 403.',
      steps: [
        'Apri /srv/vault/policy.json nell’editor',
        'Cambia "ownership": "none" → "match:query.id" per /profile.php',
        'Salva (il server ricarica la policy)',
        'GET /profile.php?id=17 → 403',
        'GET /profile.php?id=15 → 200 (te stesso, ancora ok)',
      ],
      explanation:
        'Il motore di policy ora ha una regola di ownership da valutare, quindi confronta l’utente della sessione con l’id richiesto e nega quando non combaciano. La stessa identica code path che prima serviva qualsiasi profilo ora produce un vero 403 — perché ha un soggetto e un oggetto da confrontare.',
      mitigation: 'Definire il controllo di accesso come regola esplicita, verificata centralmente su ogni rotta e ogni oggetto.',
    },
    skills: [
      { skillId: 'access-control', dimension: 'mitigation', weight: 2.5 },
      { skillId: 'authz', dimension: 'mitigation', weight: 1.5 },
    ],
    xp: 100,
  },
];
