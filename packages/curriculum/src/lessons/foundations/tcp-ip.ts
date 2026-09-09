import type { Lesson } from '@cyberlab/core';

/**
 * TCP/IP without the seven-layer chant.
 *
 * The handshake is taught here because it is not trivia: every scanning
 * technique in the recon level is a *variation* on it. SYN scan, connect scan,
 * "filtered" versus "closed" — all of them are statements about which part of
 * this three-message exchange came back. Teach the handshake properly once and
 * Nmap's output stops being magic.
 */
export const tcpIpLesson: Lesson = {
  id: 'found.tcp-ip',
  moduleId: 'mod.net-foundations',
  title: 'TCP/IP',
  subtitle: 'Handshake, porte, e perché una scansione funziona',
  status: 'theory-only',
  difficulty: 'beginner',
  estimatedMinutes: 25,
  skills: ['tcpip'],
  prerequisites: ['found.how-internet-works'],
  objectives: [
    'Descrivere il three-way handshake e cosa significa ogni flag.',
    'Scegliere fra TCP e UDP sapendo cosa si guadagna e cosa si perde.',
    'Leggere lo stato di una porta (open / closed / filtered) da come risponde.',
    'Collegare il comportamento del protocollo alle tecniche di scanning.',
  ],
  theory: [
    { id: 'a-h', kind: 'heading', level: 2, eyebrow: 'SECTION A · IP', text: 'IP: consegna senza promesse' },
    {
      id: 'a-1',
      kind: 'prose',
      text: 'IP fa una cosa sola: prende un pacchetto e prova a consegnarlo. Non promette che arrivi, non promette l’ordine, non promette di dirti che è andato perso. Si chiama consegna *best-effort* ed è una scelta di progetto: la rete resta stupida e veloce, l’intelligenza va agli estremi.',
    },
    {
      id: 'a-2',
      kind: 'prose',
      text: 'Il campo più interessante per la sicurezza è l’**indirizzo sorgente**, perché lo scrive chi spedisce. Falsificarlo ({{spoofing:scrivere un indirizzo sorgente diverso dal proprio}}) è banale; ciò che non è banale è *ricevere la risposta*, che tornerà all’indirizzo falsificato. È il motivo per cui gli attacchi con IP spoofed sono quasi sempre attacchi "alla cieca" o di amplificazione.',
    },

    { id: 'b-h', kind: 'heading', level: 2, eyebrow: 'SECTION B · TCP', text: 'TCP: la promessa costruita sopra' },
    {
      id: 'b-1',
      kind: 'prose',
      text: 'TCP aggiunge quello che IP non dà: consegna ordinata, ritrasmissione di ciò che si perde, controllo del flusso. Per farlo ha bisogno di **stato** condiviso fra i due lati, e lo stato va aperto. Quell’apertura è il three-way handshake.',
    },
    {
      id: 'b-seq',
      kind: 'sequence',
      actors: [
        { id: 'c', label: 'Client' },
        { id: 's', label: 'Server :443' },
      ],
      messages: [
        { from: 'c', to: 's', label: 'SYN', detail: '"Voglio aprire una connessione. Il mio numero di sequenza parte da X."', tone: 'accent' },
        { from: 's', to: 'c', label: 'SYN + ACK', detail: '"Va bene, e il mio parte da Y. Ho ricevuto fino a X+1."', tone: 'success' },
        { from: 'c', to: 's', label: 'ACK', detail: '"Ricevuto. Da adesso la connessione è aperta." I dati partono dopo questo.', tone: 'accent' },
      ],
    },
    {
      id: 'b-2',
      kind: 'callout',
      variant: 'tip',
      title: 'Perché uno scanner ti serve saperlo',
      text: 'Un **SYN scan** manda solo il primo messaggio e legge la risposta: `SYN+ACK` significa porta aperta, `RST` significa chiusa, *nessuna risposta* significa filtrata da un firewall. Non completando il terzo passo, la connessione non viene mai stabilita e spesso non viene nemmeno registrata dall’applicazione. Tutta la tecnica sta in questo diagramma.',
    },
    {
      id: 'b-table',
      kind: 'table',
      columns: ['Cosa mandi', 'Cosa torna', 'Stato', 'Interpretazione'],
      rows: [
        ['SYN', 'SYN + ACK', 'open', 'Un servizio è in ascolto e vuole parlare.'],
        ['SYN', 'RST', 'closed', 'La macchina c’è, nessuno ascolta su quella porta.'],
        ['SYN', '(silenzio)', 'filtered', 'Qualcosa scarta il pacchetto: firewall o regola di rete.'],
        ['SYN', 'ICMP unreachable', 'filtered', 'Un dispositivo lungo il percorso rifiuta esplicitamente.'],
      ],
      caption: 'La differenza fra "chiusa" e "filtrata" è informazione preziosa: dice se esiste un filtro.',
    },

    { id: 'c-h', kind: 'heading', level: 2, eyebrow: 'SECTION C · UDP', text: 'UDP: nessuna promessa, nessun costo' },
    {
      id: 'c-compare',
      kind: 'comparison',
      left: {
        label: 'TCP — affidabile, con stato',
        tone: 'neutral',
        language: 'text',
        code: `handshake prima dei dati
ritrasmette ciò che si perde
consegna in ordine
controllo di congestione

HTTP, SSH, SMTP, database`,
        note: 'Paghi latenza iniziale e memoria per connessione. In cambio non perdi byte.',
      },
      right: {
        label: 'UDP — immediato, senza stato',
        tone: 'neutral',
        language: 'text',
        code: `nessun handshake
nessuna ritrasmissione
nessun ordine garantito
il programma si arrangia

DNS, DHCP, VoIP, giochi, QUIC`,
        note: 'Nessuno stato da aprire: è anche il motivo per cui scansionare UDP è lento e ambiguo.',
      },
    },
    {
      id: 'c-1',
      kind: 'prose',
      text: 'Su UDP il silenzio è ambiguo: una porta chiusa *dovrebbe* generare un ICMP port unreachable, ma quel messaggio è spesso limitato o filtrato. Per questo `nmap -sU` è lento e i suoi risultati vanno letti con prudenza — un dettaglio che nel livello Recon eviterà di farti perdere ore.',
    },

    { id: 'd-h', kind: 'heading', level: 2, eyebrow: 'SECTION D · PORTE', text: 'Porte: chi ascolta e chi chiama' },
    {
      id: 'd-1',
      kind: 'prose',
      text: 'Una connessione è identificata da **quattro** valori, non due: IP sorgente, porta sorgente, IP destinazione, porta destinazione. Il server ascolta su una porta nota (443); il client ne usa una temporanea, alta, scelta a caso ({{porta effimera:porta temporanea assegnata al client per una singola connessione}}). È così che il tuo browser può avere venti connessioni aperte allo stesso sito senza confondersi.',
    },
    {
      id: 'd-code',
      kind: 'code',
      language: 'bash',
      filename: 'stato delle connessioni',
      code: `ss -tunap | head
# Proto  Local Address:Port    Peer Address:Port   State
# tcp    10.0.0.5:54312        93.184.216.34:443   ESTAB
# tcp    0.0.0.0:22            0.0.0.0:*           LISTEN`,
      annotations: {
        3: 'porta effimera locale → porta nota remota: una connessione in uscita',
        4: 'in ascolto su tutte le interfacce: raggiungibile da fuori, se il firewall lo permette',
      },
      caption: 'LISTEN su 0.0.0.0 è la riga che un attaccante spera di trovare, e che un difensore controlla per prima.',
    },
    {
      id: 'd-table',
      kind: 'table',
      columns: ['Porta', 'Servizio', 'Perché interessa'],
      rows: [
        ['22', 'SSH', 'Accesso remoto: bersaglio di credenziali deboli e chiavi riusate.'],
        ['80 / 443', 'HTTP / HTTPS', 'La superficie più grande: quasi tutto questo corso vive qui.'],
        ['53', 'DNS', 'Ricognizione, esfiltrazione, amplificazione.'],
        ['445', 'SMB', 'Condivisioni Windows: enumerazione e movimento laterale.'],
        ['3306 / 5432', 'MySQL / PostgreSQL', 'Un database esposto è quasi sempre una configurazione sbagliata.'],
      ],
    },
    {
      id: 'd-quiz',
      kind: 'quiz',
      question: 'Scansioni una porta e ricevi RST. Cosa hai imparato?',
      options: [
        { id: 'a', text: 'La macchina non esiste' },
        { id: 'b', text: 'La macchina risponde, ma su quella porta non ascolta nessuno' },
        { id: 'c', text: 'Un firewall sta scartando i pacchetti' },
        { id: 'd', text: 'La porta è aperta ma il servizio ha rifiutato la connessione' },
      ],
      correct: ['b'],
      explanation:
        'RST è una risposta *attiva*: qualcuno a quell’indirizzo ha ricevuto il SYN e ha risposto "non c’è nessuno qui". Un firewall che scarta non risponde affatto, e quello è lo stato "filtered". Distinguere le due cose è ciò che rende utile una scansione.',
      skills: ['tcpip'],
    },
    {
      id: 'e-quiz',
      kind: 'quiz',
      question: 'Perché il DNS usa UDP per le query normali?',
      options: [
        { id: 'a', text: 'Perché UDP cifra i dati' },
        { id: 'b', text: 'Perché una query e una risposta stanno in un pacchetto: l’handshake costerebbe più della richiesta' },
        { id: 'c', text: 'Perché TCP non supporta la porta 53' },
        { id: 'd', text: 'Perché UDP garantisce l’ordine delle risposte' },
      ],
      correct: ['b'],
      explanation:
        'Una query DNS è minuscola e ripetibile: aprire una connessione TCP per spedirla triplicherebbe il traffico e la latenza. Se la risposta è troppo grande, il DNS ripiega su TCP. Nota il rovescio della medaglia: senza handshake la sorgente non è verificata, ed è esattamente ciò che rende il DNS un ottimo amplificatore per attacchi DDoS.',
      skills: ['tcpip'],
    },
    {
      id: 'f-kp',
      kind: 'keypoints',
      title: 'Da portarsi via',
      points: [
        'IP consegna senza garanzie; TCP costruisce le garanzie sopra, al prezzo di uno stato da aprire.',
        'SYN → SYN+ACK → ACK: tutte le tecniche di scanning sono varianti su questi tre messaggi.',
        'open / closed / filtered sono tre risposte diverse e tre informazioni diverse.',
        'Una connessione è una quadrupla; il client usa porte effimere, il server porte note.',
      ],
    },
  ],
  exercises: [],
  recap: [
    'Il three-way handshake apre lo stato TCP ed è la base dello scanning.',
    'UDP non ha stato: più veloce, ma il silenzio diventa ambiguo.',
    'RST = chiusa, nessuna risposta = filtrata.',
    'LISTEN su 0.0.0.0 significa raggiungibile dall’esterno.',
  ],
  furtherReading: [
    { title: 'Nmap: Port Scanning Techniques', url: 'https://nmap.org/book/man-port-scanning-techniques.html' },
    { title: 'RFC 9293 — Transmission Control Protocol', url: 'https://www.rfc-editor.org/rfc/rfc9293.html' },
  ],
};
