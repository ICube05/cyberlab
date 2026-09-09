import type { Lesson } from '@cyberlab/core';

/**
 * JWT — l'unica lezione del livello in cui l'attacco si compie dal vivo.
 *
 * L'inspector non è un'illustrazione: ricalcola davvero HMAC-SHA256 con Web
 * Crypto sul token che il learner sta modificando. Quindi il percorso completo
 * — riscrivi il payload, il verdetto diventa rosso, indovini il segreto, il
 * verdetto torna verde — accade sotto le mani, e nessuna prosa può sostituirlo.
 * I due token qui sotto sono firmati per davvero: il primo verifica con il
 * segreto "secret", il secondo non ha firma affatto.
 */
export const jwtLesson: Lesson = {
  id: 'web.jwt',
  moduleId: 'mod.web-advanced',
  title: 'JWT & attacchi',
  subtitle: 'Un token che chiunque può leggere, e che solo la firma difende',
  status: 'theory-only',
  difficulty: 'advanced',
  skills: ['jwt', 'crypto-basics', 'encoding', 'authn'],
  estimatedMinutes: 40,
  prerequisites: ['found.crypto', 'found.http-cookies'],
  objectives: [
    'Leggere un JWT a mano e distinguere ciò che è codificato da ciò che è protetto.',
    'Sfruttare `alg: none` e la confusione di algoritmo su un verificatore ingenuo.',
    'Riconoscere un segreto debole e capire perché è attaccabile offline.',
    'Elencare i controlli che una verifica corretta deve fare, in ordine.',
  ],
  theory: [
    { id: 'a-h', kind: 'heading', level: 2, eyebrow: 'SECTION A · ANATOMIA', text: 'Tre pezzi, due dei quali in chiaro' },
    {
      id: 'a-1',
      kind: 'prose',
      text: 'Nella lezione sui cookie hai visto i due modelli di sessione: il puntatore casuale, con i dati sul server, e il **token autoconsistente**, che si porta dietro i dati. Il JWT è il secondo modello nella sua forma più diffusa. Tre parti separate da un punto: `header.payload.signature`. Header e payload sono JSON codificato in **base64url** — non cifrato, *codificato*. Chiunque abbia il token li legge; la distinzione fra codifica e cifratura, che nella lezione di crittografia sembrava pedanteria, qui è tutta la vulnerabilità.',
    },
    {
      id: 'a-code',
      kind: 'code',
      language: 'text',
      filename: 'un JWT smontato',
      code: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9   ← header
.
eyJzdWIiOiIxMDQyIiwicm9sZSI6InVzZXIifQ   ← payload
.
DFb1xFm4lQuzyUSiDCmrT_CghFXA2WZG-Vjq…    ← firma

header  = {"alg":"HS256","typ":"JWT"}
payload = {"sub":"1042","role":"user"}
firma   = HMAC-SHA256(header.payload, segreto)`,
      annotations: {
        1: 'dichiara con quale algoritmo il token è stato firmato — ed è il client a spedirlo',
        3: 'i claim: chi sei, cosa puoi, fino a quando',
        5: 'l’unica parte che non puoi ricalcolare senza il segreto',
      },
      caption: 'La firma copre header e payload. Cambiare un solo carattere dei primi due invalida la terza.',
    },
    {
      id: 'a-2',
      kind: 'prose',
      text: 'Da qui segue la regola operativa più importante: **il payload di un JWT non è un posto dove mettere segreti**. Numeri di carta, dati personali, chiavi interne: tutto ciò che finisce lì viaggia leggibile. Ciò che la firma offre non è riservatezza, è **integrità** — la garanzia che quel contenuto non è stato modificato da chi non possiede la chiave.',
    },
    {
      id: 'a-table',
      kind: 'table',
      columns: ['Claim', 'Significato', 'Perché conta in sicurezza'],
      rows: [
        ['sub', 'Il soggetto: chi è l’utente', 'È l’identità su cui l’app costruirà l’autorizzazione'],
        ['exp', 'Scadenza', 'Se non viene verificata, un token vale per sempre'],
        ['iat / nbf', 'Emesso il / non valido prima di', 'Finestra temporale di validità'],
        ['iss / aud', 'Emittente / destinatario', 'Senza aud, un token valido per un servizio può valere per un altro'],
        ['alg (header)', 'Algoritmo di firma', 'È un’affermazione del client: trattarla come istruzione è la vulnerabilità classica'],
      ],
    },

    { id: 'b-h', kind: 'heading', level: 2, eyebrow: 'SECTION B · DAL VIVO', text: 'Smontalo, riscrivilo, guarda la firma cadere' },
    {
      id: 'b-1',
      kind: 'prose',
      text: 'Il pannello qui sotto è un vero verificatore: ricalcola HMAC-SHA256 su ciò che scrivi, esattamente come farebbe il server. Parti dal token valido e prova questa sequenza — è l’attacco intero, in tre passaggi.',
    },
    {
      id: 'b-steps',
      kind: 'keypoints',
      title: 'Fallo adesso, nell’ordine',
      points: [
        '**1.** Nel payload cambia `"role": "user"` in `"role": "admin"`. Il verdetto diventa rosso: hai modificato i dati, ma non sai rifirmare. È la firma che sta facendo il suo lavoro.',
        '**2.** Nel campo del segreto scrivi `secret` e premi **Rifirma**. Verde. Il segreto era una parola da dizionario, e con essa il token è tuo: puoi scrivere qualunque claim.',
        '**3.** Prova un segreto sbagliato e rifirma: rosso di nuovo. La sicurezza dell’intero schema è concentrata in quella stringa.',
      ],
    },
    {
      id: 'b-jwt',
      kind: 'jwt',
      token:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMDQyIiwibmFtZSI6Ik1hcnRhIFJvc3NpIiwicm9sZSI6InVzZXIiLCJpYXQiOjE3MzU2ODk2MDAsImV4cCI6MTczNTY5MzIwMH0.DFb1xFm4lQuzyUSiDCmrT_CghFXA2WZG-Vjqc3jZYBg',
      hmacSecret: 'secret',
      hint: 'Il segreto di questo token è una sola parola comunissima. Se non la indovini a mente: è la prima riga di quasi ogni wordlist. Nota che il verdetto cambia mentre scrivi — è HMAC-SHA256 calcolato davvero nel browser, non una finzione.',
      tutorNote: 'Il learner sta manipolando un JWT reale: payload modificabile, firma ricalcolata con Web Crypto, segreto debole ("secret") da scoprire.',
    },
    {
      id: 'b-2',
      kind: 'prose',
      text: 'Quel terzo passaggio è il punto: con HS256 la firma è un **HMAC**, cioè crittografia a chiave *simmetrica*. Chi verifica e chi firma usano la stessa chiave. Se la indovini, non stai aggirando la firma: la stai producendo, e sei indistinguibile dal server. E indovinarla non richiede di parlare con il server — hai già un token firmato, quindi puoi provare miliardi di candidati **offline**, alla velocità della tua GPU, senza che nessun rate limit o log ti veda.',
    },
    {
      id: 'b-quiz',
      kind: 'quiz',
      question: 'Perché un segreto HMAC debole è più pericoloso di una password utente debole?',
      options: [
        { id: 'a', text: 'Non lo è: sono equivalenti' },
        { id: 'b', text: 'Perché avendo un token firmato l’attacco si fa offline, senza rate limit né log, e il segreto trovato firma token per qualunque utente' },
        { id: 'c', text: 'Perché il segreto è più corto' },
        { id: 'd', text: 'Perché HMAC è un algoritmo debole' },
      ],
      correct: ['b'],
      explanation:
        'Due differenze, entrambe decisive. Primo: un login ti oppone rate limit, blocchi e allarmi; craccare un HMAC no — hai già il messaggio e la firma, quindi provi i candidati sulla tua macchina, in silenzio. Secondo: una password compromette un account, il segreto di firma li compromette **tutti**, e ti fa emettere token nuovi con qualunque `sub` e qualunque `role`. Per questo un segreto JWT deve essere una chiave casuale lunga, generata, non una parola scelta da una persona.',
      skills: ['jwt', 'crypto-basics'],
    },

    { id: 'c-h', kind: 'heading', level: 2, eyebrow: 'SECTION C · alg', text: 'Quando il token detta le regole della propria verifica' },
    {
      id: 'c-1',
      kind: 'prose',
      text: 'Torna un attimo all’header: `{"alg":"HS256"}`. È il **token** a dichiarare con quale algoritmo va verificato — e il token arriva dal client. Una libreria scritta ingenuamente legge quel campo e obbedisce. Lo standard prevede anche il valore `none`, pensato per token già protetti da un altro strato. Se il verificatore lo accetta, la firma sparisce e con lei ogni garanzia.',
    },
    {
      id: 'c-jwt-none',
      kind: 'jwt',
      token:
        'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIxMDQyIiwibmFtZSI6Ik1hcnRhIFJvc3NpIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNzM1Njg5NjAwLCJleHAiOjE3MzU2OTMyMDB9.',
      hmacSecret: 'secret',
      hint: 'Questo token ha `alg: none`, `role: admin` e nessuna firma dopo l’ultimo punto — eppure il verificatore ingenuo lo accetta. Rimetti `"alg": "HS256"` nell’header e guarda cosa succede: senza firma non passa più.',
      tutorNote: 'Dimostrazione di alg=none: nessuna firma, ruolo admin, accettato da un verificatore che si fida dell’header.',
    },
    {
      id: 'c-table',
      kind: 'table',
      columns: ['Attacco', 'Cosa manipola', 'Cosa serve all’attaccante', 'Difesa'],
      rows: [
        ['alg: none', 'L’header, e cancella la firma', 'Solo un token qualsiasi', 'Algoritmo atteso fissato lato server, `none` mai accettato'],
        ['Segreto debole', 'Il payload, poi rifirma', 'Un token firmato + wordlist, offline', 'Chiave casuale lunga, ruotabile'],
        ['Confusione RS256 → HS256', 'L’header: da asimmetrico a simmetrico', 'La chiave pubblica, che è pubblica', 'Non lasciare che l’header scelga la famiglia di algoritmi'],
        ['kid / jku manipolati', 'Il puntatore alla chiave nell’header', 'Un endpoint o un percorso che controlli', 'Chiavi solo da una fonte fidata, `kid` come indice di una allow-list'],
      ],
    },
    {
      id: 'c-2',
      kind: 'prose',
      text: 'La terza riga merita un istante in più. Con **RS256** la firma è asimmetrica: il server firma con la chiave *privata* e verifica con quella *pubblica* — che, essendo pubblica, la conosci. Se cambi l’header in `HS256`, un verificatore ingenuo passa a HMAC e usa come segreto simmetrico l’unica chiave che ha: quella pubblica. Che tu possiedi. Firmi tu, e il server ti crede. È lo stesso errore di sempre, in una forma più sottile: **si è lasciato decidere all’input non fidato quale controllo applicare**.',
    },
    {
      id: 'c-legal',
      kind: 'callout',
      variant: 'legal',
      title: 'Scope: forgiare un token è impersonare qualcuno',
      text: 'Rifirmare un JWT con `role: admin` e usarlo su un sistema reale è accesso abusivo e sostituzione di persona, indipendentemente da quanto sia stata banale la vulnerabilità. In un test autorizzato la prova è il token forgiato e la risposta del server che lo accetta — non la navigazione dentro i dati altrui. Qui il token vive nel tuo browser e non tocca nessun sistema.',
    },

    { id: 'd-h', kind: 'heading', level: 2, eyebrow: 'SECTION D · VERIFICA CORRETTA', text: 'Cosa deve fare il server, in ordine' },
    {
      id: 'd-compare',
      kind: 'comparison',
      left: {
        label: 'Vulnerabile: decodifica ≠ verifica',
        tone: 'bad',
        language: 'javascript',
        code: `// Legge i claim senza controllare nulla.
const payload = jwt.decode(token);
if (payload.role === 'admin') {
  concediAccesso();
}`,
        note: '`decode` non verifica: fa solo base64. È l’errore più frequente in assoluto — e con esso `alg: none` non serve nemmeno.',
      },
      right: {
        label: 'Corretto: algoritmo imposto, claim verificati',
        tone: 'good',
        language: 'javascript',
        code: `const payload = jwt.verify(token, chiave, {
  algorithms: ['RS256'],   // deciso qui,
                           // non dall'header
  issuer: 'https://auth.esempio.it',
  audience: 'api-ordini',
  clockTolerance: 30,      // exp/nbf verificati
});`,
        note: 'L’algoritmo atteso è fissato dal server; emittente, destinatario e scadenza sono controllati esplicitamente.',
      },
    },
    {
      id: 'd-timeline',
      kind: 'timeline',
      entries: [
        { title: '1 · Verificare la firma con l’algoritmo atteso', text: 'L’algoritmo lo sceglie il server, non l’header. `none` non è mai una risposta valida.', tone: 'success' },
        { title: '2 · Controllare exp, e se ci sono nbf, iss, aud', text: 'Un token senza scadenza verificata è una sessione che non finisce mai. `aud` impedisce che un token emesso per un servizio valga su un altro.', tone: 'success' },
        { title: '3 · Autorizzare, non solo autenticare', text: 'Il token dice chi sei. Che tu possa toccare *quell’oggetto* resta una decisione da prendere a ogni richiesta: è il broken access control della prima lezione del livello, e un JWT valido non lo risolve.', tone: 'success' },
        { title: 'Il limite strutturale: la revoca', text: 'Un JWT è valido finché non scade, perché il server non consulta nulla per accettarlo. Cacciare un utente prima della scadenza richiede una denylist o token brevi con refresh — cioè rimettere stato sul server, l’esatta cosa che il JWT prometteva di togliere.', tone: 'danger' },
      ],
    },
    {
      id: 'd-quiz',
      kind: 'quiz',
      question: 'Un backend fa `jwt.decode(token)` e legge `payload.role`. Dove sta il problema, e cosa cambia forzare `algorithms: [\'RS256\']` in `jwt.verify`?',
      options: [
        { id: 'a', text: 'Nessun problema: decode controlla la firma' },
        { id: 'b', text: '`decode` fa solo base64 e non verifica nulla: chiunque riscrive il payload. `verify` con l’algoritmo imposto controlla la firma e toglie all’header il potere di scegliere il metodo — chiudendo `none` e la confusione RS256→HS256' },
        { id: 'c', text: 'Il problema è solo la scadenza mancante' },
        { id: 'd', text: 'Bisogna cifrare il payload' },
      ],
      correct: ['b'],
      explanation:
        'Sono due difetti sovrapposti. `decode` restituisce i claim di *qualunque* stringa ben formata: non serve alcun attacco raffinato, basta scrivere `role: admin` e inviare. Passare a `verify` reintroduce il controllo della firma; fissare `algorithms` toglie all’input non fidato la scelta di *come* essere verificato, che è la radice comune di `alg: none` e della confusione fra RS256 e HS256. Restano poi da controllare `exp`, `iss`, `aud` — e l’autorizzazione per oggetto, che nessun token può sostituire.',
      skills: ['jwt', 'authn'],
    },
    {
      id: 'e-kp',
      kind: 'keypoints',
      title: 'Da portarsi via',
      points: [
        'Header e payload sono codificati, non cifrati: leggibili da chiunque abbia il token.',
        'La firma dà integrità, non riservatezza. Nessun segreto nel payload.',
        'Con HS256 il segreto è simmetrico: se è debole si cracca offline e firma token per chiunque.',
        '`alg` viene dal client: l’algoritmo atteso lo deve imporre il server, sempre.',
        'Un token valido dice chi sei; l’autorizzazione per oggetto resta da fare a ogni richiesta.',
        'La revoca è il limite strutturale del modello autoconsistente: scadenze brevi o denylist.',
      ],
    },
  ],
  recap: [
    'Un JWT è header.payload.signature: i primi due in base64url, in chiaro.',
    'La firma protegge l’integrità; il segreto simmetrico debole è attaccabile offline.',
    '`alg: none` e la confusione RS256→HS256 nascono dal fidarsi dell’header.',
    'Verifica corretta: algoritmo imposto, exp/iss/aud controllati, autorizzazione a parte.',
  ],
  furtherReading: [
    { title: 'OWASP JWT Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html' },
    { title: 'PortSwigger: JWT attacks', url: 'https://portswigger.net/web-security/jwt' },
    { title: 'RFC 8725 — JWT Best Current Practices', url: 'https://datatracker.ietf.org/doc/html/rfc8725', note: 'Il documento che elenca, uno per uno, gli errori visti qui.' },
  ],
  exercises: [],
};
