import type { Lesson } from '@cyberlab/core';

/**
 * DNS, taught as reconnaissance rather than as a lookup table.
 *
 * Almost every engagement starts here, so the lesson is built around the two
 * questions an attacker actually asks — "what else does this organisation own?"
 * and "what does the naming tell me about the infrastructure?" — with the
 * protocol mechanics arriving as the reason those questions have answers.
 */
export const dnsLesson: Lesson = {
  id: 'found.dns',
  moduleId: 'mod.net-foundations',
  title: 'DNS',
  subtitle: 'La rubrica di Internet, e perché rivela così tanto',
  status: 'theory-only',
  difficulty: 'beginner',
  estimatedMinutes: 25,
  skills: ['dns', 'tcpip'],
  prerequisites: ['found.tcp-ip'],
  objectives: [
    'Seguire una risoluzione ricorsiva dal resolver ai server autoritativi.',
    'Riconoscere i tipi di record principali e cosa raccontano di un’organizzazione.',
    'Spiegare cos’è il TTL e perché conta durante un attacco e durante una migrazione.',
    'Usare il DNS come prima superficie di ricognizione passiva.',
  ],
  theory: [
    { id: 'a-h', kind: 'heading', level: 2, eyebrow: 'SECTION A · RISOLUZIONE', text: 'Nessuno conosce tutta la rubrica' },
    {
      id: 'a-1',
      kind: 'prose',
      text: 'Non esiste una macchina che sappia dove sta ogni dominio del mondo. Il DNS è una **gerarchia**: si legge il nome da destra a sinistra e a ogni passo si chiede a chi sa una cosa sola, cioè chi sapere la prossima. `www.esempio.it` si legge: radice → `it` → `esempio.it` → `www`.',
    },
    {
      id: 'a-flow',
      kind: 'flow',
      title: 'Una risoluzione ricorsiva',
      nodes: [
        { id: 'app', label: 'Browser', col: 0, row: 1, tone: 'accent' },
        { id: 'res', label: 'Resolver', sublabel: 'ISP o 1.1.1.1', col: 1, row: 1, tone: 'default', tooltip: 'Fa il lavoro sporco e mette in cache. È anche chi vede tutte le tue query.' },
        { id: 'root', label: 'Root', sublabel: '“chiedi a .it”', col: 2, row: 0 },
        { id: 'tld', label: 'TLD .it', sublabel: '“chiedi a ns1.esempio.it”', col: 2, row: 1 },
        { id: 'auth', label: 'Autoritativo', sublabel: 'ha la risposta', col: 2, row: 2, tone: 'success' },
      ],
      edges: [
        { from: 'app', to: 'res', label: 'www.esempio.it?', tone: 'accent' },
        { from: 'res', to: 'root' },
        { from: 'res', to: 'tld' },
        { from: 'res', to: 'auth', tone: 'success' },
        { from: 'res', to: 'app', label: '93.184.216.34', tone: 'success', dashed: true },
      ],
      steps: [
        { label: '1 · Il client chiede una volta sola', highlight: ['app', 'res'] },
        { label: '2 · Il resolver scende la gerarchia', highlight: ['root', 'tld', 'auth'] },
        { label: '3 · Risposta e cache per TTL secondi', highlight: ['res', 'app'] },
      ],
    },
    {
      id: 'a-2',
      kind: 'prose',
      text: 'Il client fa una domanda **ricorsiva** ("dammi la risposta finale"), il resolver fa domande **iterative** ("dimmi il prossimo a cui chiedere"). Questa divisione del lavoro è il motivo per cui il tuo computer resta semplice e il resolver diventa un punto di osservazione privilegiato — e un bersaglio.',
    },
    {
      id: 'a-callout',
      kind: 'callout',
      variant: 'warning',
      title: 'Il DNS non è autenticato',
      text: 'Una risposta DNS classica non porta firma: chiunque riesca a rispondere prima del server legittimo, con l’ID di transazione giusto, viene creduto. Da qui il cache poisoning, gli attacchi in rete locale e le risposte manipolate su reti ostili. DNSSEC firma le risposte, ma la sua adozione è tutt’altro che universale.',
    },

    { id: 'b-h', kind: 'heading', level: 2, eyebrow: 'SECTION B · RECORD', text: 'Cosa si può leggere in una zona' },
    {
      id: 'b-table',
      kind: 'table',
      columns: ['Tipo', 'Contiene', 'Cosa ne ricava un attaccante'],
      rows: [
        ['A / AAAA', 'Indirizzo IPv4 / IPv6', 'Quali IP toccare, e in quale hosting o cloud vivono.'],
        ['CNAME', 'Alias verso un altro nome', 'Fornitori di terze parti. Un CNAME che punta a un servizio dismesso è un subdomain takeover.'],
        ['MX', 'Server di posta', 'Provider email → quale phishing è credibile, quali difese sono attive.'],
        ['TXT', 'Testo libero (SPF, DKIM, verifiche)', 'Una miniera: SPF elenca i mittenti autorizzati, le verifiche rivelano i SaaS usati.'],
        ['NS', 'Server autoritativi', 'Chi gestisce il DNS; a volte una zona secondaria dimenticata.'],
        ['SOA', 'Parametri della zona', 'Contatto amministrativo e ritmo degli aggiornamenti.'],
      ],
    },
    {
      id: 'b-code',
      kind: 'code',
      language: 'bash',
      filename: 'ricognizione passiva',
      code: `dig +short esempio.it A
dig +short esempio.it MX
dig +short esempio.it TXT
dig +short _dmarc.esempio.it TXT

# la zona intera, quando un server è mal configurato:
dig AXFR esempio.it @ns1.esempio.it`,
      annotations: {
        3: 'SPF e verifiche di dominio elencano i servizi esterni usati dall’organizzazione',
        6: 'un trasferimento di zona aperto consegna ogni nome interno in un colpo solo: raro, ma ancora vivo',
      },
      caption: 'Nessuno di questi comandi tocca i server dell’obiettivo: parlano con il DNS. È ricognizione passiva.',
    },
    {
      id: 'b-1',
      kind: 'prose',
      text: 'I nomi stessi sono informazione. `vpn.esempio.it`, `jenkins.esempio.it`, `staging-api.esempio.it`: ogni sottodominio è una dichiarazione su cosa esiste dentro l’organizzazione. Un ambiente di staging esposto è uno dei ritrovamenti più comuni e più fruttuosi, perché è la stessa applicazione con meno attenzione alla sicurezza.',
    },

    { id: 'c-h', kind: 'heading', level: 2, eyebrow: 'SECTION C · TTL E CACHE', text: 'Perché il DNS "resta indietro"' },
    {
      id: 'c-1',
      kind: 'prose',
      text: 'Ogni record ha un **TTL**: per quanti secondi chi lo riceve può tenerlo in cache. È un compromesso fra carico e reattività, e ha due conseguenze pratiche opposte. In difesa: se devi spostare un servizio sotto attacco, un TTL di 86400 significa un giorno di traffico che continua ad arrivare al vecchio indirizzo. In attacco: un TTL basso su un dominio sospetto suggerisce un’infrastruttura che si sposta spesso — tipico del malware.',
    },
    {
      id: 'c-timeline',
      kind: 'timeline',
      entries: [
        { title: 'T+0 — prima query', text: 'Il resolver scende la gerarchia e ottiene la risposta. Latenza alta, poche decine di ms.' },
        { title: 'T+0 … T+TTL', text: 'Ogni client servito dallo stesso resolver riceve la risposta dalla cache, senza uscire.', tone: 'success' },
        { title: 'T+TTL', text: 'Il record scade. La query successiva riparte dalla gerarchia e vede eventuali cambiamenti.' },
        { title: 'Durante un incidente', text: 'Un TTL alto rende lento ogni cambio di rotta: è un parametro di risposta agli incidenti, non un dettaglio.', tone: 'danger' },
      ],
    },
    {
      id: 'c-quiz',
      kind: 'quiz',
      question: 'Quale record ha più probabilità di rivelare quali servizi cloud usa un’azienda, senza toccarne i server?',
      options: [
        { id: 'a', text: 'A' },
        { id: 'b', text: 'TXT' },
        { id: 'c', text: 'SOA' },
        { id: 'd', text: 'PTR' },
      ],
      correct: ['b'],
      explanation:
        'I record TXT ospitano SPF (l’elenco dei mittenti email autorizzati) e i token di verifica del dominio che ogni SaaS chiede di pubblicare. Insieme disegnano la mappa dei fornitori dell’organizzazione — e ogni fornitore è una possibile via d’ingresso.',
      skills: ['dns'],
    },
    {
      id: 'c-quiz-2',
      kind: 'quiz',
      question: 'Un CNAME punta a `progetto-vecchio.hosting-x.net`, nome che non è più registrato presso quel provider. Perché è un problema?',
      options: [
        { id: 'a', text: 'Non lo è: un CNAME rotto dà solo errore' },
        { id: 'b', text: 'Chiunque può registrare quel nome sul provider e servire contenuti dal sottodominio della vittima' },
        { id: 'c', text: 'Il record rallenta la risoluzione degli altri nomi' },
        { id: 'd', text: 'Espone la chiave privata TLS del dominio' },
      ],
      correct: ['b'],
      explanation:
        'È un {{subdomain takeover:il dominio punta a un servizio esterno non più rivendicato, che un altro può reclamare}}. Il DNS della vittima continua a delegare fiducia a un nome che ora controlli tu: cookie di sessione con dominio condiviso, phishing credibilissimo, bypass di alcune whitelist. La correzione è banale — rimuovere il record — ma prima bisogna accorgersene.',
      skills: ['dns'],
    },
    {
      id: 'd-kp',
      kind: 'keypoints',
      title: 'Da portarsi via',
      points: [
        'Il DNS è gerarchico: si risolve da destra a sinistra, un delegato alla volta.',
        'Il resolver fa il lavoro e la cache; il TTL decide per quanto la risposta resta valida.',
        'I record raccontano l’organizzazione: TXT e CNAME più di tutti.',
        'Le query DNS non toccano i server dell’obiettivo: sono ricognizione passiva.',
      ],
    },
  ],
  exercises: [],
  recap: [
    'Risoluzione gerarchica: radice → TLD → autoritativo, con il resolver a fare da intermediario.',
    'A/AAAA, CNAME, MX, TXT, NS, SOA — ognuno racconta qualcosa di diverso.',
    'Il TTL governa la cache, e quindi la velocità con cui puoi cambiare rotta.',
    'Un CNAME verso un servizio non più rivendicato è un subdomain takeover.',
  ],
  furtherReading: [
    { title: 'Cloudflare: What is DNS?', url: 'https://www.cloudflare.com/learning/dns/what-is-dns/' },
    { title: 'OWASP: Subdomain takeover', url: 'https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/02-Configuration_and_Deployment_Management_Testing/10-Test_for_Subdomain_Takeover' },
  ],
};
