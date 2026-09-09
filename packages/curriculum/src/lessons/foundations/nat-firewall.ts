import type { Lesson } from '@cyberlab/core';

/**
 * NAT and firewalls.
 *
 * The point of the lesson is asymmetry: NAT makes outbound easy and inbound
 * hard, which is *why* every remote-access technique in the red-team level is a
 * reverse connection. Teaching that here means the reverse shell later needs no
 * hand-waving — the learner already knows which direction the network allows.
 */
export const natFirewallLesson: Lesson = {
  id: 'found.nat-firewall',
  moduleId: 'mod.net-foundations',
  title: 'NAT e firewall',
  subtitle: 'Perché uscire è facile ed entrare è difficile',
  status: 'theory-only',
  difficulty: 'beginner',
  estimatedMinutes: 22,
  skills: ['tcpip'],
  prerequisites: ['found.ports-sockets'],
  objectives: [
    'Spiegare come il NAT riscrive indirizzi e porte e mantiene la tabella delle traduzioni.',
    'Distinguere un firewall stateless da uno stateful.',
    'Capire perché una reverse shell attraversa i filtri che una bind shell non attraversa.',
    'Leggere una regola di firewall e dire cosa lascia passare davvero.',
  ],
  theory: [
    { id: 'a-h', kind: 'heading', level: 2, eyebrow: 'SECTION A · NAT', text: 'Un indirizzo pubblico per molte macchine' },
    {
      id: 'a-1',
      kind: 'prose',
      text: 'Gli indirizzi IPv4 pubblici sono finiti da anni. La soluzione universale è il **NAT**: la tua rete di casa o d’ufficio usa indirizzi privati (`192.168.x.x`, `10.x.x.x`, `172.16–31.x.x`) e il router li riscrive nel suo unico indirizzo pubblico quando i pacchetti escono.',
    },
    {
      id: 'a-flow',
      kind: 'flow',
      title: 'La traduzione, in uscita e al ritorno',
      nodes: [
        { id: 'pc', label: 'PC', sublabel: '192.168.1.20:51500', col: 0, row: 1, tone: 'accent' },
        { id: 'nat', label: 'Router NAT', sublabel: 'tabella traduzioni', col: 1, row: 1, tone: 'default', tooltip: '192.168.1.20:51500 ⇄ 88.12.4.7:61002 — la riga esiste solo perché sei uscito tu.' },
        { id: 'net', label: 'Internet', col: 2, row: 1, tone: 'muted' },
        { id: 'srv', label: 'Server', sublabel: '93.184.216.34:443', col: 3, row: 1, tone: 'success' },
      ],
      edges: [
        { from: 'pc', to: 'nat', label: 'src 192.168.1.20:51500', tone: 'accent' },
        { from: 'nat', to: 'net', label: 'src 88.12.4.7:61002', tone: 'accent' },
        { from: 'net', to: 'srv' },
        { from: 'srv', to: 'nat', label: 'dst 88.12.4.7:61002', tone: 'success', dashed: true },
        { from: 'nat', to: 'pc', label: 'dst 192.168.1.20:51500', tone: 'success', dashed: true },
      ],
    },
    {
      id: 'a-2',
      kind: 'prose',
      text: 'La riga nella tabella **nasce solo quando un pacchetto esce**. È questo il punto: un pacchetto che arriva dall’esterno senza una riga corrispondente non ha una destinazione interna a cui essere consegnato, e viene scartato. Il NAT non è nato come misura di sicurezza, ma di fatto rende la rete interna non raggiungibile per iniziativa altrui.',
    },
    {
      id: 'a-callout',
      kind: 'callout',
      variant: 'info',
      title: 'La conseguenza che tornerà per tutto il corso',
      text: 'Da dentro verso fuori: facile. Da fuori verso dentro: bloccato per costruzione. Ecco perché quasi ogni tecnica di accesso remoto è una **reverse connection**: la macchina compromessa apre lei la connessione verso l’attaccante, e il NAT — che non ha nulla da obiettare sul traffico in uscita — apre la strada del ritorno da solo.',
    },

    { id: 'b-h', kind: 'heading', level: 2, eyebrow: 'SECTION B · FIREWALL', text: 'Con memoria e senza' },
    {
      id: 'b-compare',
      kind: 'comparison',
      left: {
        label: 'Stateless — guarda un pacchetto alla volta',
        tone: 'neutral',
        language: 'text',
        code: `Regola: consenti dst 443
Regola: consenti src 443

Non sa che il secondo pacchetto
è la risposta al primo.
Per far tornare le risposte
devi aprire anche il verso
opposto — e quel verso resta
aperto a tutti.`,
        note: 'Semplice e veloce, ma le regole necessarie sono più larghe del necessario.',
      },
      right: {
        label: 'Stateful — ricorda le connessioni',
        tone: 'good',
        language: 'text',
        code: `Regola: consenti NEW dst 443
Regola: consenti ESTABLISHED

Tiene una tabella delle
connessioni in corso.
Le risposte passano perché
appartengono a una connessione
che ha già approvato, non
perché c'è una regola larga.`,
        note: 'È il modello di ogni firewall moderno, ed è anche come ragiona il NAT.',
      },
    },
    {
      id: 'b-code',
      kind: 'code',
      language: 'bash',
      filename: 'una policy minima, letta riga per riga',
      code: `iptables -P INPUT DROP
iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -A INPUT -i lo -j ACCEPT
iptables -A INPUT -p tcp --dport 22 -s 10.0.0.0/24 -j ACCEPT
iptables -A INPUT -p tcp --dport 443 -j ACCEPT`,
      annotations: {
        1: 'default deny: tutto ciò che non è esplicitamente permesso è bloccato',
        2: 'le risposte al nostro traffico passano, senza aprire nulla in più',
        3: 'il traffico interno alla macchina resta libero',
        4: 'SSH solo dalla rete di gestione, non da Internet',
        5: 'HTTPS pubblico: è il servizio che vogliamo esporre',
      },
      caption: 'Da notare cosa NON c’è: nessuna regola sul traffico in uscita. È la falla di configurazione più comune.',
    },
    {
      id: 'b-1',
      kind: 'prose',
      text: 'Quasi tutte le policy filtrano l’ingresso e lasciano l’uscita libera, perché filtrare l’uscita rompe le applicazioni e richiede lavoro. Un attaccante ci conta: esfiltrazione, comando e controllo, download degli strumenti — tutto viaggia in uscita, spesso su 443, dove si confonde con il traffico normale.',
    },
    {
      id: 'b-quiz',
      kind: 'quiz',
      question: 'Hai esecuzione di codice su un server dietro NAT, con firewall che blocca tutto in ingresso tranne 443. Quale approccio ti dà una shell?',
      options: [
        { id: 'a', text: 'Bind shell: il server apre una porta e tu ti connetti' },
        { id: 'b', text: 'Reverse shell: il server si connette verso di te, su una porta che il traffico in uscita permette' },
        { id: 'c', text: 'Nessuno dei due: il NAT rende impossibile ogni shell' },
        { id: 'd', text: 'Bind shell su porta 443, che è già aperta' },
      ],
      correct: ['b'],
      explanation:
        'Una bind shell richiede che tu apra una connessione *verso* il server, che è esattamente ciò che NAT e firewall impediscono — e la 443 in ingresso è già occupata dal servizio legittimo. La reverse shell sfrutta l’asimmetria: parte dall’interno, dove non c’è filtro, e il NAT crea da sé la strada del ritorno.',
      skills: ['tcpip'],
    },
    {
      id: 'b-quiz-2',
      kind: 'quiz',
      question: 'Che differenza pratica fa, per un difensore, aggiungere il filtraggio del traffico in uscita?',
      options: [
        { id: 'a', text: 'Nessuna: l’attacco è già avvenuto' },
        { id: 'b', text: 'Rende molto più difficile portare fuori i dati e mantenere un canale di comando e controllo' },
        { id: 'c', text: 'Impedisce l’exploit iniziale' },
        { id: 'd', text: 'Sostituisce la necessità di aggiornare i sistemi' },
      ],
      correct: ['b'],
      explanation:
        'Non impedisce l’ingresso, ma spezza la fase successiva: senza canale in uscita l’attaccante non riceve la shell, non scarica strumenti e non esfiltra. È difesa in profondità — accettare che l’ingresso possa riuscire e rendere costoso tutto ciò che viene dopo.',
      skills: ['tcpip'],
    },
    {
      id: 'c-kp',
      kind: 'keypoints',
      title: 'Da portarsi via',
      points: [
        'Il NAT crea la riga di traduzione solo quando esci: da fuori, senza quella riga, non si entra.',
        'Stateful significa "ricorda le connessioni": le risposte passano senza regole larghe.',
        'Le policy filtrano l’ingresso e dimenticano l’uscita — e l’attaccante lavora in uscita.',
        'L’asimmetria della rete è il motivo per cui le reverse shell esistono.',
      ],
    },
  ],
  exercises: [],
  recap: [
    'NAT riscrive sorgente e porta, e tiene una tabella creata dal traffico in uscita.',
    'Firewall stateful: le risposte passano perché la connessione è già stata approvata.',
    'Uscire è quasi sempre permesso: da lì passano C2 ed esfiltrazione.',
  ],
  furtherReading: [
    { title: 'RFC 3022 — Traditional IP Network Address Translator', url: 'https://www.rfc-editor.org/rfc/rfc3022' },
  ],
};
