import type { Lesson } from '@cyberlab/core';

/**
 * Level 0, lesson 1.
 *
 * The first lesson of the whole curriculum, and the one that sets the contract:
 * we do not describe the OSI model as seven words to memorise, we follow one
 * packet from a keystroke to a datacentre and back, and every later lesson
 * refers to a step on that path. Recon is "which of these hops answers me";
 * injection is "what the last hop does with what I sent". The journey is the
 * spine.
 */
export const howInternetWorksLesson: Lesson = {
  id: 'found.how-internet-works',
  moduleId: 'mod.net-foundations',
  title: 'Come funziona Internet',
  subtitle: 'Il viaggio di un pacchetto, dal tuo tasto Invio al datacenter',
  status: 'theory-only',
  difficulty: 'beginner',
  estimatedMinutes: 25,
  skills: ['tcpip'],
  prerequisites: [],
  objectives: [
    'Seguire una richiesta HTTP dal browser al server e ritorno, passo per passo.',
    'Spiegare cosa fa ogni strato (link, rete, trasporto, applicazione) e perché esistono.',
    'Distinguere indirizzo IP, porta e nome di dominio senza confonderli.',
    'Capire perché ogni intermediario del percorso è una superficie di attacco.',
  ],
  theory: [
    { id: 'a-h', kind: 'heading', level: 2, eyebrow: 'SECTION A · IL VIAGGIO', text: 'Nessuno "va" da nessuna parte' },
    {
      id: 'a-1',
      kind: 'prose',
      text: 'Quando scrivi `esempio.it` e premi Invio, non succede niente di magico e soprattutto non succede *una* cosa: succede una sequenza di passaggi, ognuno gestito da una macchina diversa, ognuno con regole proprie. Capire quella sequenza è la differenza fra "il sito non va" e "il DNS risolve ma la porta 443 non risponde".',
    },
    {
      id: 'a-2',
      kind: 'prose',
      text: 'Il tuo computer non spedisce una pagina web. Spedisce **pacchetti**: piccoli blocchi di byte, ciascuno con un’etichetta che dice da dove viene e dove va. Ogni router lungo la strada legge solo l’etichetta, decide il prossimo salto e se ne dimentica. Nessuno conosce l’intero percorso — è la stessa idea della posta, non della telefonata.',
    },
    {
      id: 'a-flow',
      kind: 'flow',
      title: 'Da Invio alla risposta',
      nodes: [
        { id: 'you', label: 'Browser', sublabel: 'esempio.it', col: 0, row: 1, tone: 'accent', tooltip: 'Costruisce una richiesta HTTP. Non sa ancora dove sia il server.' },
        { id: 'dns', label: 'DNS', sublabel: 'nome → 93.184.x.x', col: 1, row: 0, tone: 'default', tooltip: 'Traduce il nome in un indirizzo IP. Prima domanda, prima superficie di ricognizione.' },
        { id: 'router', label: 'Router di casa', sublabel: 'NAT', col: 1, row: 2, tone: 'default', tooltip: 'Riscrive il tuo indirizzo privato in quello pubblico e tiene una tabella per le risposte.' },
        { id: 'isp', label: 'Rete dell’ISP', sublabel: 'molti salti', col: 2, row: 2, tone: 'muted' },
        { id: 'fw', label: 'Firewall', sublabel: 'filtra', col: 3, row: 2, tone: 'danger', tooltip: 'Decide quali porte sono raggiungibili dall’esterno.' },
        { id: 'srv', label: 'Server', sublabel: ':443', col: 4, row: 2, tone: 'success', tooltip: 'Ascolta su una porta e risponde. È qui che vivono quasi tutte le vulnerabilità web.' },
      ],
      edges: [
        { from: 'you', to: 'dns', label: 'dov’è esempio.it?', tone: 'accent' },
        { from: 'dns', to: 'you', label: '93.184.x.x', dashed: true },
        { from: 'you', to: 'router' },
        { from: 'router', to: 'isp' },
        { from: 'isp', to: 'fw' },
        { from: 'fw', to: 'srv', tone: 'success' },
      ],
      steps: [
        { label: '1 · Risoluzione del nome', highlight: ['you', 'dns'] },
        { label: '2 · Uscita dalla rete locale', highlight: ['router', 'isp'] },
        { label: '3 · Ingresso nella rete del server', highlight: ['fw', 'srv'] },
      ],
    },
    {
      id: 'a-3',
      kind: 'callout',
      variant: 'info',
      title: 'Il punto che conta per la sicurezza',
      text: 'Ogni riquadro del diagramma è una macchina che *legge* i tuoi dati e decide qualcosa. Il DNS può mentirti, il router può essere manomesso, il firewall può avere una regola troppo larga, il server può fidarsi di un input che non dovrebbe. Un attacco è sempre "convincere uno di questi a fare qualcosa che non doveva".',
    },

    { id: 'b-h', kind: 'heading', level: 2, eyebrow: 'SECTION B · GLI STRATI', text: 'Perché esistono gli strati' },
    {
      id: 'b-1',
      kind: 'prose',
      text: 'Nessuno ha progettato Internet come un unico programma. È stato progettato a **strati**, ognuno dei quali risolve un problema e nasconde il precedente. Il vantaggio pratico: puoi cambiare il Wi-Fi con la fibra senza riscrivere il browser, e puoi scrivere un browser senza sapere nulla di cavi.',
    },
    {
      id: 'b-table',
      kind: 'table',
      columns: ['Strato', 'Domanda a cui risponde', 'Unità', 'Esempi', 'Dove si attacca'],
      rows: [
        ['Applicazione', 'Cosa sto chiedendo?', 'messaggio', 'HTTP, DNS, SSH', 'Injection, XSS, logica'],
        ['Trasporto', 'A quale programma sulla macchina?', 'segmento', 'TCP, UDP', 'Scanning, hijacking'],
        ['Rete', 'A quale macchina, e per che strada?', 'pacchetto', 'IP, ICMP', 'Spoofing, routing'],
        ['Link', 'Come attraverso *questo* cavo?', 'frame', 'Ethernet, Wi-Fi', 'ARP spoofing, sniffing'],
      ],
      caption: 'Quattro strati, quattro domande. Il modello OSI ne ha sette, ma nella pratica quotidiana si ragiona così.',
    },
    {
      id: 'b-2',
      kind: 'prose',
      text: 'Ogni strato **incapsula** quello sopra: aggiunge la propria intestazione davanti ai dati che riceve, come una busta dentro una busta. Il server apre le buste in ordine inverso. Quando in un lab guarderai un pacchetto, quello che vedi è esattamente questa cipolla.',
    },
    {
      id: 'b-code',
      kind: 'flow',
      title: 'Incapsulamento: lo stesso byte stream, quattro punti di vista',
      nodes: [
        { id: 'eth', label: 'Ethernet', sublabel: 'dove, sul cavo', col: 0, row: 0, tone: 'muted', tooltip: 'Header di livello 2 (indirizzi MAC). Conta solo per il prossimo salto sul cavo, poi viene scartato e riscritto.' },
        { id: 'ip', label: 'IP', sublabel: 'quale host', col: 1, row: 0, tone: 'accent', tooltip: 'Header di rete: indirizzo IP sorgente e destinazione. È la busta con l’indirizzo, che attraversa tutta Internet.' },
        { id: 'tcp', label: 'TCP', sublabel: 'quale porta', col: 2, row: 0, tone: 'default', tooltip: 'Header di trasporto: porta sorgente e destinazione. Sceglie quale programma, su quella macchina, riceve i dati.' },
        { id: 'http', label: 'HTTP', sublabel: 'cosa chiedo', col: 3, row: 0, tone: 'success', tooltip: 'Il payload applicativo: GET /login HTTP/1.1 … — la richiesta vera e propria, avvolta da tutti gli header precedenti.' },
      ],
      edges: [
        { from: 'eth', to: 'ip' },
        { from: 'ip', to: 'tcp' },
        { from: 'tcp', to: 'http' },
      ],
      steps: [
        { label: 'Arriva il frame: si legge l’header Ethernet — dice solo qual è il prossimo salto sul cavo.', highlight: ['eth'] },
        { label: 'Scartato Ethernet, l’header IP dice a quale host è diretto il pacchetto.', highlight: ['ip'] },
        { label: 'Scartato IP, l’header TCP dice a quale porta — cioè a quale programma — consegnarlo.', highlight: ['tcp'] },
        { label: 'Restano i dati: la richiesta HTTP vera e propria. Il server ha aperto tutte le buste, in ordine inverso.', highlight: ['http'] },
      ],
    },
    {
      id: 'b-3',
      kind: 'keypoints',
      title: 'Tre parole che non vanno confuse',
      points: [
        '**Nome di dominio** (`esempio.it`) — comodo per gli umani, non serve alle macchine. Il DNS lo traduce.',
        '**Indirizzo IP** (`93.184.216.34`) — identifica *una macchina* nella rete. È l’indirizzo sulla busta.',
        '**Porta** (`443`) — identifica *un programma* su quella macchina. È il nome del destinatario dentro il palazzo.',
      ],
    },
    {
      id: 'b-quiz-1',
      kind: 'quiz',
      question: 'Un server ha un solo indirizzo IP ma ospita un sito web, un server SSH e un database. Cosa permette di raggiungere il servizio giusto?',
      options: [
        { id: 'a', text: 'Il nome di dominio: ogni servizio ha il suo' },
        { id: 'b', text: 'La porta di destinazione nel segmento TCP' },
        { id: 'c', text: 'Il MAC address della scheda di rete' },
        { id: 'd', text: 'Il campo protocollo dell’intestazione IP' },
      ],
      correct: ['b'],
      explanation:
        'L’IP identifica la macchina, la porta identifica il programma in ascolto su quella macchina. È esattamente il motivo per cui una scansione delle porte è il primo passo di ogni ricognizione: enumerare le porte aperte significa enumerare i servizi raggiungibili.',
      skills: ['tcpip'],
    },

    { id: 'c-h', kind: 'heading', level: 2, eyebrow: 'SECTION C · CLIENT E SERVER', text: 'Chi chiede e chi risponde' },
    {
      id: 'c-1',
      kind: 'prose',
      text: 'Il modello è asimmetrico e questa asimmetria è la fonte di metà dei bug di sicurezza: il **client** chiede, il **server** decide. Il client può chiedere qualunque cosa — anche cose che l’interfaccia non offre. Il server è l’unico posto dove una regola può essere davvero applicata.',
    },
    {
      id: 'c-seq',
      kind: 'sequence',
      actors: [
        { id: 'b', label: 'Browser' },
        { id: 's', label: 'Server' },
      ],
      messages: [
        { from: 'b', to: 's', label: 'GET /login', detail: 'Chiede la pagina di accesso.' },
        { from: 's', to: 'b', label: '200 OK + HTML', tone: 'success', detail: 'Il form è solo HTML: il browser lo disegna, non lo fa rispettare.' },
        { from: 'b', to: 's', label: 'POST /login (user, password)', tone: 'accent' },
        { from: 's', to: 'b', label: '302 + Set-Cookie: session=…', tone: 'success', detail: 'Da qui in poi il cookie è la prova di chi sei.' },
        { from: 'b', to: 's', label: 'GET /profilo  (Cookie: session=…)' },
        { from: 's', to: 'b', label: '200 OK + i tuoi dati', tone: 'success', detail: 'Il server deve ricontrollare qui che quel cookie possa vedere *questi* dati. Quando non lo fa, è un broken access control.' },
      ],
    },
    {
      id: 'c-2',
      kind: 'callout',
      variant: 'warning',
      title: 'La regola d’oro',
      text: 'Tutto ciò che arriva dal client è **input dell’attaccante**: URL, parametri, header, cookie, campi nascosti, ordine delle richieste. Il browser è un suggerimento, non un vincolo. Nei laboratori userai un pannello che invia richieste a mano proprio per rendere ovvia questa verità.',
    },
    {
      id: 'c-quiz-2',
      kind: 'quiz',
      question: 'Un form ha `<input type="hidden" name="prezzo" value="100">`. Perché non ci si può fidare di quel valore?',
      options: [
        { id: 'a', text: 'Perché i campi hidden non vengono inviati' },
        { id: 'b', text: 'Perché il browser li cifra in modo debole' },
        { id: 'c', text: 'Perché la richiesta la costruisce il client, che può scrivere qualunque valore' },
        { id: 'd', text: 'Perché HTTP non supporta i numeri' },
      ],
      correct: ['c'],
      explanation:
        '"hidden" nasconde il campo all’utente, non all’attaccante: la richiesta HTTP può essere composta a mano con qualunque valore. Il prezzo deve essere ricalcolato dal server a partire dall’identificativo del prodotto. Questa è una vulnerabilità di logica di business, e la vedrai nel suo livello.',
      skills: ['tcpip'],
    },
    {
      id: 'd-kp',
      kind: 'keypoints',
      title: 'Da portarsi via',
      points: [
        'Una richiesta non "va" al server: attraversa una catena di macchine, ognuna con un ruolo e una superficie d’attacco.',
        'Gli strati esistono per nascondere complessità; l’attaccante lavora scegliendo *a quale strato* parlare.',
        'IP = quale macchina, porta = quale programma, dominio = comodità per gli umani.',
        'Il client chiede, il server decide. Ogni controllo che vive solo nel client non esiste.',
      ],
    },
  ],
  practice: [
    { id: 'p-h', kind: 'heading', level: 3, eyebrow: 'SECTION B · VERIFICA', text: 'Guarda una richiesta vera' },
    {
      id: 'p-exchange',
      kind: 'http-exchange',
      title: 'La richiesta più semplice possibile',
      request: {
        method: 'GET',
        path: '/',
        version: 'HTTP/1.1',
        headers: [
          { name: 'Host', value: 'esempio.it', explain: 'Quale sito vuoi, quando un solo IP ne ospita molti. Manipolarlo è la base di diversi attacchi.' },
          { name: 'User-Agent', value: 'Mozilla/5.0', explain: 'Chi dice di essere il client. È solo una stringa: si può scrivere qualsiasi cosa.' },
          { name: 'Accept', value: 'text/html', explain: 'Che formato preferisci ricevere.' },
        ],
      },
      response: {
        status: 200,
        statusText: 'OK',
        headers: [
          { name: 'Content-Type', value: 'text/html; charset=utf-8', explain: 'Come interpretare il corpo. Sbagliarlo apre la porta a XSS e a confusione di tipo.' },
          { name: 'Content-Length', value: '1256', explain: 'Quanti byte segue il corpo.' },
        ],
        body: '<!doctype html>\n<html>…</html>',
      },
      takeaway: 'Nessun campo qui è verificato dalla rete: sono tutte stringhe scritte dal client. Il server è l’unico che può controllarle.',
    },
  ],
  exercises: [],
  recap: [
    'Un pacchetto attraversa DNS, router, firewall e infine il server: ogni salto è una decisione.',
    'Gli strati incapsulano: link → rete → trasporto → applicazione.',
    'IP identifica la macchina, la porta il programma, il dominio è per gli umani.',
    'Ciò che arriva dal client non è mai un vincolo: solo il server può imporre regole.',
  ],
  furtherReading: [
    { title: 'How DNS works (Cloudflare)', url: 'https://www.cloudflare.com/learning/dns/what-is-dns/' },
    { title: 'MDN: Overview of HTTP', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview' },
  ],
};
