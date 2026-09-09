import type { Lesson } from '@cyberlab/core';

export const linuxPrivescLesson: Lesson = {
  id: 'linux.privilege-escalation',
  moduleId: 'mod.linux-privesc',
  title: 'Linux Privilege Escalation',
  subtitle: 'From an unprivileged shell to root via misconfiguration',
  status: 'ready',
  difficulty: 'intermediate',
  estimatedMinutes: 30,
  skills: ['linux-privesc', 'permissions', 'linux-fundamentals'],
  prerequisites: [],
  objectives: [
    'Leggere i permessi Unix rwx e capire come vengono valutati.',
    'Enumerare un host per trovare configurazioni sfruttabili (sudo, SUID).',
    'Usare una voce sudo troppo permissiva per diventare root, in un lab isolato.',
    'Spiegare la mitigazione.',
  ],
  theory: [
    { id: 'a-h', kind: 'heading', level: 2, eyebrow: 'SECTION A · THEORY', text: 'Chi può fare cosa, e perché' },
    {
      id: 'a-1',
      kind: 'prose',
      text: 'Su Linux ogni file ha un {{owner:l’utente proprietario}}, un {{group:il gruppo proprietario}} e tre terzetti di permessi — **r**ead, **w**rite, e**x**ecute — per *owner*, *group* e *other*. Il kernel sceglie **il primo terzetto che si applica** e onora solo quello: se sei l’owner, contano i bit dell’owner, anche se “group” o “other” sarebbero più generosi. La privilege escalation, quasi sempre, è trovare un posto dove questi permessi — o chi può eseguire cosa come root — sono configurati troppo larghi.',
    },
    {
      id: 'a-perm',
      kind: 'permission-bits',
      path: '/usr/local/bin/backup.sh',
      initialMode: 0o644,
      owner: 'root',
      group: 'staff',
      actors: [
        { id: 'seba', label: 'seba (owner? no)', user: 'seba', groups: ['seba', 'developers'] },
        { id: 'staffer', label: 'membro di staff', user: 'lucia', groups: ['staff'] },
        { id: 'root', label: 'root', user: 'root', groups: ['root'] },
      ],
    },
    {
      id: 'a-modes',
      kind: 'table',
      caption: 'Come leggere una modalità',
      columns: ['Simbolico', 'Ottale', 'Significato'],
      rows: [
        ['-rw-r--r--', '644', 'owner legge/scrive, gli altri solo leggono'],
        ['-rwsr-xr-x', '4755', 'SUID: esegue con i privilegi dell’owner (spesso root)'],
        ['-rw-------', '600', 'solo l’owner, lettura/scrittura'],
        ['drwx------', '700', 'directory privata dell’owner'],
      ],
    },
    {
      id: 'a-flow',
      kind: 'flow',
      title: 'La catena tipica',
      nodes: [
        { id: 'shell', label: 'Shell utente', sublabel: 'uid 1000', col: 0, row: 1, tone: 'default' },
        { id: 'enum', label: 'Enumerazione', sublabel: 'sudo -l, SUID, cron', col: 1, row: 1, tone: 'accent' },
        { id: 'misc', label: 'Misconfig', sublabel: 'sudo troppo largo', col: 2, row: 1, tone: 'danger' },
        { id: 'root', label: 'root', sublabel: 'uid 0', col: 3, row: 1, tone: 'success' },
      ],
      edges: [
        { from: 'shell', to: 'enum', tone: 'accent' },
        { from: 'enum', to: 'misc', tone: 'danger' },
        { from: 'misc', to: 'root', label: 'escalation', tone: 'success' },
      ],
    },
    {
      id: 'a-gtfo',
      kind: 'callout',
      variant: 'info',
      title: 'Perché `sudo find` è pericoloso',
      text: 'Se puoi eseguire `find` come root, puoi anche eseguire **qualsiasi cosa** come root: `find` ha un’opzione `-exec` che lancia comandi. Il comando lanciato eredita i privilegi di `find` — cioè root. Molti binari legittimi hanno un “grimaldello” del genere (il progetto GTFOBins li cataloga).',
    },
    {
      id: 'a-legal',
      kind: 'callout',
      variant: 'legal',
      title: 'Scope',
      text: 'L’escalation di privilegi va eseguita solo dove hai autorizzazione: questo laboratorio, CTF, o sistemi di tua proprietà. Qui l’host è un filesystem virtuale isolato.',
    },
    {
      id: 'a-kp',
      kind: 'keypoints',
      points: [
        'I permessi si valutano per classe: owner → group → other, il primo che si applica.',
        'root ignora i bit dei permessi.',
        'Enumerazione prima di tutto: sudo -l, find -perm -4000 (SUID), cron, file scrivibili.',
        'Un binary eseguibile come root con -exec (o simili) è una via a root.',
      ],
    },
  ],
  practice: [
    { id: 'b-h', kind: 'heading', level: 2, eyebrow: 'SECTION B · INTERACTIVE', text: 'Verifica la lettura dei permessi' },
    {
      id: 'b-quiz',
      kind: 'quiz',
      question: 'Un file è -rw-r----- , owner root, group adm. L’utente seba (gruppi: seba, developers) può leggerlo?',
      options: [
        { id: 'a', text: 'Sì, perché il gruppo può leggere.' },
        { id: 'b', text: 'No: seba non è owner né nel gruppo adm, quindi conta “other” = nessun permesso.' },
        { id: 'c', text: 'Sì, tutti possono leggere i file di root.' },
      ],
      correct: ['b'],
      explanation:
        'seba non è l’owner (root) e non è nel gruppo adm, quindi si applica il terzetto “other”, che qui è --- : nessun accesso. Il fatto che il gruppo possa leggere non aiuta chi nel gruppo non c’è.',
      skills: ['permissions'],
    },
    { id: 'b-bridge', kind: 'callout', variant: 'tip', title: 'Ora nel lab →', text: 'Apri il terminale del Live Lab. Sei l’utente seba. Inizia con `id`, `sudo -l`, e guarda `notes.txt` nella tua home.' },
  ],
  labSpecId: 'lab.foothold',
  exercises: ['ex.privesc.enum', 'ex.privesc.root'],
  recap: [
    'Permessi Unix: valutazione per classe, root esente.',
    'Enumerazione (sudo -l, SUID) prima dell’exploit.',
    'sudo find -exec → root; mitigazione: sudoers minimale e specifico.',
  ],
  furtherReading: [
    { title: 'GTFOBins', url: 'https://gtfobins.github.io/', note: 'Binari Unix e come abusarne.' },
  ],
};
