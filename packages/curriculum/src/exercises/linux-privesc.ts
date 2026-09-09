import type { Exercise } from '@cyberlab/core';

export const linuxPrivescExercises: Exercise[] = [
  {
    id: 'ex.privesc.enum',
    lessonId: 'linux.privilege-escalation',
    labSpecId: 'lab.foothold',
    title: 'Enumera l’host',
    kind: 'guided',
    difficulty: 'beginner',
    estimatedMinutes: 8,
    mission: {
      context: 'Sei appena atterrato come seba su un host sconosciuto.',
      objective: 'Raccogli le informazioni che rivelano la via di escalation: chi sei, cosa puoi eseguire con sudo, e conferma che /root ti è precluso.',
      known: ['Utente: seba (uid 1000).'],
      scope: 'Solo il laboratorio Foothold isolato.',
    },
    objectives: [
      { id: 'o-sudo', label: 'Elenca i tuoi privilegi sudo', criteria: ['c-sudol'] },
      { id: 'o-denied', label: 'Conferma che /root/flag.txt è negato', criteria: ['c-denied'] },
    ],
    hints: [
      { id: 'h1', level: 1, text: 'Comincia con `sudo -l`: mostra cosa puoi eseguire come root senza password.', weightPenalty: 0.1 },
      { id: 'h2', level: 2, text: 'Prova `cat /root/flag.txt`: fallirà con Permission denied. Serve a stabilire la baseline “prima”.', weightPenalty: 0.2 },
    ],
    criteria: [
      {
        id: 'c-sudol',
        label: 'Privilegi sudo enumerati',
        weight: 1.5,
        required: true,
        rule: { type: 'shell', commandMatches: 'sudo\\s+-l' },
        feedback: 'Esegui `sudo -l` nel terminale.',
        dimensions: ['recognition'],
      },
      {
        id: 'c-denied',
        label: 'Accesso negato a /root confermato',
        weight: 1,
        rule: { type: 'signal', name: 'fs.read.denied', where: [{ path: 'path', matches: '/root' }] },
        feedback: 'Prova a leggere un file sotto /root da utente non privilegiato: deve essere negato.',
        dimensions: ['recognition'],
      },
    ],
    solution: {
      summary: 'sudo -l rivela il permesso su find; cat /root/flag.txt è negato.',
      steps: ['id', 'sudo -l', 'cat /root/flag.txt (Permission denied)', 'leggi ~/notes.txt'],
      explanation: 'L’enumerazione mostra che seba può eseguire /usr/bin/find come root senza password. Questa è la configurazione errata sfruttabile.',
    },
    skills: [
      { skillId: 'linux-fundamentals', dimension: 'recognition', weight: 1 },
      { skillId: 'linux-privesc', dimension: 'recognition', weight: 1.5 },
    ],
    xp: 50,
  },
  {
    id: 'ex.privesc.root',
    lessonId: 'linux.privilege-escalation',
    labSpecId: 'lab.foothold',
    title: 'Missione: diventa root',
    kind: 'mission',
    difficulty: 'intermediate',
    estimatedMinutes: 12,
    mission: {
      context: 'seba può eseguire find come root. find sa eseguire comandi.',
      objective: 'Sfrutta la voce sudo per leggere /root/flag.txt (che come seba non puoi leggere).',
      known: ['`sudo -l` mostra un permesso su /usr/bin/find.', 'La flag è in /root/flag.txt.'],
      scope: 'Solo il laboratorio Foothold isolato.',
    },
    objectives: [
      { id: 'o-exec', label: 'Esegui un comando come root via sudo', criteria: ['c-sudo-find'] },
      { id: 'o-flag', label: 'Leggi la flag da /root', criteria: ['c-flag'] },
    ],
    hints: [
      { id: 'h1', level: 1, text: 'find ha l’opzione -exec, che lancia un comando per ogni risultato.', weightPenalty: 0.1 },
      { id: 'h2', level: 2, text: 'Se lanci find come root e usi -exec, il comando gira come root.', weightPenalty: 0.25 },
      { id: 'h3', level: 3, text: 'Prova:  sudo find /root/flag.txt -exec cat {} \\;', weightPenalty: 0.4 },
    ],
    criteria: [
      {
        id: 'c-sudo-find',
        label: 'find eseguito come root con -exec',
        weight: 2,
        required: true,
        rule: { type: 'signal', name: 'privesc.sudo-find' },
        feedback: 'Usa `sudo find ... -exec ...`. È l’opzione -exec che ti dà l’esecuzione come root.',
        dimensions: ['exploitation'],
      },
      {
        id: 'c-flag',
        label: 'Flag di root letta',
        weight: 2,
        rule: { type: 'flag', value: 'CL{' },
        feedback: 'Fai leggere /root/flag.txt al comando eseguito come root.',
        dimensions: ['exploitation'],
      },
    ],
    solution: {
      summary: 'sudo find /root/flag.txt -exec cat {} \\;',
      steps: [
        'sudo -l → puoi eseguire /usr/bin/find come root',
        'sudo find /root/flag.txt -exec cat {} \\;',
        'find esegue cat come root; /root/flag.txt viene stampato',
      ],
      explanation:
        'find viene eseguito come root grazie alla voce sudoers. La sua opzione -exec lancia cat con gli stessi privilegi (root), e root può leggere /root/flag.txt, che al tuo utente era 0600 di proprietà di root.',
      mitigation:
        'Rimuovere la voce sudoers troppo ampia. Se serve davvero eseguire find come root, restringerla a percorsi specifici senza -exec, o usare uno script dedicato con input validato. Principio del minimo privilegio.',
    },
    skills: [
      { skillId: 'linux-privesc', dimension: 'exploitation', weight: 2.5 },
      { skillId: 'permissions', dimension: 'theory', weight: 1 },
    ],
    xp: 130,
  },
];
