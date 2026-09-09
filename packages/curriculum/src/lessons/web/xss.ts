import type { Lesson } from '@cyberlab/core';

/**
 * XSS — la prima vulnerabilità del livello che non attacca il server.
 *
 * Il salto concettuale è questo: fin qui la vittima era l'applicazione, qui la
 * vittima è **l'altro utente**. Il server viene usato come tramite. Per questo
 * la lezione insiste sul contesto di output — è l'unico modo di capire perché
 * "sanitizzare l'input" non è la risposta — e chiude sulla CSP, che è ciò che
 * decide se un XSS trovato in produzione vale un incidente o una nota.
 */
export const xssLesson: Lesson = {
  id: 'web.xss',
  moduleId: 'mod.web-client',
  title: 'Cross-Site Scripting (XSS)',
  subtitle: 'Far eseguire il tuo codice nella pagina di qualcun altro',
  status: 'theory-only',
  difficulty: 'intermediate',
  skills: ['xss', 'encoding', 'http'],
  estimatedMinutes: 35,
  prerequisites: ['web.broken-access-control'],
  objectives: [
    'Distinguere XSS riflesso, persistente e DOM-based da come viaggia il payload.',
    'Riconoscere il contesto di output e capire perché decide l’encoding corretto.',
    'Descrivere l’impatto reale: furto di sessione e azioni compiute dalla vittima.',
    'Applicare le difese giuste — encoding contestuale, framework, CSP — nell’ordine giusto.',
  ],
  theory: [
    { id: 'a-h', kind: 'heading', level: 2, eyebrow: 'SECTION A · CAMBIA LA VITTIMA', text: 'Il server è il tramite, non il bersaglio' },
    {
      id: 'a-1',
      kind: 'prose',
      text: 'Finora hai attaccato l’applicazione: leggevi l’ordine di un altro, entravi senza password. L’XSS è diverso — l’applicazione viene usata come **veicolo** per colpire i suoi utenti. Riesci a far arrivare del tuo JavaScript dentro una pagina che il browser della vittima considera legittima, e da lì il tuo codice eredita tutto: la sessione della vittima, la sua origine, la sua fiducia.',
    },
    {
      id: 'a-2',
      kind: 'prose',
      text: 'La causa è sempre la stessa frattura vista con la SQL injection e la command injection: **dato non fidato che finisce dove il ricevente si aspetta codice**. Cambia solo l’interprete. Prima era il database, poi la shell, adesso è il motore HTML/JavaScript del browser.',
    },
    {
      id: 'a-flow',
      kind: 'flow',
      title: 'XSS persistente: il percorso del payload',
      nodes: [
        { id: 'att', label: 'Attaccante', sublabel: 'scrive un commento', col: 0, row: 1, tone: 'danger', tooltip: 'Il payload viene inviato una volta sola.' },
        { id: 'db', label: 'Database', sublabel: 'salva il testo così com’è', col: 1, row: 1, tone: 'default', tooltip: 'Il server memorizza senza sapere che è codice.' },
        { id: 'page', label: 'Pagina', sublabel: 'rende il commento in HTML', col: 2, row: 1, tone: 'danger', tooltip: 'Qui il dato torna fuori senza encoding: diventa markup.' },
        { id: 'vic', label: 'Vittima', sublabel: 'legge la pagina, esegue', col: 3, row: 1, tone: 'accent', tooltip: 'Il browser non distingue il tuo script da quello del sito.' },
      ],
      edges: [
        { from: 'att', to: 'db', label: 'una volta', tone: 'danger' },
        { from: 'db', to: 'page' },
        { from: 'page', to: 'vic', label: 'a ogni visita', tone: 'danger' },
      ],
      steps: [
        { label: '1 · Il payload viene depositato', highlight: ['att', 'db'] },
        { label: '2 · Il server lo restituisce come HTML', highlight: ['db', 'page'] },
        { label: '3 · Ogni visitatore lo esegue, senza cliccare nulla', highlight: ['page', 'vic'] },
      ],
    },
    {
      id: 'a-table',
      kind: 'table',
      columns: ['Tipo', 'Dove vive il payload', 'Come arriva alla vittima', 'Perché è grave'],
      rows: [
        ['Riflesso', 'Nell’URL o nella richiesta', 'La vittima deve aprire un link che le mandi tu', 'Serve interazione, ma un link è facile da recapitare'],
        ['Persistente (stored)', 'Nel database del sito', 'Nessuna interazione: basta visitare la pagina', 'Colpisce ogni visitatore, anche gli amministratori'],
        ['DOM-based', 'Non passa mai dal server', 'JavaScript della pagina legge una fonte controllabile e la scrive nel DOM', 'Invisibile ai controlli lato server e ai log'],
      ],
      caption: 'Non sono tre vulnerabilità diverse: è lo stesso difetto, con tre percorsi di consegna diversi.',
    },
    {
      id: 'a-dom',
      kind: 'code',
      language: 'javascript',
      filename: 'XSS DOM-based — nessun byte passa dal server',
      code: `// La pagina saluta l'utente usando il frammento dell'URL.
const nome = decodeURIComponent(location.hash.slice(1));
document.getElementById('saluto').innerHTML = 'Ciao ' + nome;

// https://sito.it/#<img src=x onerror=alert(1)>`,
      highlight: [3],
      annotations: {
        2: 'sorgente controllata dall’utente (source)',
        3: 'innerHTML interpreta HTML: qui il dato diventa markup (sink)',
        5: 'il frammento dopo # non viene mai inviato al server: nessun log lo vedrà',
      },
      caption: 'Sorgente → destinazione. Trovare un XSS DOM-based significa collegare una source a un sink pericoloso.',
    },

    { id: 'b-h', kind: 'heading', level: 2, eyebrow: 'SECTION B · IL CONTESTO', text: 'Non esiste "l’escape": esiste l’escape giusto per quel punto' },
    {
      id: 'b-1',
      kind: 'prose',
      text: 'È l’idea che separa chi ripete "sanitizza l’input" da chi capisce l’XSS. Lo stesso dato, inserito in punti diversi della pagina, richiede trasformazioni **diverse e incompatibili**. Sfuggire i caratteri per l’HTML e poi scrivere il risultato dentro un attributo `href` o dentro un blocco `<script>` non protegge nulla: il contesto decide quale carattere è pericoloso.',
    },
    {
      id: 'b-table',
      kind: 'table',
      columns: ['Contesto di output', 'Esempio', 'Cosa serve', 'Cosa basta a rompere'],
      rows: [
        ['Testo HTML', '<p>QUI</p>', 'Encoding di & < > " \'', '<img src=x onerror=…>'],
        ['Valore di attributo', '<input value="QUI">', 'Encoding + virgolette sempre presenti', '" onfocus=… autofocus'],
        ['Dentro <script>', 'var x = "QUI";', 'Serializzazione JSON, mai concatenazione', '"; alert(1); //'],
        ['URL in href/src', '<a href="QUI">', 'Validare lo schema: solo http/https', 'javascript:alert(1)'],
        ['Nome di evento o CSS', 'style="QUI"', 'Non mettercelo affatto', 'expression(), url(javascript:…)'],
      ],
      caption: 'Cinque contesti, cinque regole. Un solo filtro "generico" ne copre al massimo uno.',
    },
    {
      id: 'b-callout',
      kind: 'callout',
      variant: 'warning',
      title: 'Perché filtrare l’input in ingresso è il posto sbagliato',
      text: 'In ingresso non sai ancora dove quel dato finirà: la stessa stringa può comparire in una pagina HTML, in un’email, in un PDF e in una risposta JSON. Filtrando subito distruggi dati legittimi (un cognome come *O’Brien*, un commento che parla di `<div>`) e resti comunque scoperto negli altri contesti. La difesa va **in uscita**, dove il contesto finalmente si conosce.',
    },
    {
      id: 'b-quiz',
      kind: 'quiz',
      question: 'Un’applicazione applica l’escape HTML a ogni input e poi lo inserisce così: `<a href="[input]">link</a>`. Perché resta vulnerabile?',
      options: [
        { id: 'a', text: 'Non lo è: l’escape HTML copre tutti i casi' },
        { id: 'b', text: 'Perché `javascript:alert(1)` non contiene nessun carattere che l’escape HTML tocchi, ma dentro href diventa codice eseguibile' },
        { id: 'c', text: 'Perché l’escape andava fatto due volte' },
        { id: 'd', text: 'Perché manca HTTPS' },
      ],
      correct: ['b'],
      explanation:
        'L’escape HTML neutralizza `< > & " \'`. Ma in un `href` il pericolo non è un tag: è lo **schema** dell’URL. `javascript:alert(1)` passa indenne da qualunque escape HTML perché non contiene caratteri speciali per l’HTML — ed è comunque eseguibile al clic. La difesa corretta in quel contesto è validare che lo schema sia `http` o `https` (o un percorso relativo). Questo è il senso di "encoding contestuale".',
      skills: ['xss', 'encoding'],
    },

    { id: 'c-h', kind: 'heading', level: 2, eyebrow: 'SECTION C · IMPATTO', text: 'Cosa ottiene davvero chi ha un XSS' },
    {
      id: 'c-seq',
      kind: 'sequence',
      actors: [
        { id: 'a', label: 'Attaccante' },
        { id: 's', label: 'App vulnerabile' },
        { id: 'v', label: 'Browser vittima' },
      ],
      messages: [
        { from: 'a', to: 's', label: 'Pubblica un commento con il payload', tone: 'danger' },
        { from: 'v', to: 's', label: 'GET /articolo/12 (Cookie: session=…)' },
        { from: 's', to: 'v', label: 'HTML con dentro lo script dell’attaccante', tone: 'danger', detail: 'Per il browser è codice del sito: stessa origine, stessi privilegi.' },
        { from: 'v', to: 's', label: 'POST /cambia-email (Cookie: session=…)', tone: 'danger', detail: 'La richiesta parte dalla pagina legittima, con la sessione della vittima allegata dal browser.' },
        { from: 's', to: 'v', label: '200 — account dirottato', tone: 'danger' },
      ],
    },
    {
      id: 'c-callout',
      kind: 'callout',
      variant: 'danger',
      title: 'HttpOnly non chiude l’XSS: ne riduce solo un ramo',
      text: 'Nella lezione sui cookie hai visto che `HttpOnly` impedisce a JavaScript di **leggere** il cookie. Impedisce quindi l’esfiltrazione del cookie — non impedisce di **agire**. Il payload resta dentro la pagina, con l’origine giusta, e può inviare richieste autenticate: cambiare l’email, aggiungere una chiave SSH, creare un secondo amministratore. Il cookie viaggia da solo, come sempre. L’impatto di un XSS non si misura in "cookie rubato": si misura in "tutto ciò che quell’utente può fare".',
    },
    {
      id: 'c-legal',
      kind: 'callout',
      variant: 'legal',
      title: 'Scope: un XSS colpisce persone, non solo server',
      text: 'Anche in un test autorizzato, un payload XSS che esce dal laboratorio raggiunge utenti reali che non hanno acconsentito a nulla. La pratica corretta è la prova minima — un `alert(1)` o un valore innocuo che dimostri l’esecuzione — mai un payload che raccoglie dati altrui, e mai su un target che non sia esplicitamente in scope. Qui lavori su applicazioni costruite per essere colpite.',
    },

    { id: 'd-h', kind: 'heading', level: 2, eyebrow: 'SECTION D · DIFESA', text: 'Tre strati, in quest’ordine' },
    {
      id: 'd-compare',
      kind: 'comparison',
      left: {
        label: 'Vulnerabile: costruire HTML a mano',
        tone: 'bad',
        language: 'javascript',
        code: `app.get('/cerca', (req, res) => {
  res.send(
    '<h1>Risultati per: ' +
    req.query.q +
    '</h1>'
  );
});`,
        note: 'Il parametro entra nel markup come markup. È l’XSS riflesso nella sua forma più pura.',
      },
      right: {
        label: 'Corretto: il template conosce il contesto',
        tone: 'good',
        language: 'javascript',
        code: `// Un template engine (o JSX) applica
// l'encoding giusto per il punto in cui
// il valore viene inserito.
res.render('cerca', { q: req.query.q });

// E nel DOM, la scelta del sink:
el.textContent = q;   // testo, sicuro
// el.innerHTML = q;  // markup, no`,
        note: '`textContent` scrive testo, `innerHTML` interpreta markup. Spesso l’intera vulnerabilità sta in questa scelta.',
      },
    },
    {
      id: 'd-timeline',
      kind: 'timeline',
      entries: [
        { title: '1 · Encoding contestuale in uscita', text: 'È la difesa vera. I framework moderni (React, Angular, i template engine) lo fanno per impostazione predefinita — e proprio per questo va tenuto d’occhio ciò che lo aggira di proposito: `dangerouslySetInnerHTML`, `v-html`, `innerHTML`.', tone: 'success' },
        { title: '2 · Sanitizzazione, solo dove serve HTML vero', text: 'Se gli utenti devono poter scrivere HTML formattato, non filtrare a mano: usa una libreria di sanitizzazione consolidata con una allow-list di tag e attributi. Scriverla da zero è un errore classico.' },
        { title: '3 · Content-Security-Policy', text: 'È la rete di sicurezza, non la difesa principale. Una CSP che vieta gli script inline e le origini esterne trasforma molti XSS da critici a innocui: il payload è nella pagina, ma il browser si rifiuta di eseguirlo.', tone: 'success' },
        { title: 'Non è una difesa: HttpOnly, WAF, blocklist', text: 'Alzano il costo dell’attacco e vanno usati, ma nessuno dei tre impedisce l’esecuzione. Trattarli come soluzione è il modo più comune di restare vulnerabili sentendosi protetti.', tone: 'danger' },
      ],
    },
    {
      id: 'd-csp',
      kind: 'code',
      language: 'http',
      filename: 'una CSP che serve a qualcosa',
      code: `Content-Security-Policy: default-src 'self';
  script-src 'self' 'nonce-r4nd0m';
  object-src 'none';
  base-uri 'self'`,
      annotations: {
        2: 'solo gli script del sito, e gli inline che portano il nonce generato per questa risposta',
        3: 'niente plugin: un vettore in meno',
        4: 'impedisce di dirottare gli URL relativi riscrivendo <base>',
      },
      caption: 'Una CSP con `unsafe-inline` in script-src non protegge da XSS: è la configurazione che si trova più spesso.',
    },
    {
      id: 'd-quiz',
      kind: 'quiz',
      question: 'Un sito ha un XSS persistente, i cookie di sessione sono `HttpOnly` e la CSP è `script-src \'self\' \'unsafe-inline\'`. Qual è la valutazione corretta?',
      options: [
        { id: 'a', text: 'Rischio basso: HttpOnly e CSP insieme bloccano l’attacco' },
        { id: 'b', text: 'Rischio alto: `unsafe-inline` lascia eseguire il payload, e senza rubare il cookie l’attaccante agisce comunque come la vittima' },
        { id: 'c', text: 'Rischio nullo: senza cookie leggibile l’XSS non serve a niente' },
        { id: 'd', text: 'Rischio medio: funziona solo sugli utenti non autenticati' },
      ],
      correct: ['b'],
      explanation:
        '`unsafe-inline` annulla la parte di CSP che conta contro l’XSS: gli script inline — cioè esattamente il payload iniettato — tornano eseguibili. E `HttpOnly` protegge la lettura del cookie, non le azioni: lo script gira nell’origine del sito e ogni richiesta che invia si porta dietro la sessione. Su un XSS persistente, che colpisce ogni visitatore compresi gli amministratori, questo è il caso peggiore.',
      skills: ['xss'],
    },
    {
      id: 'e-kp',
      kind: 'keypoints',
      title: 'Da portarsi via',
      points: [
        'L’XSS usa l’applicazione per colpire i suoi utenti: il codice gira con l’origine e la sessione della vittima.',
        'Riflesso, persistente e DOM-based sono tre percorsi di consegna dello stesso difetto.',
        'Il contesto di output decide l’encoding: HTML, attributo, script, URL e CSS hanno regole diverse e incompatibili.',
        'Si difende in uscita, non in ingresso — dove il contesto è ancora sconosciuto.',
        'HttpOnly limita il furto del cookie, non le azioni. La CSP è la rete di sicurezza, e con `unsafe-inline` non c’è.',
      ],
    },
    {
      id: 'e-bridge',
      kind: 'callout',
      variant: 'tip',
      title: 'La prossima lezione parte da qui',
      text: 'Hai appena visto che il browser della vittima allega la sessione a ogni richiesta partita dalla pagina. Nella prossima lezione — CSRF — l’attaccante non ha bisogno di eseguire codice sul sito: gli basta convincere quel browser a inviare una richiesta, da un sito completamente diverso. Stessa fiducia automatica, sfruttata senza XSS.',
    },
  ],
  recap: [
    'L’XSS fa eseguire codice dell’attaccante nell’origine dell’applicazione, colpendo gli altri utenti.',
    'Riflesso, persistente, DOM-based: cambia il percorso, non la causa.',
    'La difesa è l’encoding contestuale in uscita; la CSP è il secondo strato.',
    'HttpOnly riduce il furto della sessione, non l’abuso della sessione.',
  ],
  furtherReading: [
    { title: 'OWASP XSS Prevention Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html' },
    { title: 'PortSwigger: Cross-site scripting', url: 'https://portswigger.net/web-security/cross-site-scripting' },
    { title: 'MDN: Content Security Policy', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP' },
    { title: 'OWASP DOM-based XSS Prevention', url: 'https://cheatsheetseries.owasp.org/cheatsheets/DOM_based_XSS_Prevention_Cheat_Sheet.html', note: 'La mappa completa source → sink.' },
  ],
  exercises: [],
};
