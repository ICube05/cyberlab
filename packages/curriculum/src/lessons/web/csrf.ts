import type { Lesson } from '@cyberlab/core';

/**
 * CSRF — l'abuso della fiducia automatica del browser.
 *
 * La lezione riprende il cookie jar già usato in `found.http-cookies`, ma con
 * una domanda diversa: lì si chiedeva *quale attributo protegge cosa*, qui si
 * chiede *cosa succede se il cookie parte lo stesso*. È deliberatamente
 * appaiata all'XSS: entrambe sfruttano la sessione della vittima, ma da
 * posizioni opposte — dentro l'origine l'una, completamente fuori l'altra —
 * e la differenza spiega perché le difese non sono intercambiabili.
 */
export const csrfLesson: Lesson = {
  id: 'web.csrf',
  moduleId: 'mod.web-client',
  title: 'CSRF',
  subtitle: 'Il browser della vittima invia la richiesta al posto tuo',
  status: 'theory-only',
  difficulty: 'intermediate',
  skills: ['csrf', 'cookies', 'http'],
  estimatedMinutes: 30,
  prerequisites: ['found.http-cookies', 'web.xss'],
  objectives: [
    'Spiegare perché una richiesta partita da un sito ostile arriva già autenticata.',
    'Riconoscere le condizioni necessarie perché un CSRF sia sfruttabile.',
    'Valutare token anti-CSRF e SameSite per quello che coprono davvero.',
    'Dire quando il CSRF è irrilevante, e perché contro un XSS nessuna di queste difese regge.',
  ],
  theory: [
    { id: 'a-h', kind: 'heading', level: 2, eyebrow: 'SECTION A · IL MECCANISMO', text: 'Il cookie parte da solo. Sempre.' },
    {
      id: 'a-1',
      kind: 'prose',
      text: 'Nella lezione sui cookie hai stabilito un fatto: il browser riallega il cookie di sessione a ogni richiesta verso quel sito, **da solo, senza che il codice della pagina faccia nulla**. È esattamente ciò che rende comoda la navigazione. Il CSRF è la domanda scomoda che segue: se la richiesta parte da una pagina che non è del sito — un blog, una mail HTML, un forum — il cookie parte lo stesso?',
    },
    {
      id: 'a-2',
      kind: 'prose',
      text: 'Storicamente la risposta era sì, senza condizioni. Il server riceveva una richiesta autenticata, valida, indistinguibile da una legittima — perché *è* legittima: l’ha inviata davvero il browser della vittima, con la sua sessione. L’attaccante non ruba nulla e non legge nulla: **fa compiere un’azione**.',
    },
    {
      id: 'a-seq',
      kind: 'sequence',
      actors: [
        { id: 'v', label: 'Vittima' },
        { id: 'e', label: 'Sito ostile' },
        { id: 'b', label: 'Banca' },
      ],
      messages: [
        { from: 'v', to: 'b', label: 'Login → Cookie: session=8f3c…', tone: 'success', detail: 'La sessione resta aperta in una scheda, o semplicemente nel browser.' },
        { from: 'v', to: 'e', label: 'Più tardi apre un altro sito' },
        { from: 'e', to: 'v', label: 'HTML con un form che si invia da solo', tone: 'danger', detail: 'La vittima non vede nulla: il form è nascosto e parte al caricamento.' },
        { from: 'v', to: 'b', label: 'POST /trasferisci (Cookie: session=8f3c…)', tone: 'danger', detail: 'La richiesta parte dal browser della vittima: il cookie viene allegato dal browser, non dall’attaccante.' },
        { from: 'b', to: 'v', label: '200 — bonifico eseguito', tone: 'danger', detail: 'Per il server è una richiesta autenticata e ben formata. E lo è.' },
      ],
    },
    {
      id: 'a-code',
      kind: 'code',
      language: 'javascript',
      filename: 'pagina-ostile.html — tutto qui',
      code: `<form action="https://banca.it/trasferisci"
      method="POST" id="f">
  <input name="iban"    value="IT00 ATTACCANTE">
  <input name="importo" value="2500">
</form>
<script>document.getElementById('f').submit()</script>`,
      highlight: [6],
      annotations: {
        1: 'la destinazione è il sito bersaglio, non quello dell’attaccante',
        3: 'i parametri sono quelli che l’applicazione si aspetta',
        6: 'nessun clic richiesto: il form si invia al caricamento della pagina',
      },
      caption: 'Nessun exploit, nessuna vulnerabilità di memoria: solo HTML che usa il browser come lo si usa sempre.',
    },
    {
      id: 'a-callout',
      kind: 'callout',
      variant: 'info',
      title: 'L’attaccante non legge la risposta',
      text: 'La Same-Origin Policy impedisce al sito ostile di **leggere** ciò che la banca risponde. Il CSRF è quindi un attacco *cieco*: puoi far compiere azioni, non esfiltrare dati. Per questo i bersagli sono sempre operazioni che cambiano stato — cambio email, cambio password, bonifico, creazione di un utente amministratore — e non le pagine di sola lettura.',
    },

    { id: 'b-h', kind: 'heading', level: 2, eyebrow: 'SECTION B · LE CONDIZIONI', text: 'Quando funziona, e quando non c’è nulla da sfruttare' },
    {
      id: 'b-kp',
      kind: 'keypoints',
      title: 'Servono tutte e tre insieme',
      points: [
        '**Un’azione che conta**: la richiesta deve cambiare qualcosa (soldi, credenziali, privilegi).',
        '**Autenticazione implicita**: la sessione viaggia in automatico — cookie, o HTTP Basic. Se il token va messo a mano in un header `Authorization`, il sito ostile non può aggiungerlo.',
        '**Parametri prevedibili**: l’attaccante deve poter costruire la richiesta in anticipo. Un valore imprevedibile in mezzo — ed è esattamente l’idea del token anti-CSRF — la rende non costruibile.',
      ],
    },
    {
      id: 'b-1',
      kind: 'prose',
      text: 'Da qui segue una conclusione che sorprende sempre: **un’API che usa un token nel header `Authorization` non è vulnerabile a CSRF**. Non per merito di una difesa, ma perché manca la prima condizione — il browser non allega quel token da solo, e JavaScript di un’altra origine non può aggiungerlo a una richiesta cross-site. Se invece la stessa API accetta anche il cookie di sessione, la vulnerabilità torna.',
    },
    {
      id: 'b-jar',
      kind: 'cookie-jar',
      cookieName: 'session',
      cookieValue: '8f3c9a1b2e',
      scenarios: [
        { id: 'nav', label: 'La vittima naviga sul sito', url: 'https://banca.it/conto', crossSite: false },
        { id: 'link', label: 'Link da un sito ostile (GET)', url: 'https://banca.it/conto', crossSite: true },
        { id: 'form', label: 'Form nascosto da un sito ostile (POST)', url: 'https://banca.it/trasferisci', crossSite: true, fromScript: true },
        { id: 'plain', label: 'Stesso sito, ma su HTTP', url: 'http://banca.it/conto', crossSite: false },
      ],
      tutorNote: 'Metti SameSite su None e guarda il terzo scenario: il cookie parte, e quella è la richiesta del CSRF. Poi passa a Lax e osserva la differenza fra il link (GET) e il form (POST).',
    },
    {
      id: 'b-2',
      kind: 'prose',
      text: 'Nel playground qui sopra il terzo scenario è letteralmente l’attacco. Con `SameSite=None` il cookie viene allegato a una POST cross-site e il CSRF funziona. Con `SameSite=Lax` — oggi il valore predefinito nei browser principali — quella POST parte **senza** cookie, e l’attacco muore; ma il secondo scenario mostra il limite: su una navigazione GET di primo livello il cookie viene ancora inviato. Se l’applicazione esegue azioni via GET, `Lax` non la salva.',
    },
    {
      id: 'b-quiz',
      kind: 'quiz',
      question: 'Un’API accetta solo `Authorization: Bearer <token>`, salvato dal frontend in localStorage. Il team chiede se serve una protezione CSRF.',
      options: [
        { id: 'a', text: 'Sì, ogni endpoint POST va protetto con un token anti-CSRF' },
        { id: 'b', text: 'No: quel token non viene allegato automaticamente dal browser, quindi manca la condizione base del CSRF — ma resta pienamente esposta a XSS, che quel token può leggerlo' },
        { id: 'c', text: 'No, ed è quindi più sicura in generale di una a cookie' },
        { id: 'd', text: 'Sì, perché localStorage è accessibile cross-origin' },
      ],
      correct: ['b'],
      explanation:
        'Il CSRF vive dell’autenticazione **implicita**: un header che il frontend deve aggiungere a mano non parte da un sito ostile, e la Same-Origin Policy impedisce a quel sito di leggere il localStorage altrui. Ma il baratto è reale, non un guadagno netto: un token in localStorage è leggibile da qualunque JavaScript nell’origine, quindi un XSS lo esfiltra — mentre un cookie `HttpOnly` no. Si sposta il rischio da CSRF a XSS, non lo si elimina.',
      skills: ['csrf', 'cookies'],
    },

    { id: 'c-h', kind: 'heading', level: 2, eyebrow: 'SECTION C · DIFESA', text: 'Il valore che l’attaccante non può indovinare' },
    {
      id: 'c-compare',
      kind: 'comparison',
      left: {
        label: 'Debole: fidarsi degli header di richiesta',
        tone: 'bad',
        language: 'javascript',
        code: `// "Se il Referer è il nostro sito,
//  allora la richiesta è nostra."
if (req.headers.referer
    ?.startsWith('https://banca.it')) {
  esegui();
}`,
        note: 'Il Referer è scritto dal client e spesso assente per policy o privacy: chi lo controlla o lo blocca rompe l’app, e i casi limite si trasformano presto in un "se manca, passa".',
      },
      right: {
        label: 'Corretto: token sincronizzato',
        tone: 'good',
        language: 'javascript',
        code: `// Un valore casuale, legato alla sessione,
// messo nel form dal server e verificato
// a ogni richiesta che cambia stato.
const atteso = sessione.csrfToken;
if (!timingSafeEqual(req.body._csrf, atteso)) {
  return res.status(403).end();
}`,
        note: 'Il sito ostile non può leggerlo (Same-Origin Policy) né indovinarlo: la terza condizione del CSRF cade.',
      },
    },
    {
      id: 'c-timeline',
      kind: 'timeline',
      entries: [
        { title: 'SameSite=Lax come base', text: 'È il valore predefinito nei browser moderni e blocca da solo la maggior parte dei CSRF classici. Ma è una difesa del browser, non dell’applicazione: vecchi browser, `SameSite=None` messo per far funzionare un’integrazione, o azioni eseguite via GET la aggirano.', tone: 'success' },
        { title: 'Token anti-CSRF sulle azioni', text: 'La difesa che dipende da te. Su ogni richiesta che cambia stato, un valore casuale legato alla sessione, confrontato in modo sicuro. È ciò che rende la richiesta non costruibile in anticipo.', tone: 'success' },
        { title: 'Metodi coerenti', text: 'Nessuna azione che cambia stato su una GET. Non è pedanteria: è la condizione perché `SameSite=Lax` e i controlli sui metodi abbiano senso.' },
        { title: 'Ri-autenticazione sulle operazioni critiche', text: 'Cambio password, cambio email, bonifico: chiedere di nuovo la password, o un secondo fattore, chiude anche i casi che sfuggono agli strati precedenti.', tone: 'success' },
        { title: 'Non serve a niente contro l’XSS', text: 'Un payload XSS gira **dentro** l’origine: legge il token dal DOM e lo mette nella richiesta. Nessuna difesa CSRF sopravvive a un XSS — è per questo che sono lezioni separate con difese separate.', tone: 'danger' },
      ],
    },
    {
      id: 'c-legal',
      kind: 'callout',
      variant: 'legal',
      title: 'Scope: qui la vittima è una persona',
      text: 'Un proof-of-concept CSRF si prova sul proprio account, o su account di test forniti dal committente. Ospitare una pagina d’attacco e recapitarla a utenti reali non è un test: è una frode informatica, e vale anche quando l’azione dimostrata è innocua. La prova corretta è la richiesta cross-site che riesce, con il tuo utente.',
    },
    {
      id: 'c-quiz',
      kind: 'quiz',
      question: 'Un’applicazione protegge le POST con un token anti-CSRF, ma permette anche `GET /account/elimina?id=42`. Cosa resta possibile?',
      options: [
        { id: 'a', text: 'Niente: il token copre tutte le azioni' },
        { id: 'b', text: 'Un CSRF via GET — basta un `<img src="https://sito/account/elimina?id=42">` su una pagina qualsiasi, e `SameSite=Lax` non lo ferma perché non è nemmeno una navigazione' },
        { id: 'c', text: 'Solo un attacco se la vittima usa un browser vecchio' },
        { id: 'd', text: 'Un XSS riflesso' },
      ],
      correct: ['b'],
      explanation:
        'Un’azione che cambia stato su una GET si attiva con qualunque tag che carichi una risorsa — `img`, `iframe`, `link` — e il browser vi allega il cookie. Ecco perché la regola "le GET non modificano nulla", che nella lezione su HTTP sembrava una convenzione formale, è in realtà un presupposto di sicurezza: quando cade, cadono con lei `SameSite=Lax` e i controlli applicati solo alle POST.',
      skills: ['csrf'],
    },
    {
      id: 'd-kp',
      kind: 'keypoints',
      title: 'Da portarsi via',
      points: [
        'Il CSRF non ruba la sessione: la usa, facendola inviare dal browser della vittima.',
        'Serve un’azione che conta, un’autenticazione implicita e una richiesta prevedibile: togline una e non c’è attacco.',
        'Il token anti-CSRF elimina la prevedibilità; `SameSite=Lax` copre molto ma è una difesa del browser, non tua.',
        'Un’API con token in header non è soggetta a CSRF — ma paga in esposizione all’XSS.',
        'Contro un XSS nessuna difesa CSRF regge: il payload è già dentro l’origine.',
      ],
    },
  ],
  recap: [
    'Il CSRF sfrutta l’invio automatico dei cookie da parte del browser.',
    'È cieco: fa compiere azioni, non permette di leggere le risposte.',
    'Token sincronizzato e SameSite sono due strati distinti, entrambi utili.',
    'Nessuna azione che cambia stato dovrebbe essere raggiungibile via GET.',
  ],
  furtherReading: [
    { title: 'OWASP CSRF Prevention Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html' },
    { title: 'PortSwigger: CSRF', url: 'https://portswigger.net/web-security/csrf' },
    { title: 'MDN: SameSite cookies', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite' },
  ],
  exercises: [],
};
