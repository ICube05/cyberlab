import type { Exercise } from '@cyberlab/core';

export const sqlInjectionExercises: Exercise[] = [
  {
    id: 'ex.sqli.bypass',
    lessonId: 'web.sql-injection',
    labSpecId: 'lab.catalog',
    title: 'Missione: entra come amministratore',
    kind: 'mission',
    difficulty: 'intermediate',
    estimatedMinutes: 12,
    mission: {
      context: 'Il login staff di Catalog costruisce la query concatenando username e password.',
      objective: 'Autenticati come l’account amministratore senza conoscerne la password, sfruttando la SQL injection nel login.',
      known: ['La ricerca prodotti e la console SQL possono aiutarti a enumerare gli account.'],
      scope: 'Solo il laboratorio Catalog isolato (database SQLite locale).',
    },
    objectives: [
      { id: 'o-bypass', label: 'Bypassa il controllo password via injection', criteria: ['c-bypass'] },
      { id: 'o-admin', label: 'Ottieni una sessione con ruolo admin', criteria: ['c-admin'] },
    ],
    hints: [
      { id: 'h1', level: 1, text: 'Come si chiama l’account admin? Usa la console SQL o la ricerca per enumerare la tabella accounts.', weightPenalty: 0.1 },
      { id: 'h2', level: 2, text: 'Nel campo username prova a chiudere la stringa e commentare il resto: qualcosa come  nome\' --  con uno spazio dopo i trattini.', weightPenalty: 0.25 },
      { id: 'h3', level: 3, text: "Username: catalog_admin' --␣  (spazio finale), password qualsiasi. Il commento elimina il controllo AND pass='...'.", weightPenalty: 0.4 },
    ],
    criteria: [
      {
        id: 'c-bypass',
        label: 'Autenticazione bypassata via SQL injection',
        weight: 2,
        required: true,
        rule: { type: 'signal', name: 'sqli.auth-bypass' },
        feedback: 'Nessun bypass rilevato. La password non deve combaciare: la injection deve rimuovere quel controllo dalla query.',
        dimensions: ['exploitation'],
      },
      {
        id: 'c-admin',
        label: 'Sessione admin ottenuta',
        weight: 1.5,
        rule: { type: 'signal', name: 'sqli.auth-bypass.admin' },
        feedback: 'Sei entrato, ma non come admin. Enumera gli account per trovare il nome giusto.',
        dimensions: ['exploitation'],
      },
    ],
    solution: {
      summary: "Login con username = catalog_admin' --  e password arbitraria.",
      steps: [
        'Enumera gli account (console SQL: SELECT username,role FROM accounts)',
        "POST /login con username = catalog_admin' --  e una password qualsiasi",
        'La query diventa WHERE username=\'catalog_admin\' -- ... : il controllo password è commentato',
        'Sei autenticato come admin',
      ],
      explanation:
        "Chiudendo la stringa dello username con un apice e commentando il resto con --, la condizione AND password='...' esce dalla query. SQLite valuta solo username='catalog_admin', trova la riga e il server ti considera autenticato con il ruolo di quell’account.",
      mitigation: 'Prepared statement con parametri per username e password; l’input non può più alterare la struttura.',
    },
    skills: [
      { skillId: 'sqli', dimension: 'exploitation', weight: 2 },
      { skillId: 'sql', dimension: 'recognition', weight: 1 },
    ],
    xp: 110,
  },
  {
    id: 'ex.sqli.exfil',
    lessonId: 'web.sql-injection',
    labSpecId: 'lab.catalog',
    title: 'Missione: esfiltra il segreto',
    kind: 'challenge',
    difficulty: 'advanced',
    estimatedMinutes: 15,
    mission: {
      context: 'La ricerca prodotti concatena il termine nella clausola LIKE.',
      objective: 'Usa una UNION-based SQL injection nella ricerca per estrarre il valore dalla tabella secrets (la flag CL{...}).',
      known: ['La ricerca restituisce 4 colonne: id, name, category, price_cents.', 'Esiste una tabella secrets(name, value).'],
      scope: 'Solo il laboratorio Catalog isolato.',
    },
    objectives: [
      { id: 'o-union', label: 'Esegui una UNION che unisce un’altra tabella', criteria: ['c-union'] },
      { id: 'o-flag', label: 'Estrai la flag dalla tabella secrets', criteria: ['c-flag'] },
    ],
    hints: [
      { id: 'h1', level: 1, text: 'La UNION richiede lo stesso numero di colonne: qui 4. Riempi le colonne che non ti servono con costanti.', weightPenalty: 0.15 },
      { id: 'h2', level: 2, text: "Chiudi il LIKE e aggiungi:  ' UNION SELECT name, value, 3, 4 FROM secrets --", weightPenalty: 0.3 },
    ],
    criteria: [
      {
        id: 'c-union',
        label: 'UNION cross-table eseguita',
        weight: 2,
        required: true,
        rule: { type: 'signal', name: 'sqli.union.cross-table' },
        feedback: 'La UNION deve avere 4 colonne e leggere da un’altra tabella. Conta le colonne della ricerca.',
        dimensions: ['exploitation'],
      },
      {
        id: 'c-flag',
        label: 'Flag esfiltrata',
        weight: 2,
        rule: { type: 'flag', value: 'CL{' },
        feedback: 'La flag è in secrets.value. Portala tra le colonne selezionate dalla UNION.',
        dimensions: ['exploitation'],
      },
    ],
    solution: {
      summary: "Ricerca con  ' UNION SELECT name, value, 3, 4 FROM secrets -- ",
      steps: [
        'Determina il numero di colonne della query di ricerca (4)',
        "Invia q =  ' UNION SELECT name, value, 3, 4 FROM secrets -- ",
        'Le righe di secrets appaiono tra i risultati; la flag è nel valore',
      ],
      explanation:
        'UNION SELECT accoda una seconda query con lo stesso numero e tipo di colonne. Poiché l’input finisce nella query, puoi far restituire al server dati da qualsiasi tabella leggibile — qui secrets — invece dei soli prodotti.',
      mitigation: 'Prepared statements; inoltre least privilege sull’utente DB, così la ricerca non può leggere secrets.',
    },
    skills: [
      { skillId: 'sqli', dimension: 'exploitation', weight: 2.5 },
      { skillId: 'sql', dimension: 'theory', weight: 1 },
    ],
    xp: 140,
  },
  {
    id: 'ex.sqli.fix',
    lessonId: 'web.sql-injection',
    labSpecId: 'lab.catalog',
    title: 'Rendi sicura la ricerca',
    kind: 'fix',
    difficulty: 'intermediate',
    estimatedMinutes: 8,
    mission: {
      context: 'Hai dimostrato l’impatto. Ora chiudila.',
      objective: 'Attiva la versione parametrizzata degli endpoint e verifica che la injection non funzioni più.',
    },
    objectives: [{ id: 'o-param', label: 'Gli endpoint usano query parametrizzate', criteria: ['c-param'] }],
    hints: [
      { id: 'h1', level: 1, text: 'Nel pannello editor del lab puoi commutare gli endpoint alla versione con prepared statement. Poi ripeti l’attacco: non deve più funzionare.', weightPenalty: 0.2 },
    ],
    criteria: [
      {
        id: 'c-param',
        label: 'Endpoint parametrizzato in uso',
        weight: 2,
        required: true,
        rule: { type: 'signal', name: 'sql.parameterised' },
        feedback: 'Attiva la modalità parametrizzata e invia di nuovo una richiesta a quell’endpoint.',
        dimensions: ['mitigation'],
      },
    ],
    solution: {
      summary: 'Passare gli endpoint a prepared statement con parametri legati.',
      steps: ['Attiva la versione parametrizzata', 'Ripeti la injection precedente', 'Verifica che l’input sia trattato come dato letterale'],
      explanation: 'Con i parametri, il motore SQL riceve la struttura della query e i dati separatamente: nessun carattere nell’input può più cambiare la query.',
      mitigation: 'Prepared statements ovunque; niente concatenazione di input in SQL.',
    },
    skills: [{ skillId: 'sqli', dimension: 'mitigation', weight: 2.5 }],
    xp: 90,
  },
];
