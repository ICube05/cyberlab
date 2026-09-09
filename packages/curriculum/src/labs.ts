import type { LabSpec } from '@cyberlab/core';

/**
 * Lab specifications.
 *
 * A `LabSpec` is the metadata; the *world* lives in a `TargetBuilder` in
 * @cyberlab/lab-engine, referenced here by `builderId`. The integrity checker
 * verifies every `builderId` resolves, so a lesson can never point at a lab
 * that does not exist.
 */
export const LABS: LabSpec[] = [
  {
    id: 'lab.vault',
    title: 'Vault — internal document portal',
    subtitle: 'Broken access control',
    kind: 'web',
    builderId: 'web.vault',
    scenario:
      'Ti è stato dato un account di test sul portale documentale interno "Vault". Il team di sviluppo sospetta che i controlli di autorizzazione non siano solidi dopo una vecchia migrazione. Il tuo compito è verificarlo — solo su questo laboratorio isolato.',
    target: {
      name: 'Vault Portal',
      description: 'Un portale PHP con login, sessioni server-side e profili utente.',
      host: 'vault.lab',
    },
    surfaces: ['request', 'browser', 'database', 'logs', 'editor', 'files'],
    initialState: [
      'Non autenticato.',
      'Ti viene fornito un account: seba / PrimaveraFredda!24.',
      'Il portale gira in HTTP sul laboratorio (nessuna rete reale).',
    ],
    credentials: [
      { label: 'Il tuo account di test', username: 'seba', password: 'PrimaveraFredda!24', note: 'user id 15' },
    ],
    seedable: true,
    notes: [
      'Tutto ciò che vedi è generato in locale e isolato. Nessuna richiesta lascia il laboratorio.',
      'La policy di autorizzazione è un vero file JSON che puoi leggere e modificare nel pannello editor.',
    ],
  },
  {
    id: 'lab.catalog',
    title: 'Catalog — product search & staff login',
    subtitle: 'SQL injection',
    kind: 'sql',
    builderId: 'web.injection',
    scenario:
      'Il negozio "Catalog" ha una ricerca prodotti e un login per lo staff. Entrambi costruiscono le query SQL concatenando l\'input. Dimostra l\'impatto — filtro aggirato, dati esfiltrati, autenticazione bypassata — e poi rendili sicuri.',
    target: {
      name: 'Catalog',
      description: 'Un\'app con ricerca e login che assembla SQL per concatenazione, su un vero database SQLite.',
      host: 'catalog.lab',
    },
    surfaces: ['request', 'browser', 'sql', 'database', 'logs'],
    initialState: [
      'La ricerca prodotti è pubblica.',
      'Esiste un login staff con un account admin dalla password sconosciuta.',
      'Una console SQL read-mostly è disponibile per enumerare lo schema.',
    ],
    seedable: true,
    notes: ['SQLite reale: le injection funzionano davvero, gli errori sono quelli veri di SQLite.'],
  },
  {
    id: 'lab.foothold',
    title: 'Foothold — unprivileged Linux host',
    subtitle: 'Privilege escalation',
    kind: 'shell',
    builderId: 'linux.foothold',
    scenario:
      'Sei atterrato su un host Linux come l\'utente non privilegiato "seba" (per esempio dopo aver ottenuto delle credenziali SSH in una fase precedente). Enumera il sistema, trova la configurazione errata e diventa root. Poi leggi /root/flag.txt.',
    target: {
      name: 'foothold',
      description: 'Un host Linux con un vero filesystem virtuale, permessi applicati e un percorso di escalation via sudo.',
      host: 'foothold.lab',
    },
    surfaces: ['terminal', 'files', 'logs'],
    initialState: [
      'Shell come utente "seba" (uid 1000).',
      '/root è 0700, /root/flag.txt è 0600 di root.',
      'Esiste una voce sudoers troppo permissiva — trovala con la giusta enumerazione.',
    ],
    seedable: true,
    notes: ['I permessi sono applicati davvero: cat /root/flag.txt fallisce finché non sei root.'],
  },
  {
    id: 'lab.helpdesk',
    title: 'Helpdesk — customer support portal',
    subtitle: 'XSS e path traversal',
    kind: 'web',
    builderId: 'web.helpdesk',
    scenario:
      'Il portale di assistenza "Helpdesk" ha una ricerca ticket, commenti pubblici e un download di allegati. Due difetti convivono: contenuto utente reso senza escape e un percorso di file costruito per concatenazione. Dimostrali — furto della sessione di un agente via XSS, lettura di file fuori dalla cartella allegati — poi rendili sicuri modificando config.json.',
    target: {
      name: 'Helpdesk',
      description:
        'Un portale di supporto che rende i commenti senza escape e serve gli allegati concatenando il nome file. La configurazione è un vero file JSON modificabile.',
      host: 'helpdesk.lab',
    },
    surfaces: ['request', 'browser', 'files', 'editor', 'logs'],
    initialState: [
      'La ricerca e i commenti sono pubblici, nessun login richiesto.',
      'Un agente di supporto apre i ticket poco dopo che ricevono un commento.',
      'Gli allegati si scaricano da /allegato?file=nome.txt.',
      'config.escapeOutput è false e config.confineAttachments è false.',
    ],
    seedable: true,
    notes: [
      'Tutto è locale e isolato. Nessuna richiesta lascia il laboratorio.',
      'La lettura degli allegati passa dallo stesso filesystem con permessi veri: giri come www-data.',
      'Le correzioni si applicano in /srv/helpdesk/config.json, dallo stesso pannello editor.',
    ],
  },
];

export const LAB_BY_ID: Map<string, LabSpec> = new Map(LABS.map((l) => [l.id, l]));
