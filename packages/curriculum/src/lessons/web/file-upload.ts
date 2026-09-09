import type { Lesson } from '@cyberlab/core';

/**
 * File Upload insicuro — la stessa domanda del path traversal, girata.
 *
 * Là il percorso controllato dall'utente serviva a leggere; qui serve a
 * scrivere, e un file scritto nel posto sbagliato viene *eseguito*. La lezione
 * insiste su un punto solo: nessuna proprietà dichiarata dal client — nome,
 * estensione, Content-Type — è un fatto, e la difesa che conta non è
 * riconoscere i file cattivi ma togliere al posto in cui finiscono il potere
 * di eseguirli.
 */
export const fileUploadLesson: Lesson = {
  id: 'web.file-upload',
  moduleId: 'mod.web-advanced',
  title: 'File Upload insicuro',
  subtitle: 'Scrivere sul server, e farsi eseguire',
  status: 'theory-only',
  difficulty: 'intermediate',
  skills: ['file-upload', 'path-traversal', 'http'],
  estimatedMinutes: 30,
  prerequisites: ['web.path-traversal'],
  objectives: [
    'Elencare cosa un server può realmente verificare di un file caricato, e cosa no.',
    'Descrivere come un upload diventa esecuzione di codice remota.',
    'Riconoscere i bypass dei controlli su estensione e Content-Type.',
    'Progettare uno storage in cui un file caricato non possa essere eseguito.',
  ],
  theory: [
    { id: 'a-h', kind: 'heading', level: 2, eyebrow: 'SECTION A · LA FRECCIA SI GIRA', text: 'Dalla lettura alla scrittura' },
    {
      id: 'a-1',
      kind: 'prose',
      text: 'Nella lezione precedente un percorso controllato dall’utente ti faceva **leggere** file che non avresti dovuto vedere. L’upload è la stessa struttura con la freccia invertita: adesso scrivi tu, e scegli — o influenzi — nome, contenuto e talvolta posizione. Il salto di gravità sta qui: un file letto rivela dati, un file scritto nel posto giusto **viene eseguito**, e da quel momento non stai più sfruttando una vulnerabilità del web, stai eseguendo codice tuo sul server.',
    },
    {
      id: 'a-flow',
      kind: 'flow',
      title: 'Da upload a esecuzione',
      nodes: [
        { id: 'up', label: 'Upload', sublabel: 'avatar.php', col: 0, row: 1, tone: 'danger', tooltip: 'Contenuto e nome li decide chi carica.' },
        { id: 'val', label: 'Validazione', sublabel: 'estensione? MIME?', col: 1, row: 1, tone: 'default', tooltip: 'Controlla proprietà dichiarate dal client: aggirabili.' },
        { id: 'store', label: 'Storage', sublabel: '/var/www/uploads/', col: 2, row: 1, tone: 'danger', tooltip: 'Dentro la webroot: raggiungibile via URL.' },
        { id: 'exec', label: 'Richiesta', sublabel: 'GET /uploads/avatar.php', col: 3, row: 1, tone: 'danger', tooltip: 'Il server esegue il file invece di servirlo: RCE.' },
      ],
      edges: [
        { from: 'up', to: 'val' },
        { from: 'val', to: 'store', label: 'accettato' },
        { from: 'store', to: 'exec', tone: 'danger' },
      ],
      steps: [
        { label: '1 · Si carica qualcosa che non è un’immagine', highlight: ['up', 'val'] },
        { label: '2 · Finisce in una cartella servita dal web', highlight: ['store'] },
        { label: '3 · Basta chiederlo, e viene eseguito', highlight: ['exec'] },
      ],
    },
    {
      id: 'a-2',
      kind: 'prose',
      text: 'Quel terzo passaggio merita attenzione, perché è il vero difetto: **la cartella degli upload è servita dal web server e configurata per eseguire codice**. Se `/uploads/` restituisse sempre byte grezzi, caricarci dentro un file PHP sarebbe innocuo. La vulnerabilità nasce dall’incontro fra un contenuto non fidato e un luogo che sa eseguire — non dal contenuto in sé.',
    },
    {
      id: 'a-legal',
      kind: 'callout',
      variant: 'legal',
      title: 'Scope: qui si scrive su un sistema altrui',
      text: 'Caricare una webshell su un server non tuo è accesso abusivo aggravato, e a differenza di una lettura lascia artefatti persistenti che possono compromettere il sistema anche dopo. In un test autorizzato si carica un file inerte che dimostri la scrittura e l’esecuzione — un file che stampa una stringa concordata — e lo si rimuove documentando l’operazione. In questo percorso lo fai su laboratori isolati.',
    },

    { id: 'b-h', kind: 'heading', level: 2, eyebrow: 'SECTION B · COSA È UN FATTO', text: 'Tutto ciò che dichiara il client è un’opinione' },
    {
      id: 'b-req',
      kind: 'http-exchange',
      title: 'Un upload, campo per campo — clicca per capire di chi è la parola',
      request: {
        method: 'POST',
        path: '/profilo/avatar',
        version: 'HTTP/1.1',
        headers: [
          { name: 'Content-Type', value: 'multipart/form-data; boundary=----x', explain: 'Formato della richiesta. Non dice nulla sul contenuto del singolo file.' },
          { name: 'Cookie', value: 'session=8f3c9a1b2e', explain: 'Spesso l’upload richiede autenticazione — il che restringe chi attacca, non cosa può caricare.' },
        ],
        body: `------x
Content-Disposition: form-data; name="file"; filename="foto.jpg"
Content-Type: image/jpeg

<?php system($_GET['c']); ?>
------x--`,
      },
      response: {
        status: 200,
        statusText: 'OK',
        headers: [{ name: 'Content-Type', value: 'application/json', explain: 'La risposta spesso rivela il percorso finale: è l’informazione che serve per andarlo a chiamare.' }],
        body: '{"url":"/uploads/foto.jpg"}',
      },
      takeaway: 'filename e Content-Type stanno nel corpo della richiesta: li scrive chi carica. Un file può dichiararsi image/jpeg e chiamarsi foto.jpg pur contenendo codice PHP — sono tre affermazioni indipendenti, e nessuna è verificata da nessuno.',
    },
    {
      id: 'b-table',
      kind: 'table',
      columns: ['Controllo', 'Cosa guarda', 'Come si aggira', 'Vale qualcosa?'],
      rows: [
        ['Estensione in blocklist', 'Il testo dopo l’ultimo punto', '.phtml, .php5, .PhP, doppia estensione', 'No: enumerare i cattivi non finisce mai'],
        ['Content-Type dichiarato', 'Un header scritto dal client', 'Lo si cambia in image/jpeg', 'No: è un’affermazione, non una prova'],
        ['Magic bytes', 'I primi byte reali del file', 'Si antepone GIF89a; al codice — resta un GIF valido *e* PHP valido', 'Parzialmente'],
        ['Estensione in allow-list', 'Solo .jpg .png .webp ammessi', 'Molto più difficile, se applicata al nome finale', 'Sì'],
        ['Ri-codifica dell’immagine', 'Decodifica e riscrive il file', 'Praticamente nulla sopravvive', 'Sì, la più forte'],
      ],
      caption: 'I primi due sono i più diffusi e i meno utili. Gli ultimi due sono quelli che si tengono.',
    },
    {
      id: 'b-quiz',
      kind: 'quiz',
      question: 'Un endpoint accetta solo file il cui `Content-Type` è `image/png` e il cui nome finisce in `.png`. Perché non basta?',
      options: [
        { id: 'a', text: 'Basta: due controlli indipendenti coprono il caso' },
        { id: 'b', text: 'Perché entrambi sono dichiarati dal client nella stessa richiesta: si scrivono a piacere, e nessuno dei due guarda il contenuto reale del file' },
        { id: 'c', text: 'Perché PNG non è un formato sicuro' },
        { id: 'd', text: 'Perché manca il controllo sulla dimensione' },
      ],
      correct: ['b'],
      explanation:
        'Non sono due controlli indipendenti: sono due campi della stessa richiesta multipart, scritti entrambi da chi carica. Con qualunque proxy si mette `image/png` in `Content-Type` e `.png` nel `filename` mentre il corpo contiene codice. È lo stesso errore visto con gli header di richiesta nella lezione su HTTP — trattare come prova ciò che il client afferma. La domanda giusta non è "cosa dice il file di essere", ma "cosa succede se lo apro" e soprattutto "cosa fa il server quando qualcuno lo richiede".',
      skills: ['file-upload', 'http'],
    },

    { id: 'c-h', kind: 'heading', level: 2, eyebrow: 'SECTION C · OLTRE LA WEBSHELL', text: 'Non serve eseguire per fare danni' },
    {
      id: 'c-timeline',
      kind: 'timeline',
      entries: [
        { title: 'Esecuzione (il caso peggiore)', text: 'Un `.php`, `.jsp`, `.aspx` in una cartella che esegue: da lì è codice tuo sul server, con i privilegi del processo web. Da questo punto in poi vale tutto ciò che vedrai nel livello Linux sulla privilege escalation.', tone: 'danger' },
        { title: 'Percorso controllato', text: 'Se il nome del file finisce nel percorso di scrittura, `../../` sposta il file altrove: `.ssh/authorized_keys`, un cron, un file di configurazione. È il path traversal della lezione precedente, in scrittura.', tone: 'danger' },
        { title: 'XSS via file', text: 'Un `.svg` o un `.html` caricato e servito dalla stessa origine esegue JavaScript in quel dominio: è un XSS persistente, con tutto ciò che hai visto nella sua lezione.', tone: 'danger' },
        { title: 'Attacchi al parser', text: 'Il file non viene eseguito, ma *interpretato* da una libreria: un XML con entità esterne, un archivio zip che si espande a dismisura. Il codice vulnerabile è quello che apre il file, non quello che lo salva.' },
        { title: 'Sovrascrittura', text: 'Un nome non normalizzato che coincide con un file esistente sostituisce contenuti legittimi — inclusi, a volte, file dell’applicazione.', tone: 'danger' },
      ],
    },
    {
      id: 'c-1',
      kind: 'prose',
      text: 'Nota il terzo caso: un SVG è un documento XML che può contenere `<script>`. Caricarlo è banale, supera ogni controllo "è un’immagine?" e, se servito dalla tua stessa origine, diventa un XSS persistente. Molti team lo scoprono dopo aver messo in sicurezza l’esecuzione lato server, perché continuano a pensare all’upload come a un problema di webshell.',
    },

    { id: 'd-h', kind: 'heading', level: 2, eyebrow: 'SECTION D · DIFESA', text: 'Togliere al file il potere di essere eseguito' },
    {
      id: 'd-compare',
      kind: 'comparison',
      left: {
        label: 'Vulnerabile: fidarsi del nome',
        tone: 'bad',
        language: 'php',
        code: `$nome = $_FILES['file']['name'];
if (str_ends_with($nome, '.php')) {
  die('non consentito');
}
move_uploaded_file(
  $_FILES['file']['tmp_name'],
  "/var/www/uploads/" . $nome
);`,
        note: 'Blocklist su un nome scelto dall’attaccante, e destinazione dentro la webroot: entrambe le condizioni della RCE.',
      },
      right: {
        label: 'Corretto: nome generato, storage inerte',
        tone: 'good',
        language: 'php',
        code: `// 1. il nome lo decide il server
$id = bin2hex(random_bytes(16));
// 2. estensione da una allow-list,
//    dedotta dal contenuto verificato
$ext = ammesse(tipo_reale($tmp));
// 3. fuori dalla webroot, servito da
//    un handler che impone il tipo
salva("/srv/dati/upload/$id.$ext");`,
        note: 'Il nome dell’attaccante non raggiunge mai il filesystem, e la cartella non è servita direttamente dal web server.',
      },
    },
    {
      id: 'd-kp',
      kind: 'keypoints',
      title: 'Le difese che reggono, in ordine di efficacia',
      points: [
        '**Storage che non esegue**: fuori dalla webroot, o su un servizio di object storage separato. È la difesa che rende irrilevante il contenuto.',
        '**Nome generato dal server**: un identificativo casuale elimina in un colpo traversal, sovrascritture e doppie estensioni.',
        '**Allow-list dei tipi**, verificata sul contenuto reale — e per le immagini, ri-codificarle: quasi nessun payload sopravvive alla decodifica e riscrittura.',
        '**Content-Type imposto in risposta** più `Content-Disposition: attachment` e `X-Content-Type-Options: nosniff`: chiude l’XSS via SVG o HTML.',
        '**Servire da un dominio separato**, senza cookie di sessione: anche un file che esegue script non è più nell’origine dell’applicazione.',
        'Limiti di dimensione e quota: banali, e l’unica difesa contro l’esaurimento del disco.',
      ],
    },
    {
      id: 'd-quiz',
      kind: 'quiz',
      question: 'Perché salvare gli upload fuori dalla webroot con un nome generato dal server è più efficace di qualunque controllo sul contenuto?',
      options: [
        { id: 'a', text: 'Perché occupa meno spazio' },
        { id: 'b', text: 'Perché toglie all’attaccante le due leve che servono: scegliere il percorso e ottenere che il file venga eseguito — quindi anche un file malevolo che superi i controlli resta inerte' },
        { id: 'c', text: 'Perché rende il file illeggibile' },
        { id: 'd', text: 'Perché impedisce l’upload di file grandi' },
      ],
      correct: ['b'],
      explanation:
        'I controlli sul contenuto sono una gara a chi riconosce meglio: si può sempre confezionare un file che è insieme un’immagine valida e qualcos’altro. Cambiare lo storage cambia invece le regole del gioco — il nome casuale nega il controllo sul percorso, la posizione fuori dalla webroot nega l’esecuzione. È lo stesso salto di livello visto con le query parametrizzate e con l’allow-list della SSRF: si toglie la capacità invece di rincorrere i sintomi.',
      skills: ['file-upload'],
    },
    {
      id: 'e-kp',
      kind: 'keypoints',
      title: 'Da portarsi via',
      points: [
        'Nome, estensione e Content-Type sono affermazioni del client, non fatti.',
        'La RCE richiede due condizioni: un contenuto eseguibile e un luogo che lo esegua. Togline una.',
        'Un upload non deve eseguire per fare danni: SVG, parser XML, sovrascritture e traversal in scrittura.',
        'Le difese forti sono strutturali: nome generato dal server, storage inerte, ri-codifica, dominio separato.',
      ],
    },
  ],
  recap: [
    'Un upload insicuro è un percorso di scrittura controllato dall’utente.',
    'Le proprietà dichiarate dal client non verificano nulla del contenuto.',
    'L’esecuzione dipende da dove finisce il file, non solo da cosa contiene.',
    'Nome generato, storage fuori dalla webroot e ri-codifica sono le difese che reggono.',
  ],
  furtherReading: [
    { title: 'OWASP File Upload Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html' },
    { title: 'PortSwigger: File upload vulnerabilities', url: 'https://portswigger.net/web-security/file-upload' },
    { title: 'OWASP: Unrestricted File Upload', url: 'https://owasp.org/www-community/vulnerabilities/Unrestricted_File_Upload' },
  ],
  exercises: [],
};
