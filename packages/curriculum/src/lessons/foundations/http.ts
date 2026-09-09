import type { Lesson } from '@cyberlab/core';

/**
 * HTTP — the protocol the entire Web Security level is written against.
 *
 * Deliberately the longest Foundations lesson. Everything later (IDOR, SQLi,
 * XSS, CSRF, SSRF) is a statement about a request or a response, so this is
 * where the learner has to become fluent in reading both. The interactive
 * exchange block is the centrepiece: headers with explanations you click.
 */
export const httpLesson: Lesson = {
  id: 'found.http',
  moduleId: 'mod.web-foundations',
  title: 'HTTP & HTTPS',
  subtitle: 'Metodi, status, header — e cosa aggiunge davvero TLS',
  status: 'theory-only',
  difficulty: 'beginner',
  estimatedMinutes: 35,
  skills: ['http'],
  prerequisites: ['found.how-internet-works'],
  objectives: [
    'Leggere e costruire una richiesta e una risposta HTTP a mano.',
    'Scegliere il metodo giusto e sapere quali garanzie porta (e quali non porta).',
    'Interpretare le classi di status code e cosa rivelano di un’applicazione.',
    'Riconoscere gli header che contano per la sicurezza.',
    'Dire con precisione cosa protegge TLS e cosa non protegge.',
  ],
  theory: [
    { id: 'a-h', kind: 'heading', level: 2, eyebrow: 'SECTION A · ANATOMIA', text: 'Testo, e niente più' },
    {
      id: 'a-1',
      kind: 'prose',
      text: 'HTTP è un protocollo **testuale** e **senza stato**. Testuale: una richiesta è un blocco di testo che potresti scrivere a mano — e nei laboratori lo farai. Senza stato: il server non ricorda nulla fra una richiesta e l’altra; ogni richiesta deve portarsi dietro tutto ciò che serve a identificarla.',
    },
    {
      id: 'a-code',
      kind: 'code',
      language: 'http',
      filename: 'richiesta',
      code: `POST /api/ordini HTTP/1.1
Host: negozio.esempio.it
Content-Type: application/json
Cookie: session=8f3c9a1b2e
Content-Length: 34

{"prodotto": 42, "quantita": 1}`,
      annotations: {
        1: 'riga di richiesta: metodo, percorso, versione',
        2: 'quale sito, quando un IP ne ospita molti',
        4: 'la sessione: è questo che dice al server chi sei',
        6: 'riga vuota: da qui in poi è il corpo',
      },
      caption: 'Riga di richiesta, header, riga vuota, corpo. Sempre in quest’ordine.',
    },
    {
      id: 'a-code-2',
      kind: 'code',
      language: 'http',
      filename: 'risposta',
      code: `HTTP/1.1 201 Created
Content-Type: application/json
Location: /api/ordini/1099
Set-Cookie: session=8f3c9a1b2e; HttpOnly; Secure; SameSite=Lax

{"id": 1099, "stato": "confermato"}`,
      annotations: {
        1: 'versione, codice numerico, spiegazione testuale',
        3: 'dove è stata creata la risorsa — e un identificativo che vale la pena provare a cambiare',
        4: 'creazione della sessione, con gli attributi che la proteggono',
      },
    },

    { id: 'b-h', kind: 'heading', level: 2, eyebrow: 'SECTION B · METODI', text: 'I metodi, e le promesse che non mantengono' },
    {
      id: 'b-table',
      kind: 'table',
      columns: ['Metodo', 'Intenzione', 'Sicuro?', 'Idempotente?', 'Nota per chi attacca'],
      rows: [
        ['GET', 'Leggere', 'sì', 'sì', 'Finisce nei log e nella cronologia: mai dati sensibili nella query string.'],
        ['POST', 'Creare / agire', 'no', 'no', 'Il verso normale delle azioni. Bersaglio classico del CSRF.'],
        ['PUT', 'Sostituire', 'no', 'sì', 'Se abilitato per sbaglio, permette di scrivere file sul server.'],
        ['PATCH', 'Modificare in parte', 'no', 'no', 'Mass assignment: campi che il form non mostrava.'],
        ['DELETE', 'Cancellare', 'no', 'sì', 'Controllo di autorizzazione spesso dimenticato proprio qui.'],
        ['OPTIONS', 'Chiedere cosa è permesso', 'sì', 'sì', 'Rivela i metodi accettati e la policy CORS.'],
      ],
      caption: '"Sicuro" ha un significato tecnico preciso: non modifica lo stato. Non vuol dire "protetto".',
    },
    {
      id: 'b-1',
      kind: 'callout',
      variant: 'warning',
      title: 'Sono convenzioni, non vincoli',
      text: 'Nulla impedisce a un’applicazione scritta male di cancellare un record su una GET. E nulla impedisce a te di mandare una POST dove l’interfaccia usa una GET. Il metodo è una stringa scelta dal client: se una regola di autorizzazione controlla solo le POST, prova la stessa azione con un altro metodo.',
    },

    { id: 'c-h', kind: 'heading', level: 2, eyebrow: 'SECTION C · STATUS', text: 'I codici raccontano più di quanto vorrebbero' },
    {
      id: 'c-table',
      kind: 'table',
      columns: ['Classe', 'Significato', 'Esempi', 'Cosa ne deduci'],
      rows: [
        ['2xx', 'Fatto', '200, 201, 204', 'L’azione è passata. Se non dovevi poterla fare, è una vulnerabilità.'],
        ['3xx', 'Sta altrove', '301, 302, 304', 'Un redirect verso il login dice "esiste ma non sei autenticato".'],
        ['4xx', 'Errore tuo', '400, 401, 403, 404', 'La distinzione 403/404 rivela l’esistenza delle risorse.'],
        ['5xx', 'Errore suo', '500, 502, 503', 'Un 500 su un input strano è il segnale più promettente che ci sia.'],
      ],
    },
    {
      id: 'c-1',
      kind: 'prose',
      text: 'Due codici meritano attenzione particolare. **401** significa "non so chi sei": manca o è scaduta l’autenticazione. **403** significa "so chi sei e non ti è permesso". La differenza è un’informazione regalata: un 403 su `/admin/utenti/77` conferma che l’utente 77 esiste, mentre un 404 uniforme non conferma nulla.',
    },
    {
      id: 'c-2',
      kind: 'prose',
      text: 'E un **500** è un invito. Significa che il tuo input ha raggiunto una parte del codice che non lo aspettava. Un apostrofo che produce un 500 è il primo segnale di una SQL injection; un percorso strano che produce un 500 è il primo segnale di un path traversal. L’errore è il canale attraverso cui l’applicazione ti parla.',
    },

    { id: 'd-h', kind: 'heading', level: 2, eyebrow: 'SECTION D · HEADER', text: 'Gli header che decidono la sicurezza' },
    {
      id: 'd-exchange',
      kind: 'http-exchange',
      title: 'Clicca un header per sapere cosa fa',
      request: {
        method: 'GET',
        path: '/profilo?id=1042',
        version: 'HTTP/1.1',
        headers: [
          { name: 'Host', value: 'app.esempio.it', explain: 'Sceglie il sito virtuale. Manipolarlo può portare a cache poisoning o a routing verso host interni.' },
          { name: 'Cookie', value: 'session=8f3c9a1b2e', explain: 'L’identità. Rubarlo equivale ad autenticarsi: è l’obiettivo finale di quasi ogni XSS.' },
          { name: 'Referer', value: 'https://app.esempio.it/home', explain: 'Da dove arrivi. Alcune applicazioni ci basano controlli anti-CSRF: è una difesa debole, perché il client lo scrive.' },
          { name: 'X-Forwarded-For', value: '10.0.0.9', explain: 'Aggiunto dai proxy. Se l’applicazione si fida per decidere "richiesta interna", falsificarlo è banale.' },
          { name: 'Authorization', value: 'Bearer eyJhbGciOi…', explain: 'Token, spesso un JWT. Nel livello Web lo smonterai e proverai a rifirmarlo.' },
        ],
      },
      response: {
        status: 200,
        statusText: 'OK',
        headers: [
          { name: 'Content-Type', value: 'text/html; charset=utf-8', explain: 'Come il browser interpreta il corpo. Servire input utente come text/html è la premessa dell’XSS.' },
          { name: 'Set-Cookie', value: 'session=…; HttpOnly; Secure; SameSite=Lax', explain: 'HttpOnly nasconde il cookie a JavaScript, Secure impone HTTPS, SameSite limita l’uso cross-site.' },
          { name: 'Content-Security-Policy', value: "default-src 'self'", explain: 'Limita da dove si possono caricare script: trasforma molti XSS da critici a innocui.' },
          { name: 'X-Frame-Options', value: 'DENY', explain: 'Impedisce che la pagina venga inserita in un iframe altrui: difesa contro il clickjacking.' },
          { name: 'Strict-Transport-Security', value: 'max-age=31536000', explain: 'Impone HTTPS per le visite successive, chiudendo la finestra del downgrade.' },
        ],
        body: '<!doctype html>…',
      },
      takeaway: 'Gli header di richiesta li scrive il client — quindi non sono prove. Quelli di risposta sono istruzioni al browser, ed è lì che vive gran parte della difesa.',
    },

    { id: 'e-h', kind: 'heading', level: 2, eyebrow: 'SECTION E · HTTPS', text: 'Cosa protegge TLS, e cosa no' },
    {
      id: 'e-1',
      kind: 'prose',
      text: 'HTTPS è HTTP dentro un tunnel {{TLS:Transport Layer Security, il protocollo che cifra e autentica il canale}}. Dà tre garanzie: **riservatezza** (chi osserva non legge), **integrità** (chi osserva non modifica senza essere scoperto), **autenticazione del server** (il certificato prova che parli davvero con quel dominio).',
    },
    {
      id: 'e-compare',
      kind: 'comparison',
      left: {
        label: 'Cosa TLS protegge',
        tone: 'good',
        language: 'text',
        code: `Il contenuto delle richieste
Il percorso e i parametri
Gli header, cookie compresi
Il corpo delle risposte

Contro chi osserva la rete:
Wi-Fi pubblico, ISP, chiunque
stia in mezzo.`,
      },
      right: {
        label: 'Cosa TLS NON protegge',
        tone: 'bad',
        language: 'text',
        code: `Il nome del sito che visiti (SNI/DNS)
Gli indirizzi IP e i volumi
L'applicazione dietro il tunnel

Un'applicazione vulnerabile
resta vulnerabile: la SQL
injection arriva cifrata,
e funziona lo stesso.`,
        note: 'Il lucchetto dice "il canale è protetto", non "il sito è sicuro". È la confusione più diffusa che esista.',
      },
    },
    {
      id: 'e-quiz',
      kind: 'quiz',
      question: 'Un sito è su HTTPS con certificato valido. Quale affermazione è corretta?',
      options: [
        { id: 'a', text: 'I dati inviati sono al sicuro anche dopo essere arrivati al server' },
        { id: 'b', text: 'Il sito non può contenere vulnerabilità' },
        { id: 'c', text: 'Il canale è protetto da chi osserva la rete; cosa fa il server con i dati non è garantito' },
        { id: 'd', text: 'Il certificato garantisce che il proprietario sia un’azienda legittima' },
      ],
      correct: ['c'],
      explanation:
        'TLS protegge il trasporto, punto. Il certificato prova il controllo del dominio, non l’onestà di chi lo possiede — anche un sito di phishing ha il lucchetto. E una SQL injection cifrata resta una SQL injection.',
      skills: ['http'],
    },
    {
      id: 'e-quiz-2',
      kind: 'quiz',
      question: 'Un endpoint risponde 403 per `/api/utenti/5` e 404 per `/api/utenti/999`. Cosa hai appena scoperto?',
      options: [
        { id: 'a', text: 'Niente: sono entrambi errori' },
        { id: 'b', text: 'Che l’utente 5 esiste e il 999 no — l’applicazione conferma l’esistenza tramite il codice' },
        { id: 'c', text: 'Che l’API è protetta correttamente' },
        { id: 'd', text: 'Che il server ha un bug di routing' },
      ],
      correct: ['b'],
      explanation:
        'La differenza fra i due codici è una fuga di informazione: permette di enumerare quali identificativi esistono senza poterli leggere. Un’applicazione attenta risponde 404 in entrambi i casi. È anche il primo passo pratico verso un IDOR, che è la prossima lezione del livello Web.',
      skills: ['http'],
    },
    {
      id: 'f-kp',
      kind: 'keypoints',
      title: 'Da portarsi via',
      points: [
        'Richiesta e risposta sono testo: riga iniziale, header, riga vuota, corpo.',
        'I metodi sono convenzioni scritte dal client, non garanzie.',
        'Le classi di status raccontano lo stato interno: 403 vs 404 e i 500 sono i più eloquenti.',
        'Gli header di richiesta non sono prove; quelli di risposta sono difese.',
        'TLS protegge il canale, non l’applicazione.',
      ],
    },
  ],
  exercises: [],
  recap: [
    'HTTP è testuale e senza stato: ogni richiesta si porta dietro la propria identità.',
    'Metodi e header vengono dal client: sono input, non fatti.',
    '403/404 e 500 sono le risposte che rivelano di più.',
    'HTTPS protegge il trasporto; il resto dipende dall’applicazione.',
  ],
  furtherReading: [
    { title: 'MDN: HTTP headers', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers' },
    { title: 'MDN: HTTP response status codes', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Status' },
    { title: 'OWASP Secure Headers Project', url: 'https://owasp.org/www-project-secure-headers/' },
  ],
};
