import type { Lesson } from '@cyberlab/core';

/**
 * Ports and sockets — the lesson that makes `ss -tulpn` readable.
 *
 * Short by design: it exists to nail one distinction learners get wrong for
 * years, that a socket bound to 127.0.0.1 and one bound to 0.0.0.0 are a
 * completely different security posture. That single idea explains half of the
 * "how did they reach the database?" post-mortems in the industry.
 */
export const portsSocketsLesson: Lesson = {
  id: 'found.ports-sockets',
  moduleId: 'mod.net-foundations',
  title: 'Porte e socket',
  subtitle: 'Chi ascolta, su quale interfaccia, e chi può raggiungerlo',
  status: 'theory-only',
  difficulty: 'beginner',
  estimatedMinutes: 20,
  skills: ['tcpip'],
  prerequisites: ['found.tcp-ip'],
  objectives: [
    'Definire un socket come la coppia indirizzo + porta, e una connessione come una quadrupla.',
    'Distinguere un servizio in ascolto su loopback da uno esposto su tutte le interfacce.',
    'Leggere l’output di `ss`/`netstat` e dedurne la superficie d’attacco.',
  ],
  theory: [
    { id: 'a-h', kind: 'heading', level: 2, eyebrow: 'SECTION A · SOCKET', text: 'Un socket è un indirizzo più una porta' },
    {
      id: 'a-1',
      kind: 'prose',
      text: 'Un programma che vuole ricevere connessioni fa tre cose: crea un socket, lo **lega** a un indirizzo e a una porta (`bind`), e si mette in **ascolto** (`listen`). La parte che quasi nessuno guarda è la prima metà del bind: *a quale indirizzo*. È lì che si decide chi potrà arrivare.',
    },
    {
      id: 'a-compare',
      kind: 'comparison',
      left: {
        label: 'Solo locale — 127.0.0.1',
        tone: 'good',
        language: 'text',
        code: `tcp  127.0.0.1:5432  LISTEN

Raggiungibile solo da processi
sulla stessa macchina.
Nessun firewall necessario:
il kernel non accetta
connessioni da fuori.`,
        note: 'La posizione di default corretta per database e servizi interni.',
      },
      right: {
        label: 'Tutte le interfacce — 0.0.0.0',
        tone: 'bad',
        language: 'text',
        code: `tcp  0.0.0.0:5432  LISTEN

Raggiungibile da chiunque
possa instradare pacchetti
verso questa macchina.
Ora l'unica difesa è
il firewall — e le regole
si sbagliano.`,
        note: 'Ogni "database trovato su Internet" comincia da questa riga.',
      },
    },
    {
      id: 'a-2',
      kind: 'prose',
      text: 'Una connessione stabilita non è identificata dalla sola porta ma dalla **quadrupla** `(IP sorgente, porta sorgente, IP destinazione, porta destinazione)`. Il server usa sempre la stessa porta nota; a distinguere le migliaia di connessioni simultanee è la porta effimera del client, diversa ogni volta.',
    },
    {
      id: 'a-code',
      kind: 'code',
      language: 'bash',
      filename: 'cosa ascolta su questa macchina',
      code: `ss -tulpn
# Netid State   Local Address:Port   Peer Address:Port  Process
# tcp   LISTEN  0.0.0.0:22           0.0.0.0:*          sshd
# tcp   LISTEN  127.0.0.1:5432       0.0.0.0:*          postgres
# tcp   LISTEN  0.0.0.0:8080         0.0.0.0:*          java
# udp   UNCONN  0.0.0.0:53           0.0.0.0:*          systemd-resolved`,
      highlight: [3, 5],
      annotations: {
        3: 'SSH esposto: normale, ma va protetto con chiavi e non con password',
        4: 'Postgres su loopback: corretto, non raggiungibile dall’esterno',
        5: 'Un servizio Java su 8080 aperto a tutti — quasi sempre non intenzionale',
      },
      caption: '-t TCP, -u UDP, -l solo in ascolto, -p il processo, -n niente risoluzione dei nomi.',
    },
    {
      id: 'a-callout',
      kind: 'callout',
      variant: 'tip',
      title: 'Il riflesso da costruire',
      text: 'Appena ottieni una shell su una macchina, `ss -tulpn` è fra i primi comandi: rivela servizi che dall’esterno non vedevi, perché legati a loopback o filtrati dal firewall. Molte scalate di privilegi cominciano da un servizio "solo interno" che si fidava di chiunque riuscisse a parlargli.',
    },
    {
      id: 'a-quiz',
      kind: 'quiz',
      question: 'Un database ascolta su `127.0.0.1:5432`. Da Internet la porta risulta chiusa. Quando diventa comunque un problema?',
      options: [
        { id: 'a', text: 'Mai: loopback è sicuro per definizione' },
        { id: 'b', text: 'Se ottieni l’esecuzione di codice sulla macchina, o un SSRF che fa fare la richiesta al server stesso' },
        { id: 'c', text: 'Solo se il database non ha password' },
        { id: 'd', text: 'Solo su IPv6' },
      ],
      correct: ['b'],
      explanation:
        'Loopback significa "raggiungibile da questa macchina", non "sicuro". Qualunque primitiva che ti faccia agire *dall’interno* — una webshell, un RCE, o un SSRF che convince il server a fare la richiesta per te — trasforma un servizio interno in un bersaglio diretto. È esattamente il motivo per cui SSRF è così grave, e lo vedrai nel livello Web.',
      skills: ['tcpip'],
    },
    {
      id: 'b-kp',
      kind: 'keypoints',
      title: 'Da portarsi via',
      points: [
        'Socket = indirizzo + porta. L’indirizzo del bind decide chi può raggiungerti.',
        '127.0.0.1 è una difesa strutturale; 0.0.0.0 sposta tutta la difesa sul firewall.',
        'Una connessione è una quadrupla: è la porta effimera del client a distinguerle.',
        '`ss -tulpn` è la prima fotografia della superficie d’attacco di una macchina.',
      ],
    },
  ],
  exercises: [],
  recap: [
    'bind + listen: l’indirizzo scelto nel bind è una decisione di sicurezza.',
    'Loopback non è raggiungibile da fuori, ma lo è da chi è già dentro.',
    '`ss -tulpn` elenca servizi, interfacce e processi.',
  ],
  furtherReading: [
    { title: 'Beej’s Guide to Network Programming', url: 'https://beej.us/guide/bgnet/' },
  ],
};
