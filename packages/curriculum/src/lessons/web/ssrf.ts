import type { Lesson } from '@cyberlab/core';

/**
 * SSRF — trasformare il server in un client che obbedisce all'attaccante.
 *
 * La lezione si appoggia esplicitamente a `found.ports-sockets`: la SSRF ha
 * senso solo se il learner sa che dietro un IP ci sono porte, che 127.0.0.1 è
 * un altro insieme di servizi rispetto all'IP pubblico, e che una rete interna
 * espone cose che da fuori non si vedono. È il vero ponte fra il livello Web e
 * il livello Recon: la SSRF è recon fatta con le mani del server.
 */
export const ssrfLesson: Lesson = {
  id: 'web.ssrf',
  moduleId: 'mod.web-advanced',
  title: 'SSRF',
  subtitle: 'Il server fa le richieste che decidi tu',
  status: 'theory-only',
  difficulty: 'advanced',
  skills: ['ssrf', 'http'],
  estimatedMinutes: 35,
  prerequisites: ['found.ports-sockets', 'web.command-injection'],
  objectives: [
    'Spiegare perché una richiesta partita dal server supera confini che al tuo browser sono chiusi.',
    'Individuare i punti in cui un’applicazione recupera un URL fornito dall’utente.',
    'Puntare a servizi su loopback, alla rete interna e ai metadata cloud.',
    'Capire perché le blocklist di SSRF falliscono e cosa mette una allow-list al loro posto.',
  ],
  theory: [
    { id: 'a-h', kind: 'heading', level: 2, eyebrow: 'SECTION A · IL CAMBIO DI POSIZIONE', text: 'Chi fa la richiesta cambia tutto' },
    {
      id: 'a-1',
      kind: 'prose',
      text: 'Molte applicazioni, a un certo punto, recuperano un URL per conto tuo: l’anteprima di un link che incolli, un webhook che chiami, un’immagine indicata tramite indirizzo, un importatore che "prende i dati da questa API". In tutti questi casi **è il server a fare la richiesta HTTP**, non il tuo browser. La SSRF nasce quando riesci a scegliere tu quella destinazione.',
    },
    {
      id: 'a-2',
      kind: 'prose',
      text: 'Perché è grave lo sai già dal livello Foundations: nella lezione su porte e socket hai visto che dietro un IP c’è un insieme di servizi in ascolto, e che `127.0.0.1` — il loopback — è la rete privata del server, spesso popolata di servizi che non hanno autenticazione perché "tanto sono raggiungibili solo da localhost". Il server, però, *è* localhost. Se lo convinci a chiamare quei servizi, parli con loro dalla posizione più fidata che esista.',
    },
    {
      id: 'a-flow',
      kind: 'flow',
      title: 'La stessa richiesta, due posizioni nella rete',
      nodes: [
        { id: 'you', label: 'Tu', sublabel: 'da Internet', col: 0, row: 0, tone: 'default', tooltip: 'Il firewall ti lascia raggiungere solo la porta pubblica.' },
        { id: 'fw', label: 'Firewall', sublabel: 'blocca l’interno', col: 1, row: 0, tone: 'danger' },
        { id: 'app', label: 'App', sublabel: 'porta 443, pubblica', col: 2, row: 1, tone: 'accent', tooltip: 'È lei a fare la richiesta che le chiedi.' },
        { id: 'meta', label: 'Metadata', sublabel: '169.254.169.254', col: 3, row: 0, tone: 'danger', tooltip: 'Endpoint cloud: credenziali temporanee dell’istanza.' },
        { id: 'admin', label: 'Servizio interno', sublabel: '127.0.0.1:6379', col: 3, row: 2, tone: 'danger', tooltip: 'Redis/DB/admin senza autenticazione: si fida di localhost.' },
      ],
      edges: [
        { from: 'you', to: 'fw' },
        { from: 'fw', to: 'app', label: 'solo 443', tone: 'success' },
        { from: 'you', to: 'meta', label: 'bloccato', tone: 'danger', dashed: true },
        { from: 'app', to: 'meta', label: 'consentito!', tone: 'danger' },
        { from: 'app', to: 'admin', label: 'consentito!', tone: 'danger' },
      ],
      steps: [
        { label: '1 · A te l’interno è chiuso', highlight: ['you', 'fw'] },
        { label: '2 · Ma l’app è già dentro il perimetro', highlight: ['app'] },
        { label: '3 · Le chiedi tu dove andare', highlight: ['app', 'meta', 'admin'] },
      ],
    },
    {
      id: 'a-code',
      kind: 'code',
      language: 'python',
      filename: 'anteprima.py — vulnerabile',
      code: `@app.post("/anteprima")
def anteprima():
    url = request.form["url"]        # controllato dall'utente
    r = requests.get(url, timeout=3) # il SERVER va a prenderlo
    return {"titolo": estrai_titolo(r.text)}`,
      highlight: [3, 4],
      annotations: {
        3: 'nessun controllo su dove punta l’URL',
        4: 'la richiesta parte dalla rete del server, non dalla tua',
      },
      caption: 'url=http://127.0.0.1:6379/ o url=http://169.254.169.254/… e l’anteprima ti riporta ciò che vede il server.',
    },

    { id: 'b-h', kind: 'heading', level: 2, eyebrow: 'SECTION B · I BERSAGLI', text: 'Dove punta una SSRF' },
    {
      id: 'b-table',
      kind: 'table',
      columns: ['Destinazione', 'Esempio di URL', 'Cosa ottieni'],
      rows: [
        ['Loopback', 'http://127.0.0.1:6379/', 'Servizi che si fidano di localhost: Redis, DB, pannelli admin senza login'],
        ['Rete interna', 'http://10.0.0.5/', 'Host che dal perimetro esterno non esistono nemmeno'],
        ['Metadata cloud', 'http://169.254.169.254/latest/meta-data/', 'Credenziali temporanee dell’istanza: spesso la scalata al cloud intero'],
        ['Scansione di porte', 'http://127.0.0.1:22 vs :9999', 'Tempi di risposta ed errori diversi rivelano quali porte sono aperte'],
        ['Altri schemi', 'file:///etc/passwd, gopher://…', 'Lettura di file locali o pacchetti grezzi verso servizi non-HTTP'],
      ],
      caption: 'Il loopback e i metadata cloud sono i due che trasformano una SSRF in un incidente serio.',
    },
    {
      id: 'b-1',
      kind: 'prose',
      text: 'Riconosci la scansione di porte della quarta riga? È la stessa idea del livello Recon, ma condotta dall’interno: la SSRF ti dà una posizione da cui enumerare la rete privata del bersaglio. Anche quando non leggi la risposta, la **differenza fra risposte** — un errore immediato di "connessione rifiutata" contro un timeout di tre secondi — ti dice quali porte sono aperte. È SSRF cieca, e funziona come la command injection cieca che hai già visto: il canale non è l’output, è il comportamento.',
    },
    {
      id: 'b-callout',
      kind: 'callout',
      variant: 'danger',
      title: 'L’endpoint dei metadata cloud',
      text: 'Su molte piattaforme cloud, `http://169.254.169.254/` risponde solo a chi è *dentro* l’istanza e restituisce configurazione e, sulle versioni più vecchie del servizio, le credenziali temporanee del ruolo assegnato alla macchina. Una SSRF che raggiunge quell’indirizzo si trasforma spesso da "il server fa una richiesta per me" a "ho le chiavi dell’account cloud". È il motivo per cui la SSRF, un tempo trascurata, è oggi in cima alle classifiche di rischio.',
    },
    {
      id: 'b-legal',
      kind: 'callout',
      variant: 'legal',
      title: 'Scope: una SSRF ti porta oltre il bersaglio',
      text: 'La SSRF, per sua natura, fa partire richieste verso altri sistemi — la rete interna del committente, un provider cloud, host di terzi. Anche in un test autorizzato, il perimetro di quelle richieste va concordato prima: raggiungere l’endpoint dei metadata è dimostrativo, usarlo per muoverti nella rete cloud può eccedere lo scope. Qui lavori in un laboratorio dove i "servizi interni" sono simulati apposta.',
    },

    { id: 'c-h', kind: 'heading', level: 2, eyebrow: 'SECTION C · PERCHÉ I FILTRI CADONO', text: 'La blocklist che non ce la fa' },
    {
      id: 'c-1',
      kind: 'prose',
      text: 'La reazione istintiva è: "blocco `127.0.0.1` e `localhost`". Non basta, e il motivo è che un indirizzo IP ha un numero imbarazzante di scritture equivalenti — più tutto ciò che accade *dopo* il controllo.',
    },
    {
      id: 'c-timeline',
      kind: 'timeline',
      entries: [
        { title: 'Rappresentazioni alternative', text: 'Lo stesso loopback è 127.0.0.1, ma anche 127.1, 2130706433 (decimale), 0x7f.0.0.1, o [::1] in IPv6. Una blocklist testuale le manca quasi tutte.', tone: 'danger' },
        { title: 'Reindirizzamenti', text: 'L’URL fornito punta a un host innocuo che risponde 302 verso 127.0.0.1. Se il client del server segue i redirect, il controllo iniziale non conta più.', tone: 'danger' },
        { title: 'DNS che cambia (rebinding)', text: 'Un dominio controllato dall’attaccante risolve a un IP pubblico durante il controllo e a 127.0.0.1 al momento della richiesta: c’è una finestra fra la validazione e la connessione.', tone: 'danger' },
        { title: 'Schemi imprevisti', text: 'Anche bloccando gli IP interni, file:// e gopher:// aprono strade che l’http non aveva.', tone: 'danger' },
      ],
    },
    {
      id: 'c-quiz',
      kind: 'quiz',
      question: 'Un’app blocca gli URL che contengono `127.0.0.1` o `localhost`. Qual è il modo più solido di aggirarla per raggiungere il loopback?',
      options: [
        { id: 'a', text: 'Non è possibile: quei due valori coprono il loopback' },
        { id: 'b', text: 'Usare una rappresentazione equivalente come `http://127.1/` o `http://2130706433/`, oppure un host che reindirizza verso il loopback' },
        { id: 'c', text: 'Aggiungere `https://` davanti' },
        { id: 'd', text: 'Mandare la richiesta due volte' },
      ],
      correct: ['b'],
      explanation:
        'Il filtro confronta stringhe, ma il loopback ha molte scritture (`127.1`, il decimale `2130706433`, `0x7f000001`, `[::1]`) e nessuna contiene il testo "127.0.0.1". In più un redirect o un DNS rebinding spostano il bersaglio *dopo* il controllo. È la stessa lezione della command injection: una blocklist enumera i cattivi noti e ne dimentica sempre uno. La difesa deve ragionare sull’IP finale, non sulla stringa iniziale.',
      skills: ['ssrf'],
    },

    { id: 'd-h', kind: 'heading', level: 2, eyebrow: 'SECTION D · DIFESA', text: 'Dire di sì a pochi, non di no a molti' },
    {
      id: 'd-compare',
      kind: 'comparison',
      left: {
        label: 'Fragile: blocklist di ciò che è "interno"',
        tone: 'bad',
        language: 'python',
        code: `vietati = ["127.0.0.1", "localhost", "169.254"]
if any(v in url for v in vietati):
    raise ValueError("bloccato")
requests.get(url)  # e i redirect?`,
        note: 'Confronta testo, non indirizzi; ignora le codifiche alternative, i redirect e il DNS rebinding.',
      },
      right: {
        label: 'Corretto: allow-list + risoluzione controllata',
        tone: 'good',
        language: 'python',
        code: `host = urlparse(url).hostname
if host not in DOMINI_AMMESSI:
    raise ValueError("dominio non consentito")
ip = risolvi(host)
if is_privato(ip):            # loopback/link-local/RFC1918
    raise ValueError("ip interno")
# connetti a QUELL'ip, niente redirect`,
        note: 'Si decide in positivo cosa è raggiungibile, si risolve una volta e ci si connette a quell’IP verificato, senza seguire redirect.',
      },
    },
    {
      id: 'd-kp',
      kind: 'keypoints',
      title: 'Le difese che reggono',
      points: [
        'Allow-list di domini/IP ammessi: enumerare i pochi consentiti invece dei molti vietati.',
        'Risolvere il nome, verificare che l’IP non sia privato/loopback/link-local, e connettersi a quell’IP.',
        'Non seguire i redirect, o rivalidare la destinazione a ogni salto.',
        'Consentire solo http/https; bloccare file, gopher, ftp e gli altri schemi.',
        'Segmentare la rete e togliere le credenziali dai metadata (IMDSv2): difesa in profondità, per quando il resto fallisce.',
      ],
    },
    {
      id: 'd-quiz',
      kind: 'quiz',
      question: 'Perché "risolvi il nome, controlla che l’IP non sia privato, poi connettiti a quell’IP senza seguire redirect" batte una blocklist?',
      options: [
        { id: 'a', text: 'Perché è più veloce' },
        { id: 'b', text: 'Perché decide sull’IP reale a cui ci si connette, chiudendo codifiche alternative, redirect e la finestra del DNS rebinding' },
        { id: 'c', text: 'Perché blocca anche l’XSS' },
        { id: 'd', text: 'Perché usa HTTPS' },
      ],
      correct: ['b'],
      explanation:
        'Tutti i bypass — rappresentazioni numeriche, redirect, rebinding — funzionano perché il controllo guarda una cosa (la stringa iniziale) e la connessione ne usa un’altra (l’IP finale). Validare l’IP effettivo e connettersi proprio a quello, senza redirect, elimina lo scarto fra ciò che controlli e ciò che raggiungi. È il principio dell’allow-list applicato al punto giusto della catena.',
      skills: ['ssrf'],
    },
    {
      id: 'e-bridge',
      kind: 'callout',
      variant: 'tip',
      title: 'Dove porta',
      text: 'La SSRF è recon condotta con le mani del server: enumeri porte e host della rete interna dalla posizione più fidata. È letteralmente il ponte verso il livello Recon & Enumeration, dove imparerai a fare la stessa mappatura come disciplina a sé. E l’endpoint dei metadata è il primo assaggio del livello Cloud/Red Team: una richiesta, e hai delle credenziali.',
    },
  ],
  recap: [
    'La SSRF fa partire richieste dal server: destinazioni chiuse a te gli sono aperte.',
    'Loopback, rete interna e metadata cloud sono i bersagli che contano.',
    'Le blocklist cadono per codifiche alternative, redirect e DNS rebinding.',
    'La difesa è un’allow-list che valida l’IP finale e non segue i redirect.',
  ],
  furtherReading: [
    { title: 'OWASP SSRF Prevention Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html' },
    { title: 'PortSwigger: SSRF', url: 'https://portswigger.net/web-security/ssrf' },
    { title: 'AWS: usa IMDSv2', url: 'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/configuring-instance-metadata-service.html', note: 'La mitigazione lato cloud dell’endpoint dei metadata.' },
  ],
  exercises: [],
};
