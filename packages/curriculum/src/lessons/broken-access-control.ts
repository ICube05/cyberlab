import type { Lesson } from '@cyberlab/core';

/**
 * The flagship lesson.
 *
 * This is the "one perfect, fully interactive lesson" the brief asked for,
 * ahead of "fifty static ones". Every theory block is authored as data so the
 * renderer can make it interactive, the practice section runs against the real
 * lab, and the lab itself is genuinely vulnerable — and genuinely fixable.
 */
export const brokenAccessControlLesson: Lesson = {
  id: 'web.broken-access-control',
  moduleId: 'mod.web-access-control',
  title: 'Broken Access Control',
  subtitle: 'IDOR: reaching another user’s data by changing an id',
  status: 'ready',
  difficulty: 'beginner',
  estimatedMinutes: 30,
  skills: ['access-control', 'idor', 'authz', 'http'],
  prerequisites: [],
  objectives: [
    'Distinguere autenticazione (chi sei) da autorizzazione (cosa puoi fare).',
    'Riconoscere un Insecure Direct Object Reference (IDOR) leggendo una richiesta HTTP.',
    'Sfruttare un controllo di accesso mancante in un laboratorio isolato e raccogliere le prove.',
    'Correggere la vulnerabilità e verificare che il fix produca davvero un 403.',
  ],
  theory: [
    {
      id: 'a-eyebrow',
      kind: 'heading',
      level: 2,
      eyebrow: 'SECTION A · THEORY',
      text: 'Autenticazione non è autorizzazione',
    },
    {
      id: 'a-intro',
      kind: 'prose',
      text: 'Quasi ogni applicazione sa fare la prima domanda — {{Authentication:provare *chi sei*, di solito con username e password}} — e sbaglia la seconda: {{Authorization:decidere, per *ogni* risorsa e azione, se *tu* puoi accedervi}}. Il login funziona, quindi sembra tutto a posto. Ma "sei loggato" non risponde alla domanda "puoi vedere **questo** documento?". Quando quella seconda verifica manca, hai un **Broken Access Control**, la categoria numero uno della OWASP Top 10.',
    },
    {
      id: 'a-flow',
      kind: 'flow',
      title: 'Le due domande, e dove si rompe la seconda',
      nodes: [
        { id: 'req', label: 'Richiesta', sublabel: 'GET /profile?id=15', col: 0, row: 1, tone: 'default', tooltip: 'Il client chiede una risorsa, identificandola con un id.' },
        { id: 'authn', label: 'Chi sei?', sublabel: 'sessione valida?', col: 1, row: 1, tone: 'accent', tooltip: 'Autenticazione: il cookie di sessione identifica un utente.' },
        { id: 'authz', label: 'Puoi accedervi?', sublabel: 'l’oggetto è tuo?', col: 2, row: 1, tone: 'danger', tooltip: 'Autorizzazione: QUESTO è il controllo che spesso manca.' },
        { id: 'data', label: 'Risorsa', sublabel: 'SELECT ... WHERE id=15', col: 3, row: 1, tone: 'success', tooltip: 'Il dato viene restituito.' },
      ],
      edges: [
        { from: 'req', to: 'authn', tone: 'accent' },
        { from: 'authn', to: 'authz', label: 'ok', tone: 'accent' },
        { from: 'authz', to: 'data', label: 'se salti questo…', tone: 'danger', dashed: true },
      ],
      steps: [
        { label: 'Il client invia la richiesta con un id.', highlight: ['req'] },
        { label: 'Il server verifica la sessione: sei autenticato.', highlight: ['req', 'authn'] },
        { label: 'Qui dovrebbe verificare che l’oggetto sia tuo…', highlight: ['authz'] },
        { label: '…ma se non lo fa, restituisce il dato di chiunque.', highlight: ['authz', 'data'] },
      ],
    },
    {
      id: 'a-idor-def',
      kind: 'callout',
      variant: 'info',
      title: 'IDOR in una riga',
      text: 'Un **Insecure Direct Object Reference** è quando l’applicazione usa un identificatore fornito dal client (`id=15`) per recuperare un oggetto **senza verificare che quell’oggetto appartenga a chi lo chiede**. Cambi il numero, ottieni i dati di un altro.',
    },
    {
      id: 'a-http',
      kind: 'http-exchange',
      title: 'Leggi la richiesta: dov’è l’identificatore che controlli?',
      request: {
        method: 'GET',
        path: '/profile.php?id=15',
        version: 'HTTP/1.1',
        headers: [
          { name: 'Host', value: 'vault.lab' },
          { name: 'Cookie', value: 'session=sess_9f2c…', explain: 'Questo identifica la TUA sessione lato server. Il server sa che sei l’utente 15 grazie a questo, non grazie all’id nell’URL.' },
          { name: 'Accept', value: 'text/html' },
        ],
      },
      response: {
        status: 200,
        statusText: 'OK',
        headers: [{ name: 'Content-Type', value: 'text/html' }],
        body: '<h1>Seba Turina</h1><dl><dt>Role</dt><dd>user</dd>…',
      },
      takeaway:
        'Ci sono DUE informazioni che dicono “chi”: il cookie di sessione (autorevole, lato server) e il parametro `id` (fornito da te, modificabile). Il bug è fidarsi del secondo per decidere l’accesso.',
    },
    {
      id: 'a-sequence',
      kind: 'sequence',
      actors: [
        { id: 'you', label: 'Tu (utente 15)' },
        { id: 'server', label: 'Server' },
        { id: 'db', label: 'Database' },
      ],
      messages: [
        { from: 'you', to: 'server', label: 'GET /profile.php?id=16', detail: 'Cambi 15 → 16', tone: 'danger' },
        { from: 'server', to: 'server', label: 'sessione valida? sì (utente 15)', tone: 'accent' },
        { from: 'server', to: 'server', label: 'l’oggetto 16 è dell’utente 15? …mai chiesto', tone: 'danger' },
        { from: 'server', to: 'db', label: 'SELECT * FROM users WHERE id = 16' },
        { from: 'db', to: 'server', label: 'riga dell’utente 16', tone: 'default' },
        { from: 'server', to: 'you', label: '200 OK — profilo di un altro utente', tone: 'danger' },
      ],
    },
    {
      id: 'a-compare',
      kind: 'comparison',
      left: {
        label: 'Vulnerabile',
        tone: 'bad',
        language: 'php',
        code: "$id = $_GET['id'];\n// nessun confronto con la sessione\n$u = $db->query(\n  \"SELECT * FROM users WHERE id = $id\"\n);\nrender($u);",
        note: 'Usa l’id del client e basta. Chi sei non conta.',
      },
      right: {
        label: 'Corretto',
        tone: 'good',
        language: 'php',
        code: "$id = $_GET['id'];\nif ($id !== $session['user_id']\n    && !is_admin($session)) {\n  http_response_code(403);\n  exit;\n}\n$u = $db->query(\n  'SELECT * FROM users WHERE id = ?', [$id]);",
        note: 'Confronta il soggetto (sessione) con l’oggetto (id) prima di servire.',
      },
    },
    {
      id: 'a-legal',
      kind: 'callout',
      variant: 'legal',
      title: 'Scope e legalità',
      text: 'Cambiare un `id` in un’applicazione reale su cui non hai un permesso scritto è un accesso non autorizzato, ed è reato in gran parte del mondo. Tutto ciò che segue va fatto **solo** su questo laboratorio isolato, su CTF, o su sistemi per cui hai autorizzazione esplicita. Qui sei autorizzato: il laboratorio è tuo e gira in locale.',
    },
    {
      id: 'a-keypoints',
      kind: 'keypoints',
      title: 'Da tenere a mente',
      points: [
        'Autenticazione = chi sei. Autorizzazione = cosa puoi. Sono controlli diversi.',
        'L’autorità su “chi sei” è la sessione lato server, non un parametro nell’URL.',
        'Un id sequenziale in una richiesta è un invito a provare id vicini.',
        'Il controllo di accesso va fatto su OGNI oggetto, lato server, ad ogni richiesta.',
      ],
    },
  ],
  practice: [
    {
      id: 'b-eyebrow',
      kind: 'heading',
      level: 2,
      eyebrow: 'SECTION B · INTERACTIVE',
      text: 'Provalo tu, prima nel piccolo',
    },
    {
      id: 'b-prose',
      kind: 'prose',
      text: 'Prima di aprire il laboratorio completo, fissa il ragionamento con due controlli rapidi. Poi, nella Section C, lo farai sul serio: login reale, cookie reale, e il server che ti serve davvero il profilo di un altro utente.',
    },
    {
      id: 'b-quiz-1',
      kind: 'quiz',
      question: 'Il server riceve `GET /profile.php?id=16` con un cookie di sessione valido dell’utente 15. Cosa dovrebbe fare un controllo di accesso corretto?',
      options: [
        { id: 'a', text: 'Servire il profilo 16: la sessione è valida, quindi l’utente è autenticato.' },
        { id: 'b', text: 'Confrontare l’utente della sessione (15) con l’oggetto richiesto (16) e rispondere 403.' },
        { id: 'c', text: 'Fidarsi dell’id nell’URL perché arriva via HTTPS.' },
        { id: 'd', text: 'Chiedere di nuovo la password.' },
      ],
      correct: ['b'],
      explanation:
        'Autenticato non vuol dire autorizzato per quell’oggetto. Il controllo corretto confronta il soggetto (dalla sessione, autorevole) con l’oggetto (id 16) e nega se non combaciano e non sei admin. HTTPS protegge il trasporto, non decide l’accesso.',
      skills: ['access-control', 'authz'],
    },
    {
      id: 'b-quiz-2',
      kind: 'quiz',
      question: 'Quale di questi indizi, in una richiesta, ti fa sospettare un IDOR? (più risposte)',
      multi: true,
      options: [
        { id: 'a', text: 'Un identificatore numerico sequenziale nell’URL (`id=15`).' },
        { id: 'b', text: 'Un UUID casuale non indovinabile passato in un header.' },
        { id: 'c', text: 'Un parametro `account`, `user`, `doc` che nomina direttamente un oggetto.' },
        { id: 'd', text: 'Un header `Accept-Language`.' },
      ],
      correct: ['a', 'c'],
      explanation:
        'Gli id sequenziali e i parametri che nominano direttamente un oggetto sono i classici punti d’attacco IDOR: sono facili da modificare e da indovinare. Un UUID casuale riduce (ma non elimina) il rischio; la lingua non c’entra con l’accesso.',
      skills: ['idor'],
    },
    {
      id: 'b-bridge',
      kind: 'callout',
      variant: 'tip',
      title: 'Ora sul serio →',
      text: 'Apri il **Live Lab** a destra. Fai login come `seba`, guarda il tuo profilo (`id=15`), poi cambia l’id. Osserva status code, corpo della risposta e — nel pannello inferiore — i **segnali** che il server stesso emette quando salta un controllo.',
    },
  ],
  labSpecId: 'lab.vault',
  exercises: ['ex.bac.recon', 'ex.bac.exploit', 'ex.bac.fix'],
  recap: [
    'Un IDOR è un controllo di autorizzazione mancante su un oggetto identificato dal client.',
    'Si sfrutta cambiando l’identificatore; si conferma dai dati altrui che tornano con 200.',
    'Si corregge confrontando soggetto (sessione) e oggetto (id) lato server, ad ogni richiesta.',
  ],
  furtherReading: [
    { title: 'OWASP: Broken Access Control', url: 'https://owasp.org/Top10/A01_2021-Broken_Access_Control/', note: 'La categoria #1 della OWASP Top 10 2021.' },
    { title: 'OWASP: IDOR', url: 'https://owasp.org/www-project-web-security-testing-guide/', note: 'Testing guide.' },
  ],
};
