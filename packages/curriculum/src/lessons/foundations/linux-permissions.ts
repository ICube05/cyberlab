import type { Lesson } from '@cyberlab/core';

/**
 * Permissions — with the interactive calculator doing the teaching.
 *
 * The rule people get wrong is that the classes are checked in order and the
 * *first match wins*, even when it is more restrictive than a later one. The
 * permission-bits block evaluates exactly that rule live against several
 * actors, so the counter-intuitive case (owner denied while others are allowed)
 * can be discovered rather than asserted.
 */
export const linuxPermissionsLesson: Lesson = {
  id: 'found.linux-permissions',
  moduleId: 'mod.linux-foundations',
  title: 'Permessi Linux',
  subtitle: 'rwx, ottale, SUID — e la regola che sorprende tutti',
  status: 'theory-only',
  difficulty: 'beginner',
  estimatedMinutes: 30,
  skills: ['permissions', 'linux-fundamentals'],
  prerequisites: ['found.linux-shell'],
  objectives: [
    'Leggere una riga di `ls -l` e dire chi può fare cosa.',
    'Convertire fra notazione simbolica e ottale.',
    'Applicare la regola della prima classe corrispondente.',
    'Riconoscere SUID, SGID e sticky bit, e perché SUID è una via verso root.',
  ],
  theory: [
    { id: 'a-h', kind: 'heading', level: 2, eyebrow: 'SECTION A · LEGGERE', text: 'Dieci caratteri, tutta la storia' },
    {
      id: 'a-code',
      kind: 'code',
      language: 'bash',
      code: `$ ls -l /etc/shadow /usr/bin/passwd
-rw-r-----  1 root shadow  1420 mag 12 09:14 /etc/shadow
-rwsr-xr-x  1 root root   68208 feb  6  2024 /usr/bin/passwd`,
      annotations: {
        2: 'root legge e scrive; il gruppo shadow legge; tutti gli altri niente',
        3: 'la s al posto della x: SUID — questo programma gira sempre come root',
      },
    },
    {
      id: 'a-1',
      kind: 'prose',
      text: 'I dieci caratteri si leggono a blocchi: il primo dice il tipo (`-` file, `d` directory, `l` link), poi tre triadi da tre bit — **owner**, **group**, **other** — ciascuna con `r`, `w`, `x`. Su una directory i tre bit significano qualcosa di diverso: `r` elencare il contenuto, `w` creare o rimuovere voci, `x` attraversarla per raggiungere ciò che c’è dentro.',
    },
    {
      id: 'a-table',
      kind: 'table',
      columns: ['Bit', 'Valore', 'Su un file', 'Su una directory'],
      rows: [
        ['r', '4', 'Leggere il contenuto', 'Elencare i nomi'],
        ['w', '2', 'Modificare il contenuto', 'Creare o cancellare voci'],
        ['x', '1', 'Eseguire', 'Attraversare (accedere ai figli)'],
      ],
      caption: 'La somma dei valori dà la cifra ottale: rwx = 7, rw- = 6, r-x = 5, r-- = 4.',
    },
    {
      id: 'a-2',
      kind: 'callout',
      variant: 'warning',
      title: 'Il caso che sorprende: la prima classe vince',
      text: 'Il kernel non cerca la classe *più permissiva*: prende la **prima** che ti descrive e si ferma. Sei l’owner? Si applicano i bit dell’owner, e basta. Quindi `----rwxrwx` significa che il proprietario **non** può leggere il proprio file mentre tutti gli altri possono fare tutto. Non è un bug: è la regola, ed è il motivo per cui i permessi vanno verificati, non indovinati.',
    },
    {
      id: 'a-bits',
      kind: 'permission-bits',
      path: '/srv/app/config.php',
      initialMode: 0o640,
      owner: 'www-data',
      group: 'developers',
      actors: [
        { id: 'www', label: 'www-data (proprietario)', user: 'www-data', groups: ['www-data'] },
        { id: 'dev', label: 'marco (gruppo developers)', user: 'marco', groups: ['marco', 'developers'] },
        { id: 'other', label: 'ospite (nessuna relazione)', user: 'ospite', groups: ['ospite'] },
        { id: 'root', label: 'root', user: 'root', groups: ['root'] },
      ],
      tutorNote: 'Clicca i bit e osserva la tabella: prova a togliere la lettura all’owner lasciandola agli altri.',
    },

    { id: 'b-h', kind: 'heading', level: 2, eyebrow: 'SECTION B · OTTALE', text: 'Le tre cifre, e chmod' },
    {
      id: 'b-code',
      kind: 'code',
      language: 'bash',
      code: `chmod 640 config.php      # rw- r-- ---
chmod 755 script.sh       # rwx r-x r-x
chmod 600 ~/.ssh/id_rsa   # rw- --- ---   (SSH rifiuta la chiave se è più aperta)
chmod u+x,go-w script.sh  # forma simbolica: incrementale invece che assoluta`,
      annotations: {
        3: 'un permesso troppo largo su una chiave privata è un errore che SSH ti impedisce di commettere',
      },
    },
    {
      id: 'b-table',
      kind: 'table',
      columns: ['Modo', 'Significato', 'Uso tipico'],
      rows: [
        ['600', 'Solo l’owner legge e scrive', 'Chiavi private, segreti.'],
        ['640', 'Owner scrive, gruppo legge', 'File di configurazione con credenziali.'],
        ['644', 'Tutti leggono, owner scrive', 'File pubblici, pagine web.'],
        ['755', 'Tutti eseguono e leggono, owner scrive', 'Programmi e directory.'],
        ['777', 'Tutti fanno tutto', 'Quasi sempre un errore. Chiunque riscrive quel file.'],
      ],
    },

    { id: 'c-h', kind: 'heading', level: 2, eyebrow: 'SECTION C · BIT SPECIALI', text: 'SUID, SGID, sticky' },
    {
      id: 'c-1',
      kind: 'prose',
      text: 'Oltre alle nove combinazioni ci sono tre bit speciali, e il primo è la ragione per cui esiste metà della privilege escalation su Linux. **SUID** dice: quando questo programma viene eseguito, gira con l’autorità del suo *proprietario*, non di chi lo lancia.',
    },
    {
      id: 'c-2',
      kind: 'prose',
      text: 'Serve per casi legittimi — `passwd` deve poter scrivere in `/etc/shadow`, che l’utente non può toccare. Il problema nasce quando il programma SUID sa fare *più* di quel compito: se accetta un percorso arbitrario, o sa eseguire comandi, o sa scrivere file dove gli dici, quel potere è ora tuo.',
    },
    {
      id: 'c-flow',
      kind: 'flow',
      title: 'Come SUID diventa una scalata',
      nodes: [
        { id: 'u', label: 'utente normale', sublabel: 'uid 1000', col: 0, row: 1, tone: 'default' },
        { id: 'bin', label: 'binario SUID', sublabel: '-rwsr-xr-x root', col: 1, row: 1, tone: 'danger', tooltip: 'La s significa: eseguito, gira come root.' },
        { id: 'act', label: 'azione con autorità root', sublabel: 'legge/scrive/esegue', col: 2, row: 1, tone: 'danger' },
        { id: 'root', label: 'root', col: 3, row: 1, tone: 'success' },
      ],
      edges: [
        { from: 'u', to: 'bin', label: 'esegue' },
        { from: 'bin', to: 'act', tone: 'danger' },
        { from: 'act', to: 'root', label: 'se il programma fa troppo', tone: 'danger' },
      ],
    },
    {
      id: 'c-code',
      kind: 'code',
      language: 'bash',
      filename: 'caccia ai binari SUID',
      code: `find / -perm -4000 -type f 2>/dev/null

# poi, per ognuno che non riconosci, la domanda è sempre la stessa:
# questo programma sa leggere, scrivere o eseguire qualcosa che io scelgo?`,
      caption: 'GTFOBins cataloga esattamente questa risposta per centinaia di binari comuni.',
    },
    {
      id: 'c-table',
      kind: 'table',
      columns: ['Bit', 'Ottale', 'Su file', 'Su directory'],
      rows: [
        ['SUID', '4000', 'Gira come il proprietario', '(nessun effetto)'],
        ['SGID', '2000', 'Gira come il gruppo', 'I file creati ereditano il gruppo'],
        ['Sticky', '1000', '(nessun effetto)', 'Solo il proprietario può cancellare i propri file — è ciò che rende `/tmp` usabile'],
      ],
    },
    {
      id: 'c-quiz',
      kind: 'quiz',
      question: 'Un file ha permessi `----rwxrwx` ed è tuo. Puoi leggerlo?',
      options: [
        { id: 'a', text: 'Sì: i bit di other lo permettono' },
        { id: 'b', text: 'No: sei l’owner, si applica la sua triade, che è vuota' },
        { id: 'c', text: 'Sì, ma solo in lettura' },
        { id: 'd', text: 'Dipende dal gruppo' },
      ],
      correct: ['b'],
      explanation:
        'La prima classe corrispondente vince e si ferma lì. Essendo l’owner, contano solo i bit dell’owner — che qui sono tutti spenti. Chiunque altro invece ha rwx. È il caso limite che dimostra che i permessi si verificano, non si intuiscono. (Puoi comunque rimediare: essendo l’owner, hai il diritto di fare `chmod`.)',
      skills: ['permissions'],
    },
    {
      id: 'c-quiz-2',
      kind: 'quiz',
      question: 'Trovi `-rwsr-xr-x root root /usr/bin/find`. Perché è grave?',
      options: [
        { id: 'a', text: 'Non lo è: find serve solo a cercare file' },
        { id: 'b', text: 'find sa eseguire comandi con -exec, e con SUID quei comandi girerebbero come root' },
        { id: 'c', text: 'Perché find è più lento se ha SUID' },
        { id: 'd', text: 'Perché espone i nomi dei file agli altri utenti' },
      ],
      correct: ['b'],
      explanation:
        '`find . -exec /bin/sh \\;` esegue una shell — e se `find` ha SUID root, quella shell è una shell di root. È la ragione per cui il criterio non è "questo programma è pericoloso?" ma "questo programma sa fare qualcosa che io scelgo?". Nel lab Foothold userai esattamente questo ragionamento.',
      skills: ['permissions', 'linux-privesc'],
    },
    {
      id: 'd-kp',
      kind: 'keypoints',
      title: 'Da portarsi via',
      points: [
        'Tre triadi rwx per owner, group, other; r=4, w=2, x=1.',
        'Vince la **prima** classe che ti descrive, anche se è più restrittiva.',
        'Su directory, `x` significa attraversare: senza, non raggiungi ciò che c’è dentro.',
        'SUID fa girare il programma con l’autorità del proprietario: cerca sempre `find / -perm -4000`.',
        'La domanda giusta su un binario privilegiato: sa leggere, scrivere o eseguire qualcosa che scelgo io?',
      ],
    },
  ],
  exercises: [],
  recap: [
    'ls -l si legge a triadi; l’ottale è la somma di 4/2/1.',
    'La prima classe corrispondente decide, e si ferma lì.',
    'SUID/SGID/sticky sono i tre bit speciali; SUID è la via classica verso root.',
  ],
  furtherReading: [
    { title: 'GTFOBins', url: 'https://gtfobins.github.io/' },
    { title: 'man 7 credentials', url: 'https://man7.org/linux/man-pages/man7/credentials.7.html' },
  ],
};
