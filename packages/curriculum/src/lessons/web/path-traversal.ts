import type { Lesson } from '@cyberlab/core';

/**
 * Path Traversal — dove il livello Web tocca il filesystem.
 *
 * La lezione è deliberatamente appoggiata a `found.linux-permissions`: la
 * domanda "quali file riesci a leggere?" non ha risposta nell'HTTP, ce l'ha
 * nei bit di permesso e nell'utente con cui gira il processo web. Il
 * calcolatore di permessi torna qui con una domanda nuova — non più "chi può
 * leggere questo file", ma "cosa può leggere www-data se gli fai chiedere
 * qualunque percorso".
 */
export const pathTraversalLesson: Lesson = {
  id: 'web.path-traversal',
  moduleId: 'mod.web-advanced',
  title: 'Path Traversal',
  subtitle: 'Uscire dalla cartella in cui l’applicazione voleva tenerti',
  status: 'ready',
  difficulty: 'intermediate',
  skills: ['path-traversal', 'permissions', 'http'],
  estimatedMinutes: 30,
  prerequisites: ['found.linux-permissions', 'web.ssrf'],
  labSpecId: 'lab.helpdesk',
  objectives: [
    'Riconoscere gli endpoint che costruiscono un percorso di file da input utente.',
    'Uscire da una directory prevista con `../` e le sue varianti codificate.',
    'Prevedere quali file sono davvero leggibili, ragionando su utente e permessi.',
    'Correggere con canonicalizzazione e verifica del prefisso, non con una sostituzione.',
  ],
  theory: [
    { id: 'a-h', kind: 'heading', level: 2, eyebrow: 'SECTION A · IL DIFETTO', text: 'Un percorso costruito con dati altrui' },
    {
      id: 'a-1',
      kind: 'prose',
      text: 'Uno schema ricorrente: l’applicazione tiene dei file in una cartella e ne serve uno su richiesta. Le fatture in `/var/www/fatture/`, i template in `/opt/app/lingue/`, gli allegati in `/srv/upload/`. Il nome del file arriva dal client, e l’applicazione lo incolla dopo il percorso della cartella. Se non controlla cosa contiene quel nome, tu puoi risalire l’albero delle directory e chiedere qualcos’altro.',
    },
    {
      id: 'a-code',
      kind: 'code',
      language: 'python',
      filename: 'download.py — vulnerabile',
      code: `@app.get("/fattura")
def fattura():
    nome = request.args["file"]          # "2024-03.pdf"
    percorso = "/var/www/fatture/" + nome
    return send_file(percorso)`,
      highlight: [4],
      annotations: {
        3: 'il client decide questa stringa per intero',
        4: 'concatenazione: "../" non è un carattere speciale, è una richiesta al filesystem di salire',
      },
      caption: 'Ancora una volta: dato non fidato che entra in qualcosa di interpretato — qui, un percorso.',
    },
    {
      id: 'a-flow',
      kind: 'flow',
      title: 'Come `../` cambia la destinazione',
      nodes: [
        { id: 'req', label: 'Richiesta', sublabel: 'file=../../../etc/passwd', col: 0, row: 1, tone: 'default' },
        { id: 'join', label: 'Concatenazione', sublabel: '/var/www/fatture/ + …', col: 1, row: 1, tone: 'danger' },
        { id: 'norm', label: 'Il sistema normalizza', sublabel: '→ /etc/passwd', col: 2, row: 1, tone: 'danger', tooltip: 'Il kernel risolve i ../ prima di aprire: il percorso finale non è quello che l’app credeva.' },
        { id: 'read', label: 'Lettura', sublabel: 'se i permessi lo consentono', col: 3, row: 1, tone: 'accent', tooltip: 'Qui decidono i bit di permesso, non l’HTTP.' },
      ],
      edges: [
        { from: 'req', to: 'join' },
        { from: 'join', to: 'norm', tone: 'danger' },
        { from: 'norm', to: 'read', tone: 'danger' },
      ],
      steps: [
        { label: '1 · Il nome file contiene una risalita', highlight: ['req'] },
        { label: '2 · La stringa viene normalizzata dal sistema', highlight: ['join', 'norm'] },
        { label: '3 · L’ultima parola spetta ai permessi', highlight: ['read'] },
      ],
    },
    {
      id: 'a-table',
      kind: 'table',
      columns: ['Payload', 'Perché esiste', 'Cosa aggira'],
      rows: [
        ['../../../etc/passwd', 'La forma base', 'Nessun controllo'],
        ['....//....//etc/passwd', 'Rimuovendo "../" da "....//" resta "../"', 'Un filtro che sostituisce una volta sola'],
        ['%2e%2e%2f', 'URL-encoding di "../"', 'Un controllo eseguito prima della decodifica'],
        ['%252e%252e%252f', 'Doppia codifica', 'Un sistema che decodifica due volte lungo la catena'],
        ['/etc/passwd', 'Percorso assoluto', 'Codice che fa join e non concatenazione'],
        ['../../../etc/passwd%00.pdf', 'Byte nullo (linguaggi datati)', 'Un controllo sull’estensione finale'],
      ],
      caption: 'Le varianti non sono trucchi da collezionare: ognuna corrisponde a un filtro fatto nel punto sbagliato.',
    },
    {
      id: 'a-legal',
      kind: 'callout',
      variant: 'legal',
      title: 'Scope: leggere file è già accesso abusivo',
      text: 'Un path traversal non "guarda e basta": estrae dati da un sistema altrui, e la legge non distingue fra lettura e scrittura. In un test autorizzato la prova è un file innocuo e non sensibile che dimostri la risalita — non lo scaricamento di configurazioni con credenziali, e mai il file delle chiavi private. Qui operi su un laboratorio isolato.',
    },

    { id: 'b-h', kind: 'heading', level: 2, eyebrow: 'SECTION B · CHI SEI SUL SISTEMA', text: 'Il traversal ti porta ovunque. I permessi decidono cosa vedi.' },
    {
      id: 'b-1',
      kind: 'prose',
      text: 'Qui il livello Web incontra ciò che hai imparato in Foundations. La risalita ti fa **chiedere** qualunque percorso, ma la lettura riesce solo se l’utente con cui gira il processo web ha il permesso. Quasi sempre quell’utente è `www-data` — un utente ordinario, non root. Ecco perché `/etc/passwd` si legge quasi sempre (è leggibile da tutti, e infatti non contiene password) mentre `/etc/shadow` quasi mai (modo `640`, proprietario `root`).',
    },
    {
      id: 'b-bits',
      kind: 'permission-bits',
      path: '/var/www/app/.env',
      initialMode: 0o644,
      owner: 'deploy',
      group: 'www-data',
      actors: [
        { id: 'www', label: 'www-data (il processo web)', user: 'www-data', groups: ['www-data'] },
        { id: 'deploy', label: 'deploy (proprietario)', user: 'deploy', groups: ['deploy', 'www-data'] },
        { id: 'other', label: 'ospite (nessuna relazione)', user: 'ospite', groups: ['ospite'] },
      ],
      tutorNote: 'Il file di configurazione con le credenziali del database. Con 644 www-data lo legge; prova 640 e poi 600 e osserva quando smette.',
    },
    {
      id: 'b-2',
      kind: 'prose',
      text: 'Prova a portare quel `.env` da `644` a `600`: la riga di `www-data` smette di poterlo leggere, e il path traversal — pur funzionando ancora — non restituisce più nulla di utile. È difesa in profondità nella sua forma più concreta: la vulnerabilità resta, l’impatto crolla. Vale la pena farlo comunque, perché quel file contiene di solito la password del database, cioè il pezzo che trasforma una lettura di file in una compromissione completa.',
    },
    {
      id: 'b-targets',
      kind: 'table',
      columns: ['Bersaglio', 'Tipicamente leggibile da www-data?', 'Cosa ci trovi'],
      rows: [
        ['/etc/passwd', 'Sì (644)', 'Elenco utenti e shell: utile per capire il sistema, nessuna password'],
        ['/etc/shadow', 'No (640, root)', 'Gli hash. È il motivo per cui sono stati separati da passwd'],
        ['.env / config.php', 'Spesso sì', 'Credenziali del database, chiavi API: il vero premio'],
        ['/proc/self/environ', 'Sì', 'Variabili d’ambiente del processo web, segreti compresi'],
        ['Codice sorgente dell’app', 'Sì', 'Altre vulnerabilità, lette con calma invece che a tentoni'],
      ],
    },
    {
      id: 'b-quiz',
      kind: 'quiz',
      question: 'Con un path traversal riesci a leggere `/etc/passwd` ma non `/etc/shadow`. Cosa concludi?',
      options: [
        { id: 'a', text: 'Che il traversal funziona solo su alcune cartelle' },
        { id: 'b', text: 'Che il processo web gira come utente non privilegiato: passwd è 644, shadow è 640 e appartiene a root' },
        { id: 'c', text: 'Che il server ha rilevato l’attacco e lo sta bloccando' },
        { id: 'd', text: 'Che shadow non esiste su quel sistema' },
      ],
      correct: ['b'],
      explanation:
        'Il traversal non ha confini di cartella: chiede qualunque percorso. Il limite è quello studiato in Permessi Linux — la lettura riesce solo se i bit la concedono all’utente del processo, tipicamente `www-data`. Ed è un’informazione utile, non una sconfitta: hai appena confermato di non girare come root, il che sposta il passo successivo sui file leggibili da tutti o di proprietà di www-data — `.env`, il codice sorgente, `/proc/self/environ`. È anche la ragione per cui gli hash furono spostati da passwd a shadow.',
      skills: ['path-traversal', 'permissions'],
    },

    { id: 'c-h', kind: 'heading', level: 2, eyebrow: 'SECTION C · DIFESA', text: 'Risolvi il percorso, poi guarda dov’è finito' },
    {
      id: 'c-compare',
      kind: 'comparison',
      left: {
        label: 'Fragile: togliere i "../"',
        tone: 'bad',
        language: 'python',
        code: `nome = nome.replace("../", "")
percorso = BASE + nome

# "....//" diventa "../"
# %2e%2e%2f non viene nemmeno visto`,
        note: 'Una sostituzione singola può *creare* la sequenza che stava rimuovendo, e non vede nulla di codificato.',
      },
      right: {
        label: 'Corretto: canonicalizza e verifica il prefisso',
        tone: 'good',
        language: 'python',
        code: `base = Path("/var/www/fatture").resolve()
finale = (base / nome).resolve()

# Il controllo avviene sul percorso REALE,
# dopo che ../ e symlink sono stati risolti.
if not finale.is_relative_to(base):
    abort(403)`,
        note: 'Si decide sul percorso finale davvero risolto, non sulla stringa in arrivo: le varianti codificate diventano irrilevanti.',
      },
    },
    {
      id: 'c-1',
      kind: 'prose',
      text: 'È lo stesso principio che ha chiuso la SSRF nella lezione precedente. Là il difetto era controllare la *stringa* dell’URL e poi connettersi all’*IP* risolto; qui è controllare la *stringa* del nome file e poi aprire il *percorso* normalizzato. In entrambi i casi c’è uno scarto fra ciò che verifichi e ciò che usi, e l’attacco vive lì dentro. La correzione è la stessa: **risolvi prima, verifica dopo, usa esattamente ciò che hai verificato**.',
    },
    {
      id: 'c-kp',
      kind: 'keypoints',
      title: 'Le difese che reggono',
      points: [
        'Meglio di tutto: non usare l’input come percorso. Un identificativo opaco che indicizza una tabella non può risalire nulla.',
        'Canonicalizzare (`realpath`/`resolve`) e verificare che il risultato stia dentro la base — controllando anche i symlink, che risalgono senza `../`.',
        'Allow-list dei nomi ammessi, quando l’insieme dei file è finito e noto.',
        'Permessi minimi sul filesystem: se `www-data` non può leggere `.env`, il traversal resta ma non paga.',
      ],
    },
    {
      id: 'c-quiz',
      kind: 'quiz',
      question: 'Perché `nome.replace("../", "")` è una difesa illusoria contro il path traversal?',
      options: [
        { id: 'a', text: 'Perché è lenta su file grandi' },
        { id: 'b', text: 'Perché una singola passata può creare la sequenza che rimuove (`....//` → `../`) e non tocca affatto le forme codificate come `%2e%2e%2f`' },
        { id: 'c', text: 'Perché va applicata anche al percorso base' },
        { id: 'd', text: 'Perché `replace` non funziona sulle stringhe Unicode' },
      ],
      correct: ['b'],
      explanation:
        'Due difetti in una riga. Il primo è aritmetico: rimuovendo `../` da `....//` restano i caratteri che formano esattamente `../` — il filtro produce ciò che voleva eliminare. Il secondo è di posizione: il controllo guarda la stringa così com’è arrivata, ma la decodifica dell’URL avviene altrove nella catena, quindi `%2e%2e%2f` passa intatto e diventa `../` più avanti. Canonicalizzare e poi verificare il prefisso non ha nessuno dei due problemi, perché giudica il percorso finale invece di indovinare quali stringhe siano pericolose.',
      skills: ['path-traversal'],
    },
    {
      id: 'lab-bridge',
      kind: 'callout',
      variant: 'tip',
      text: 'Ora nel Live Lab (Helpdesk). Il download allegati è /allegato?file=…: parti da un file legittimo, guarda il percorso risolto nei serverNotes, poi risali con ../ verso /etc/passwd e il .env dell’app. Prova anche /etc/shadow e osserva la differenza — è il permesso a fermarti, non un filtro.',
    },
    {
      id: 'd-kp',
      kind: 'keypoints',
      title: 'Da portarsi via',
      points: [
        'Il path traversal nasce da un percorso costruito concatenando input non fidato.',
        '`../` e le sue forme codificate esistono per aggirare filtri fatti nel punto sbagliato.',
        'Cosa riesci davvero a leggere lo decidono l’utente del processo e i bit di permesso.',
        'La difesa è canonicalizzare e verificare il prefisso — mai sostituire sottostringhe.',
        'Permessi stretti sui file di configurazione riducono l’impatto anche a vulnerabilità presente.',
      ],
    },
    {
      id: 'd-bridge',
      kind: 'callout',
      variant: 'tip',
      title: 'La prossima lezione gira la freccia',
      text: 'Qui hai usato un percorso controllato dall’utente per **leggere**. Nella prossima — File Upload — lo stesso controllo sul percorso serve a **scrivere**: e un file scritto nel posto sbagliato non si limita a rivelare dati, viene eseguito. Il salto di gravità sta tutto nella direzione.',
    },
  ],
  recap: [
    'Concatenare input in un percorso permette di uscire dalla directory prevista.',
    'Le varianti codificate esistono perché i filtri guardano la stringa sbagliata nel momento sbagliato.',
    'L’utente del processo e i permessi decidono quali file sono davvero leggibili.',
    'Si corregge canonicalizzando e verificando che il percorso risolto resti dentro la base.',
  ],
  furtherReading: [
    { title: 'OWASP: Path Traversal', url: 'https://owasp.org/www-community/attacks/Path_Traversal' },
    { title: 'PortSwigger: Directory traversal', url: 'https://portswigger.net/web-security/file-path-traversal' },
    { title: 'OWASP File Upload / Input Validation Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html' },
  ],
  exercises: ['ex.pt.escape', 'ex.pt.permission', 'ex.pt.fix'],
};
