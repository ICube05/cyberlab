import type { Lesson } from '@cyberlab/core';

/**
 * Cookies and sessions — the hinge between Foundations and Web Security.
 *
 * Every access-control bug later in the level is a story about a server
 * trusting the wrong thing about a session, so the session has to be understood
 * concretely first: what the cookie is, what it is not, and which attribute
 * defends against which attack. The interactive jar carries most of the weight,
 * because the SameSite/HttpOnly confusion survives any amount of prose.
 */
export const httpCookiesLesson: Lesson = {
  id: 'found.http-cookies',
  moduleId: 'mod.web-access-control',
  title: 'Cookie e sessioni',
  subtitle: 'Come un protocollo senza memoria ricorda chi sei',
  status: 'theory-only',
  difficulty: 'beginner',
  estimatedMinutes: 30,
  skills: ['cookies', 'http', 'authn'],
  prerequisites: ['found.http'],
  objectives: [
    'Spiegare perché serve una sessione se HTTP è senza stato.',
    'Distinguere sessione lato server e token autoconsistente.',
    'Applicare HttpOnly, Secure e SameSite sapendo contro cosa difendono.',
    'Descrivere cosa ottiene chi ruba un cookie di sessione, e come si limita il danno.',
  ],
  theory: [
    { id: 'a-h', kind: 'heading', level: 2, eyebrow: 'SECTION A · IL PROBLEMA', text: 'HTTP dimentica tutto' },
    {
      id: 'a-1',
      kind: 'prose',
      text: 'Ogni richiesta HTTP arriva al server come se fosse la prima: nessuna memoria, nessun collegamento con quella precedente. Ma un’applicazione ha bisogno di sapere che *quella* richiesta viene da chi si è autenticato dieci minuti fa. Il cookie è la soluzione: un valore che il server consegna una volta e che il browser riallega, da solo, a ogni richiesta successiva verso quel sito.',
    },
    {
      id: 'a-seq',
      kind: 'sequence',
      actors: [
        { id: 'b', label: 'Browser' },
        { id: 's', label: 'Server' },
      ],
      messages: [
        { from: 'b', to: 's', label: 'POST /login (utente, password)', tone: 'accent' },
        { from: 's', to: 'b', label: 'Set-Cookie: session=8f3c…; HttpOnly', tone: 'success', detail: 'Il server genera un identificativo casuale e lo associa internamente all’utente.' },
        { from: 'b', to: 's', label: 'GET /profilo  (Cookie: session=8f3c…)', detail: 'Il browser lo allega automaticamente, senza che il codice della pagina faccia nulla.' },
        { from: 's', to: 'b', label: '200 + i dati dell’utente', tone: 'success' },
        { from: 'b', to: 's', label: 'GET /ordini/1099  (Cookie: session=8f3c…)' },
        { from: 's', to: 'b', label: '200 — ma di chi è l’ordine 1099?', tone: 'danger', detail: 'Il cookie dice CHI sei. Non dice cosa puoi vedere: quel controllo è un secondo passo, e dimenticarlo è il broken access control.' },
      ],
    },
    {
      id: 'a-callout',
      kind: 'callout',
      variant: 'warning',
      title: 'La distinzione che regge tutto il livello',
      text: '**Autenticazione** è "chi sei" — la risolve il cookie. **Autorizzazione** è "puoi fare questa cosa su questo oggetto" — va decisa a ogni richiesta, per ogni oggetto. La quasi totalità dei bug di access control nasce da applicazioni che fanno bene la prima e saltano la seconda.',
    },

    { id: 'b-h', kind: 'heading', level: 2, eyebrow: 'SECTION B · DUE MODELLI', text: 'Sessione sul server o token in mano al client' },
    {
      id: 'b-compare',
      kind: 'comparison',
      left: {
        label: 'Sessione lato server',
        tone: 'neutral',
        language: 'text',
        code: `Cookie: session=8f3c9a1b2e

Il cookie è solo un puntatore
casuale. I dati stanno sul
server:

  8f3c9a1b2e → { user: 42,
                 role: "user" }

Revocare = cancellare la riga.`,
        note: 'Semplice e revocabile all’istante. Richiede uno stato condiviso fra i server.',
      },
      right: {
        label: 'Token autoconsistente (JWT)',
        tone: 'neutral',
        language: 'text',
        code: `Authorization: Bearer eyJ...

Il token CONTIENE i dati,
firmati:

  { "sub": 42,
    "role": "user",
    "exp": 1699999999 }

Revocare = difficile: è già
in mano al client.`,
        note: 'Nessuno stato da condividere. In cambio, un token rubato resta valido fino alla scadenza.',
      },
    },
    {
      id: 'b-1',
      kind: 'prose',
      text: 'Il valore di una sessione lato server deve essere **casuale e imprevedibile**: se fosse `session=42` per l’utente 42, chiunque scriverebbe 43. Sembra assurdo, eppure identificativi sequenziali o derivati dall’email compaiono ancora, ed è il primo esperimento da fare su un token che sembra "leggibile".',
    },

    { id: 'c-h', kind: 'heading', level: 2, eyebrow: 'SECTION C · ATTRIBUTI', text: 'Gli attributi, uno per uno' },
    {
      id: 'c-jar',
      kind: 'cookie-jar',
      cookieName: 'session',
      cookieValue: '8f3c9a1b2e',
      scenarios: [
        { id: 'same', label: 'Navighi dentro il sito', url: 'https://app.esempio.it/profilo', crossSite: false },
        { id: 'link', label: 'Segui un link da un altro sito', url: 'https://app.esempio.it/profilo', crossSite: true },
        { id: 'form', label: 'Un sito ostile invia un form verso l’app', url: 'https://app.esempio.it/trasferisci', crossSite: true, fromScript: true },
        { id: 'http', label: 'Stessa app, ma su HTTP in chiaro', url: 'http://app.esempio.it/profilo', crossSite: false },
      ],
      tutorNote: 'Prova SameSite=None con Secure spento, e la richiesta cross-site da script: sono i due casi che spiegano il CSRF.',
    },
    {
      id: 'c-table',
      kind: 'table',
      columns: ['Attributo', 'Cosa fa', 'Contro cosa difende'],
      rows: [
        ['HttpOnly', 'Nasconde il cookie a `document.cookie`', 'Furto della sessione tramite XSS'],
        ['Secure', 'Lo invia solo su HTTPS', 'Intercettazione su reti in chiaro'],
        ['SameSite=Lax', 'Cross-site solo su navigazioni top-level GET', 'CSRF sulle azioni (POST)'],
        ['SameSite=Strict', 'Mai cross-site', 'CSRF, al prezzo di link entranti che perdono la sessione'],
        ['Domain / Path', 'Limita a chi viene inviato', 'Esposizione a sottodomini non fidati'],
        ['Max-Age / Expires', 'Durata', 'Finestra utile di un token rubato'],
      ],
    },
    {
      id: 'c-callout',
      kind: 'callout',
      variant: 'danger',
      title: 'HttpOnly non impedisce l’uso del cookie',
      text: 'Impedisce a JavaScript di **leggerlo**, non al browser di **inviarlo**. Con un XSS su una pagina protetta da HttpOnly l’attaccante non esfiltra il cookie, ma può comunque far compiere azioni alla vittima dalla pagina stessa: le richieste partono dal browser della vittima, e il cookie ci va da solo. HttpOnly alza il costo, non chiude la partita.',
    },

    { id: 'd-h', kind: 'heading', level: 2, eyebrow: 'SECTION D · CICLO DI VITA', text: 'Quando una sessione deve morire' },
    {
      id: 'd-timeline',
      kind: 'timeline',
      entries: [
        { title: 'Login riuscito', text: 'Genera un identificativo **nuovo**. Riusare quello che il visitatore aveva già consente il session fixation: l’attaccante conosceva il valore da prima.', tone: 'success' },
        { title: 'Durante la sessione', text: 'Scadenza per inattività, e una assoluta. Un cookie rubato vale finché la sessione vive.' },
        { title: 'Cambio password o di ruolo', text: 'Invalidare le altre sessioni: è ciò che rende utile "esci da tutti i dispositivi" dopo una compromissione.', tone: 'success' },
        { title: 'Logout', text: 'Cancellare la sessione **sul server**. Rimuovere solo il cookie dal browser non invalida nulla: chi ne aveva una copia lo usa ancora.', tone: 'danger' },
      ],
    },
    {
      id: 'd-quiz',
      kind: 'quiz',
      question: 'Un cookie di sessione ha HttpOnly e Secure ma non SameSite. A quale attacco resta esposta l’applicazione?',
      options: [
        { id: 'a', text: 'Furto del cookie tramite XSS' },
        { id: 'b', text: 'Intercettazione su Wi-Fi pubblico' },
        { id: 'c', text: 'CSRF: un sito ostile fa partire una richiesta autenticata dal browser della vittima' },
        { id: 'd', text: 'SQL injection' },
      ],
      correct: ['c'],
      explanation:
        'HttpOnly copre il furto via script, Secure copre l’intercettazione. Manca la domanda "questa richiesta arriva da noi?": senza SameSite (o senza un token anti-CSRF) il browser allega la sessione anche a richieste generate da un sito di terzi, che è esattamente la definizione di CSRF. I browser moderni applicano Lax per difetto, ma non si progetta contando su un default.',
      skills: ['cookies', 'csrf'],
    },
    {
      id: 'd-quiz-2',
      kind: 'quiz',
      question: 'Al logout l’app fa `Set-Cookie: session=; Max-Age=0` e nient’altro. Perché non basta?',
      options: [
        { id: 'a', text: 'Basta: senza cookie l’utente non è più autenticato' },
        { id: 'b', text: 'La sessione resta valida sul server: chi ne ha una copia continua a usarla' },
        { id: 'c', text: 'Perché Max-Age non è supportato dai browser' },
        { id: 'd', text: 'Perché manca l’attributo HttpOnly' },
      ],
      correct: ['b'],
      explanation:
        'Quel comando parla solo al browser della vittima. Se il valore era già stato rubato — via XSS, via log, via rete — resta perfettamente valido, perché sul server nulla è cambiato. Il logout deve cancellare la sessione lato server; il cookie ripulito è solo cosmesi.',
      skills: ['cookies', 'authn'],
    },
    {
      id: 'e-kp',
      kind: 'keypoints',
      title: 'Da portarsi via',
      points: [
        'Il cookie risolve l’assenza di memoria di HTTP: dice **chi**, mai **cosa puoi**.',
        'Sessione lato server = revocabile; token firmato = senza stato ma difficile da revocare.',
        'HttpOnly contro il furto via XSS, Secure contro l’intercettazione, SameSite contro il CSRF.',
        'HttpOnly non impedisce di *usare* la sessione da una pagina compromessa.',
        'Identificativo nuovo al login, invalidazione reale al logout.',
      ],
    },
  ],
  exercises: [],
  recap: [
    'La sessione è l’identità che il browser riallega da sola a ogni richiesta.',
    'Due modelli: puntatore casuale lato server, o token firmato autoconsistente.',
    'Tre attributi, tre attacchi diversi da cui difendono.',
    'Il logout deve invalidare sul server, non solo cancellare il cookie.',
  ],
  furtherReading: [
    { title: 'OWASP Session Management Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html' },
    { title: 'MDN: Set-Cookie', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie' },
  ],
};
