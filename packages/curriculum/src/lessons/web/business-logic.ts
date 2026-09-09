import type { Lesson } from '@cyberlab/core';

/**
 * Business Logic Flaws — la lezione che chiude il livello Web.
 *
 * Tutte le vulnerabilità precedenti hanno una firma: una stringa strana, un
 * carattere fuori posto, un payload riconoscibile. Questa no. Qui ogni
 * richiesta è ben formata e ogni controllo scritto nel codice passa: il difetto
 * è nell'insieme delle regole, non in una riga. Per questo è messa alla fine —
 * è l'unica che non si trova con uno scanner, e obbliga a leggere
 * l'applicazione come un sistema di regole invece che come codice.
 */
export const businessLogicLesson: Lesson = {
  id: 'web.business-logic',
  moduleId: 'mod.web-advanced',
  title: 'Business Logic Flaws',
  subtitle: 'Abusi che non violano nessuna regola verificata dal codice',
  status: 'theory-only',
  difficulty: 'advanced',
  skills: ['business-logic', 'access-control', 'http'],
  estimatedMinutes: 35,
  prerequisites: ['web.broken-access-control', 'web.file-upload'],
  objectives: [
    'Distinguere un difetto di logica da una vulnerabilità tecnica.',
    'Individuare assunzioni implicite: valori "impossibili", ordine dei passi, unicità.',
    'Spiegare come una race condition rompe un controllo scritto correttamente.',
    'Progettare controlli sull’invariante, sul server, al momento della decisione.',
  ],
  theory: [
    { id: 'a-h', kind: 'heading', level: 2, eyebrow: 'SECTION A · UN ALTRO TIPO DI DIFETTO', text: 'Nessun payload, nessun carattere strano' },
    {
      id: 'a-1',
      kind: 'prose',
      text: 'Tutte le vulnerabilità viste finora hanno un aspetto riconoscibile: un apostrofo, un `../`, un `<script>`, un token rifirmato. Un difetto di logica no. Ogni richiesta è perfettamente valida, ogni controllo presente nel codice viene superato, i log non mostrano nulla di anomalo. Il problema non è in una riga sbagliata: è in una **regola che nessuno ha scritto**, perché a nessuno è venuto in mente che servisse.',
    },
    {
      id: 'a-2',
      kind: 'prose',
      text: 'Da qui la conseguenza pratica più importante: nessuno scanner li trova. Uno strumento automatico sa riconoscere una SQL injection perché sa che aspetto ha; non può sapere che nel tuo negozio una quantità negativa dovrebbe essere impossibile, perché non sa cosa vendi. Trovare questi difetti richiede di capire **cosa l’applicazione sta cercando di fare**, e poi chiedersi quali assunzioni ha dato per scontate.',
    },
    {
      id: 'a-compare',
      kind: 'comparison',
      left: {
        label: 'Vulnerabilità tecnica',
        tone: 'neutral',
        language: 'text',
        code: `Input:  ' OR 1=1 --

- Riconoscibile
- Uguale su ogni applicazione
- Un WAF può intercettarla
- Uno scanner la trova
- Si corregge con una tecnica
  nota (query parametrizzate)`,
      },
      right: {
        label: 'Difetto di logica',
        tone: 'bad',
        language: 'text',
        code: `Input:  quantita = -5

- Richiesta perfettamente valida
- Unica per questa applicazione
- Nessun WAF la fermerà mai
- Nessuno scanner la trova
- Si corregge capendo il dominio:
  cosa deve restare vero, sempre`,
        note: 'Il codice ha fatto esattamente ciò che gli è stato chiesto. È la richiesta a non essere mai stata immaginata.',
      },
    },

    { id: 'b-h', kind: 'heading', level: 2, eyebrow: 'SECTION B · LE FAMIGLIE', text: 'Le assunzioni che le applicazioni danno per scontate' },
    {
      id: 'b-table',
      kind: 'table',
      columns: ['Assunzione implicita', 'Cosa provi tu', 'Cosa può succedere'],
      rows: [
        ['«I numeri sono positivi»', 'quantita = -5, importo = -100', 'Un totale che si abbassa; un trasferimento che inverte la direzione'],
        ['«I passi avvengono in ordine»', 'Chiamare /conferma senza passare da /pagamento', 'Ordine confermato senza pagare'],
        ['«Il prezzo lo decidiamo noi»', 'Rimandare indietro il prezzo ricevuto, modificato', 'Acquisto a un prezzo scelto dal cliente'],
        ['«Il coupon si usa una volta»', 'Applicarlo due volte, o in parallelo', 'Sconti cumulati oltre il valore del carrello'],
        ['«Il client fa i controlli»', 'Inviare la richiesta senza passare dal form', 'Ogni validazione JavaScript aggirata'],
        ['«Nessuno chiede la stessa cosa due volte insieme»', 'Due richieste identiche nello stesso istante', 'Race condition: il controllo passa due volte'],
      ],
      caption: 'Nessuna di queste righe è un bug di programmazione. Sono aspettative sul mondo, mai messe per iscritto nel codice.',
    },
    {
      id: 'b-code',
      kind: 'code',
      language: 'javascript',
      filename: 'checkout.js — ogni riga è corretta',
      code: `app.post('/checkout', async (req, res) => {
  const { prodottoId, quantita } = req.body;
  const p = await db.prodotto(prodottoId);
  if (!p) return res.status(404).end();

  const totale = p.prezzo * quantita;
  await addebita(req.utente, totale);
  res.json({ totale });
});`,
      highlight: [2, 6],
      annotations: {
        2: 'quantita arriva dal client: nessun vincolo sul segno o sul massimo',
        4: 'il prodotto esiste — questo controllo c’è ed è giusto',
        6: 'con quantita = -3 il totale è negativo: addebita() accredita',
      },
      caption: 'Non manca un escape, non manca un controllo di autorizzazione. Manca la frase "una quantità è un intero positivo".',
    },
    {
      id: 'b-quiz',
      kind: 'quiz',
      question: 'Perché un WAF e uno scanner automatico non trovano il difetto qui sopra, mentre trovano una SQL injection?',
      options: [
        { id: 'a', text: 'Perché il difetto è nel frontend' },
        { id: 'b', text: 'Perché `quantita = -3` è una richiesta sintatticamente valida e indistinguibile da una legittima: solo chi conosce il dominio sa che quel valore è assurdo' },
        { id: 'c', text: 'Perché i WAF ignorano le richieste POST' },
        { id: 'd', text: 'Perché serve un tool a pagamento' },
      ],
      correct: ['b'],
      explanation:
        'Uno scanner cerca **firme**: sa che aspetto ha un payload SQL perché è lo stesso ovunque. Un `-3` in un campo numerico non ha firma — è un numero, e in un modulo di reso sarebbe perfettamente legittimo. Solo il significato dell’operazione dice che qui è impossibile, e quel significato vive nella testa di chi ha progettato il sistema, non nel traffico. È il motivo per cui i difetti di logica sono la parte del lavoro che resta umana.',
      skills: ['business-logic'],
    },

    { id: 'c-h', kind: 'heading', level: 2, eyebrow: 'SECTION C · RACE CONDITION', text: 'Quando il controllo è giusto ma arriva tardi' },
    {
      id: 'c-1',
      kind: 'prose',
      text: 'Una famiglia merita una sezione a parte, perché rompe controlli scritti **correttamente**. Fra il momento in cui verifichi una condizione e quello in cui agisci passa del tempo. Se in quella finestra entra una seconda richiesta, entrambe hanno letto lo stesso stato — e passano entrambe. È il TOCTOU, *time-of-check to time-of-use*.',
    },
    {
      id: 'c-seq',
      kind: 'sequence',
      actors: [
        { id: 'a', label: 'Richiesta A' },
        { id: 'b', label: 'Richiesta B' },
        { id: 'db', label: 'Database' },
      ],
      messages: [
        { from: 'a', to: 'db', label: 'Il coupon SCONTO50 è già usato?', tone: 'accent' },
        { from: 'b', to: 'db', label: 'Il coupon SCONTO50 è già usato?', tone: 'accent', detail: 'Arriva prima che A abbia scritto qualcosa: legge lo stesso stato.' },
        { from: 'db', to: 'a', label: 'No, disponibile', tone: 'success' },
        { from: 'db', to: 'b', label: 'No, disponibile', tone: 'danger', detail: 'La risposta è corretta rispetto a ciò che il database sa in questo istante. Il problema è la finestra.' },
        { from: 'a', to: 'db', label: 'Applica lo sconto, segna come usato' },
        { from: 'b', to: 'db', label: 'Applica lo sconto, segna come usato', tone: 'danger', detail: 'Due volte. Il controllo è passato due volte perché è stato eseguito due volte prima di ogni scrittura.' },
      ],
    },
    {
      id: 'c-2',
      kind: 'prose',
      text: 'Lo stesso schema svuota conti (due prelievi dello stesso saldo), moltiplica premi, supera limiti di quantità e aggira i tentativi di login consentiti. Non serve un tool sofisticato: bastano due richieste inviate insieme. E non si corregge aggiungendo un altro controllo — se ne aggiungeresti uno con la stessa finestra. Si corregge **eliminando la finestra**.',
    },
    {
      id: 'c-compare',
      kind: 'comparison',
      left: {
        label: 'Vulnerabile: controlla, poi agisci',
        tone: 'bad',
        language: 'javascript',
        code: `const c = await db.coupon(codice);
if (c.usato) return errore();

// ← qui c'è la finestra
await applicaSconto(c);
await db.segnaUsato(c);`,
        note: 'Fra la lettura e la scrittura lo stato può cambiare. Con due richieste simultanee, cambia.',
      },
      right: {
        label: 'Corretto: una sola operazione atomica',
        tone: 'good',
        language: 'sql',
        code: `-- Il database decide, una volta sola.
UPDATE coupon
   SET usato = 1, usato_da = :utente
 WHERE codice = :codice
   AND usato = 0;
-- 1 riga aggiornata → hai vinto tu
-- 0 righe            → qualcun altro`,
        note: 'La condizione e la scrittura avvengono nella stessa istruzione: non esiste un istante in mezzo. In alternativa, un lock sulla riga o un vincolo di unicità.',
      },
    },
    {
      id: 'c-quiz',
      kind: 'quiz',
      question: 'Un endpoint verifica `if (saldo >= importo)` e poi sottrae. Due richieste identiche inviate insieme prelevano il doppio del saldo. Qual è la correzione giusta?',
      options: [
        { id: 'a', text: 'Aggiungere un secondo controllo sul saldo subito dopo il primo' },
        { id: 'b', text: 'Rendere atomica la verifica-e-scrittura: un `UPDATE … WHERE saldo >= importo`, un lock sulla riga o una transazione con isolamento adeguato' },
        { id: 'c', text: 'Rallentare le richieste con un ritardo casuale' },
        { id: 'd', text: 'Validare l’importo lato client prima dell’invio' },
      ],
      correct: ['b'],
      explanation:
        'Il controllo non è sbagliato: è **separato** dall’azione, e in quella separazione entra la seconda richiesta. Un secondo controllo eredita la stessa finestra, e un ritardo la restringe senza chiuderla — l’attaccante riprova. Solo rendere indivisibile la coppia verifica-scrittura elimina l’istante in cui due richieste possono leggere lo stesso stato. È la ragione per cui questi difetti si risolvono nel database, dove l’atomicità esiste davvero.',
      skills: ['business-logic'],
    },

    { id: 'd-h', kind: 'heading', level: 2, eyebrow: 'SECTION D · METODO', text: 'Come si cercano difetti che non hanno una firma' },
    {
      id: 'd-timeline',
      kind: 'timeline',
      entries: [
        { title: '1 · Capire l’intenzione', text: 'Prima di toccare qualcosa: cosa dovrebbe garantire questo flusso? Chi ci guadagna e chi ci perde? Senza questo passo non hai un metro per giudicare cosa sia un abuso.' },
        { title: '2 · Scrivere gli invarianti', text: 'Frasi che devono restare vere sempre: "il totale non è mai negativo", "un coupon vale una volta", "non si spedisce prima di aver incassato". Ogni invariante è un test.', tone: 'success' },
        { title: '3 · Cercare dove non sono imposti', text: 'Il controllo è sul client? È in un solo percorso mentre l’API ne offre tre? Vale per il flusso normale ma non per l’annullamento? I difetti vivono nei percorsi alternativi.', tone: 'danger' },
        { title: '4 · Rompere le aspettative, una per volta', text: 'Valori limite e assurdi, passi saltati o ripetuti, richieste simultanee, stessa azione da un endpoint diverso. È l’equivalente logico del fuzzing.' },
        { title: '5 · Misurare l’impatto in termini di dominio', text: 'Un report utile qui non dice "input non validato": dice "un cliente può ordinare a prezzo negativo e farsi accreditare". Il livello Pentesting tornerà proprio su questo.', tone: 'success' },
      ],
    },
    {
      id: 'd-legal',
      kind: 'callout',
      variant: 'legal',
      title: 'Scope: qui il danno è immediato e reale',
      text: 'Un difetto di logica si dimostra compiendo davvero l’operazione: un ordine a prezzo alterato, un coupon usato due volte, un trasferimento che non doveva riuscire. Su un sistema reale questo produce transazioni vere e danno economico — è frode informatica, anche se l’intenzione era dimostrativa. La regola è provare con importi minimi su account di test, fermarsi alla prima conferma, e segnalare subito. In ambienti di produzione si concorda prima cosa è lecito eseguire.',
    },
    {
      id: 'd-kp',
      kind: 'keypoints',
      title: 'Le difese',
      points: [
        'Validare sul **server** ogni valore, con il vincolo giusto: intero, positivo, entro un massimo sensato.',
        'Non fidarsi mai di prezzi, sconti o totali che tornano dal client: si ricalcolano dai dati autorevoli.',
        'Imporre lo stato del flusso: ogni passo verifica che i precedenti siano avvenuti davvero.',
        'Rendere atomiche le coppie verifica-azione; usare vincoli di unicità e idempotenza sulle operazioni ripetibili.',
        'Trattare gli invarianti come test automatici: sono l’unico modo per non riperderli alla prossima modifica.',
      ],
    },
    {
      id: 'e-kp',
      kind: 'keypoints',
      title: 'Da portarsi via',
      points: [
        'Un difetto di logica usa richieste valide: nessuna firma, nessuno scanner, nessun WAF.',
        'Nasce da assunzioni mai scritte: segno dei numeri, ordine dei passi, unicità, chi decide il prezzo.',
        'Le race condition rompono controlli corretti sfruttando la finestra fra verifica e azione.',
        'Si difende scrivendo gli invarianti e imponendoli sul server, in modo atomico.',
      ],
    },
    {
      id: 'e-close',
      kind: 'callout',
      variant: 'tip',
      title: 'Fine del livello Web',
      text: 'Guarda indietro al percorso: access control, injection, XSS e CSRF, SSRF, JWT, path traversal, upload. Quasi tutte rispondevano alla stessa domanda — *dove finisce il dato non fidato e chi lo interpreta?*. Questa lezione ne pone una diversa: *quali regole l’applicazione dà per scontate?*. Portale entrambe nel livello Recon, dove imparerai a mappare un bersaglio prima di sapere quali domande fargli.',
    },
  ],
  recap: [
    'I difetti di logica usano richieste valide che nessun controllo intercetta.',
    'Le assunzioni implicite — segno, ordine, unicità, autorità sul prezzo — sono la superficie d’attacco.',
    'Le race condition sfruttano la finestra fra verifica e azione.',
    'La difesa è scrivere gli invarianti e imporli sul server, atomicamente.',
  ],
  furtherReading: [
    { title: 'PortSwigger: Business logic vulnerabilities', url: 'https://portswigger.net/web-security/logic-flaws' },
    { title: 'OWASP: Testing for Business Logic', url: 'https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/10-Business_Logic_Testing/' },
    { title: 'OWASP Top 10 — A04: Insecure Design', url: 'https://owasp.org/Top10/A04_2021-Insecure_Design/', note: 'La categoria nata proprio per i difetti che non sono errori di implementazione.' },
  ],
  exercises: [],
};
