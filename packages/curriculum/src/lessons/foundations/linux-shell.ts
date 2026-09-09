import type { Lesson } from '@cyberlab/core';

/**
 * The Linux shell, written for someone who will use it to enumerate a host.
 *
 * Not a command reference — the reference is `man`. This teaches the *shape* of
 * the system (everything is a file, processes have owners, output composes
 * through pipes) so that the privilege-escalation lesson later reads as
 * consequence rather than as a list of tricks to memorise.
 */
export const linuxShellLesson: Lesson = {
  id: 'found.linux-shell',
  moduleId: 'mod.linux-foundations',
  title: 'La shell Linux',
  subtitle: 'Filesystem, processi, pipe: la forma del sistema',
  status: 'theory-only',
  difficulty: 'beginner',
  estimatedMinutes: 28,
  skills: ['linux-fundamentals'],
  prerequisites: [],
  objectives: [
    'Muoversi nel filesystem e sapere cosa aspettarsi in ogni directory di sistema.',
    'Comporre comandi con pipe e redirezioni.',
    'Elencare processi e servizi, e capire con quale utente girano.',
    'Eseguire una prima enumerazione di una macchina appena ottenuta.',
  ],
  theory: [
    { id: 'a-h', kind: 'heading', level: 2, eyebrow: 'SECTION A · FILESYSTEM', text: 'Un albero solo, e dentro c’è tutto' },
    {
      id: 'a-1',
      kind: 'prose',
      text: 'Linux non ha lettere di unità: c’è **una** radice, `/`, e ogni disco, ogni dispositivo, persino ogni processo compare come file da qualche parte dentro quell’albero. "Tutto è un file" non è uno slogan: è il motivo per cui puoi leggere lo stato del kernel con `cat`.',
    },
    {
      id: 'a-table',
      kind: 'table',
      columns: ['Percorso', 'Cosa contiene', 'Perché lo guardi'],
      rows: [
        ['/etc', 'Configurazione di sistema', 'Credenziali dimenticate nei file di config, `passwd`, `crontab`.'],
        ['/home', 'Directory degli utenti', 'Chiavi SSH, cronologia della shell, file `.env`.'],
        ['/var/log', 'Log', 'Cosa è successo — e cosa hai lasciato tu.'],
        ['/tmp', 'File temporanei, scrivibili da tutti', 'Dove appoggiare strumenti; anche dove si nascondono gli altri.'],
        ['/proc', 'Stato del kernel e dei processi', 'Righe di comando complete: `/proc/*/cmdline` a volte contiene password.'],
        ['/usr/bin', 'Programmi installati', 'Cosa hai a disposizione, e quali binari hanno bit speciali.'],
      ],
    },
    {
      id: 'a-code',
      kind: 'code',
      language: 'bash',
      filename: 'orientarsi',
      code: `pwd                 # dove sono
ls -la              # tutto, anche i file nascosti, con permessi
cd /var/log         # spostarsi
file registro.bin   # che tipo di file è davvero
find / -name "*.conf" 2>/dev/null   # cercare, ignorando i permessi negati`,
      annotations: {
        2: 'i file che iniziano con . sono nascosti solo per convenzione: -a li mostra',
        5: '2>/dev/null butta via gli errori e rende leggibile l’output — riflesso da acquisire subito',
      },
    },

    { id: 'b-h', kind: 'heading', level: 2, eyebrow: 'SECTION B · COMPOSIZIONE', text: 'Programmi piccoli, incastrati' },
    {
      id: 'b-1',
      kind: 'prose',
      text: 'La filosofia Unix è che ogni programma faccia una cosa e la faccia su un flusso di testo. La **pipe** `|` collega l’uscita di uno all’ingresso del successivo. Non è eleganza fine a se stessa: è ciò che ti permette di costruire, al volo, esattamente lo strumento che ti serve.',
    },
    {
      id: 'b-flow',
      kind: 'flow',
      title: 'I tre flussi di ogni processo',
      nodes: [
        { id: 'in', label: 'stdin', sublabel: 'fd 0', col: 0, row: 1, tone: 'default' },
        { id: 'proc', label: 'processo', col: 1, row: 1, tone: 'accent' },
        { id: 'out', label: 'stdout', sublabel: 'fd 1', col: 2, row: 0, tone: 'success' },
        { id: 'err', label: 'stderr', sublabel: 'fd 2', col: 2, row: 2, tone: 'danger', tooltip: 'Separato apposta: puoi buttare via gli errori senza perdere i risultati.' },
      ],
      edges: [
        { from: 'in', to: 'proc' },
        { from: 'proc', to: 'out', tone: 'success' },
        { from: 'proc', to: 'err', tone: 'danger' },
      ],
    },
    {
      id: 'b-code',
      kind: 'code',
      language: 'bash',
      filename: 'comporre',
      code: `cat /etc/passwd | grep bash | cut -d: -f1
# utenti con una shell interattiva

ps aux | grep -v grep | grep root
# processi che girano come root

history | grep -i -E 'pass|token|key'
# credenziali digitate e dimenticate nella cronologia

grep -rn "password" /var/www 2>/dev/null | head -20`,
      annotations: {
        1: 'leggi → filtra → estrai la prima colonna: tre programmi, un risultato',
        7: 'uno dei ritrovamenti più frequenti dopo aver ottenuto una shell',
      },
    },
    {
      id: 'b-table-2',
      kind: 'table',
      columns: ['Simbolo', 'Effetto'],
      rows: [
        ['`|`', 'Manda stdout del primo nello stdin del secondo.'],
        ['`>`', 'Scrive stdout su file, sovrascrivendolo.'],
        ['`>>`', 'Aggiunge in coda al file.'],
        ['`2>/dev/null`', 'Butta via gli errori.'],
        ['`&&` / `||`', 'Esegui il successivo solo se il precedente riesce / fallisce.'],
        ['`$(comando)`', 'Sostituisce il comando con il suo output.'],
      ],
    },

    { id: 'c-h', kind: 'heading', level: 2, eyebrow: 'SECTION C · PROCESSI', text: 'Chi sta girando, e per conto di chi' },
    {
      id: 'c-1',
      kind: 'prose',
      text: 'Ogni processo ha un proprietario, e quel proprietario determina cosa il processo può fare. È l’osservazione da cui nasce tutta la scalata dei privilegi: se un programma che gira come root può essere influenzato da te, quello che fa lo fa con i poteri di root.',
    },
    {
      id: 'c-code',
      kind: 'code',
      language: 'bash',
      filename: 'enumerazione iniziale',
      code: `id                    # chi sono e a quali gruppi appartengo
whoami
ps aux                # tutti i processi, con utente e riga di comando
systemctl list-units --type=service --state=running
crontab -l            # attività pianificate mie
cat /etc/crontab      # attività pianificate di sistema
sudo -l               # cosa posso eseguire come un altro utente`,
      highlight: [1, 7],
      annotations: {
        1: 'i gruppi contano quanto l’utente: docker, lxd o disk equivalgono spesso a root',
        7: 'la riga singola più redditizia di tutta l’enumerazione Linux',
      },
      caption: 'Questi sette comandi sono il primo minuto su qualunque macchina appena ottenuta.',
    },
    {
      id: 'c-callout',
      kind: 'callout',
      variant: 'tip',
      title: 'Leggere `ps aux` con occhi da attaccante',
      text: 'Non cerchi "cosa gira", cerchi **anomalie**: un processo root che esegue uno script in una directory scrivibile da te; una riga di comando con una password dentro; un servizio in ascolto che dall’esterno non vedevi. È l’osservazione, non il comando, a fare il lavoro.',
    },
    {
      id: 'c-quiz',
      kind: 'quiz',
      question: 'Perché `find / -name "*.conf" 2>/dev/null` è più utile che senza `2>/dev/null`?',
      options: [
        { id: 'a', text: 'È più veloce perché cerca in meno directory' },
        { id: 'b', text: 'Nasconde le centinaia di "Permission denied", lasciando leggibili i risultati veri' },
        { id: 'c', text: 'Evita di lasciare tracce nei log' },
        { id: 'd', text: 'Cerca anche nei file nascosti' },
      ],
      correct: ['b'],
      explanation:
        'stdout e stderr sono flussi separati apposta. `find` percorrendo tutto il filesystem come utente normale produce moltissimi errori di permesso su stderr; mandarli in `/dev/null` lascia sullo schermo solo ciò che hai trovato davvero. Stessa ricerca, output usabile.',
      skills: ['linux-fundamentals'],
    },
    {
      id: 'c-quiz-2',
      kind: 'quiz',
      question: 'Su una macchina appena ottenuta, quale comando dà più spesso una via diretta verso root?',
      options: [
        { id: 'a', text: 'ls -la' },
        { id: 'b', text: 'sudo -l' },
        { id: 'c', text: 'pwd' },
        { id: 'd', text: 'uname -a' },
      ],
      correct: ['b'],
      explanation:
        '`sudo -l` elenca cosa il tuo utente può eseguire come qualcun altro, spesso senza password. Una singola voce troppo generosa — un editor, un interprete, un comando che accetta un percorso — basta a diventare root, perché quel programma girerà con l’autorità di root. Nel lab di privilege escalation partirai esattamente da qui.',
      skills: ['linux-fundamentals'],
    },
    {
      id: 'd-kp',
      kind: 'keypoints',
      title: 'Da portarsi via',
      points: [
        'Un albero solo: `/etc` configura, `/home` conserva segreti, `/proc` espone lo stato vivo.',
        'Le pipe compongono programmi piccoli nello strumento che ti serve adesso.',
        '`2>/dev/null` rende leggibile qualunque ricerca su tutto il filesystem.',
        'Ogni processo ha un proprietario: è da lì che passa la scalata dei privilegi.',
        '`id`, `ps aux`, `sudo -l`: il primo minuto su ogni macchina.',
      ],
    },
  ],
  exercises: [],
  recap: [
    'Filesystem unico e gerarchico; tutto è un file.',
    'stdin/stdout/stderr e le pipe rendono componibile qualsiasi indagine.',
    'I processi hanno proprietari, e il proprietario definisce il potere.',
    'L’enumerazione iniziale è una manciata di comandi, ripetuta sempre uguale.',
  ],
  furtherReading: [
    { title: 'The Linux Command Line (Shotts)', url: 'https://linuxcommand.org/tlcl.php' },
    { title: 'GTFOBins', url: 'https://gtfobins.github.io/', note: 'Cosa può fare un binario legittimo quando gira con privilegi.' },
  ],
};
