import type { Difficulty, Lesson, Level, Module } from '@cyberlab/core';

/**
 * The full curriculum skeleton — all eleven levels of the brief.
 *
 * The roadmap is complete because a learner deserves to see the whole journey.
 * But it is *honest*: the three lessons that are genuinely interactive live in
 * their own files and are marked `ready`; every other lesson here is `planned`,
 * carries a real outline, and the UI renders it as a preview that cannot be
 * entered. Nothing pretends to be built that is not.
 */

interface PlannedSpec {
  id: string;
  title: string;
  subtitle?: string;
  difficulty?: Difficulty;
  minutes?: number;
  skills: string[];
  outline: string[];
  prerequisites?: string[];
}

function planned(moduleId: string, spec: PlannedSpec): Lesson {
  return {
    id: spec.id,
    moduleId,
    title: spec.title,
    ...(spec.subtitle ? { subtitle: spec.subtitle } : {}),
    status: 'planned',
    difficulty: spec.difficulty ?? 'beginner',
    estimatedMinutes: spec.minutes ?? 20,
    skills: spec.skills,
    prerequisites: spec.prerequisites ?? [],
    objectives: spec.outline.slice(0, 3),
    theory: [],
    exercises: [],
    outline: spec.outline,
  };
}

// ── Levels ───────────────────────────────────────────────────────────────────

export const LEVELS: Level[] = [
  { id: 'lvl.foundations', index: 0, title: 'Foundations', tagline: 'Come funziona davvero il web', summary: 'Internet, TCP/IP, DNS, HTTP, Linux, crittografia di base.', modules: ['mod.net-foundations', 'mod.web-foundations', 'mod.linux-foundations'], prerequisites: [], icon: 'foundation' },
  { id: 'lvl.web', index: 1, title: 'Web Security', tagline: 'Le vulnerabilità che dominano il web', summary: 'Access control, injection, XSS, CSRF, SSRF, JWT, logica di business.', modules: ['mod.web-access-control', 'mod.web-injection', 'mod.web-client', 'mod.web-advanced'], prerequisites: ['lvl.foundations'], icon: 'globe' },
  { id: 'lvl.recon', index: 2, title: 'Recon & Enumeration', tagline: 'Conosci il bersaglio', summary: 'OSINT, scanning, enumerazione di servizi e contenuti.', modules: ['mod.recon-passive', 'mod.recon-active'], prerequisites: ['lvl.foundations'], icon: 'search' },
  { id: 'lvl.pentest', index: 3, title: 'Pentesting', tagline: 'Il metodo', summary: 'Metodologia, exploitation, post-exploitation, reporting.', modules: ['mod.pentest-method'], prerequisites: ['lvl.web', 'lvl.recon'], icon: 'target' },
  { id: 'lvl.linux', index: 4, title: 'Linux', tagline: 'Padroneggia il sistema', summary: 'Internals, permessi, privilege escalation, misconfigurazioni.', modules: ['mod.linux-internals', 'mod.linux-privesc'], prerequisites: ['lvl.foundations'], icon: 'terminal' },
  { id: 'lvl.windows', index: 5, title: 'Windows', tagline: 'L’altro sistema operativo', summary: 'Internals, registro, token, PowerShell, privilege escalation.', modules: ['mod.windows-internals'], prerequisites: ['lvl.foundations'], icon: 'windows' },
  { id: 'lvl.ad', index: 6, title: 'Active Directory', tagline: 'Il cuore delle reti aziendali', summary: 'Domini, Kerberos, LDAP/SMB, attack path, lateral movement.', modules: ['mod.ad-basics', 'mod.ad-attacks'], prerequisites: ['lvl.windows'], icon: 'network' },
  { id: 'lvl.reversing', index: 7, title: 'Reverse Engineering', tagline: 'Capire il binario', summary: 'Assembly, PE/ELF, analisi statica e dinamica, Ghidra.', modules: ['mod.re-basics'], prerequisites: ['lvl.foundations'], icon: 'chip' },
  { id: 'lvl.malware', index: 8, title: 'Malware Analysis', tagline: 'Sezionare il codice ostile', summary: 'Ciclo di vita, IOC, analisi statica/dinamica, sandboxing.', modules: ['mod.malware-basics'], prerequisites: ['lvl.reversing'], icon: 'bug' },
  { id: 'lvl.redteam', index: 9, title: 'Red Team', tagline: 'L’operazione, dall’inizio alla fine', summary: 'Kill chain, initial access, C2, persistence, evasione, OPSEC.', modules: ['mod.redteam-ops'], prerequisites: ['lvl.pentest', 'lvl.ad'], icon: 'flag' },
  { id: 'lvl.blueteam', index: 10, title: 'Blue Team', tagline: 'Rilevare e rispondere', summary: 'Log, SIEM, detection, threat hunting, incident response, hardening.', modules: ['mod.blueteam-detect'], prerequisites: ['lvl.foundations'], icon: 'shield' },
];

// ── Modules ──────────────────────────────────────────────────────────────────

export const MODULES: Module[] = [
  // Level 0
  { id: 'mod.net-foundations', levelId: 'lvl.foundations', title: 'Reti', summary: 'Come i pacchetti trovano la strada.', lessons: ['found.how-internet-works', 'found.tcp-ip', 'found.dns', 'found.ports-sockets', 'found.nat-firewall'] },
  { id: 'mod.web-foundations', levelId: 'lvl.foundations', title: 'Web & crittografia', summary: 'HTTP, cookie, token, crypto di base.', lessons: ['found.http', 'found.crypto'], checkpoint: { id: 'chk.foundations', title: 'Checkpoint: Foundations', description: 'Dimostra di aver capito HTTP e il modello client/server.', requirements: [{ skillId: 'http', dimension: 'theory', min: 0.6 }] } },
  { id: 'mod.linux-foundations', levelId: 'lvl.foundations', title: 'Linux di base', summary: 'Shell, filesystem, processi, permessi.', lessons: ['found.linux-shell', 'found.linux-permissions'] },

  // Level 1 — Web (contains 2 ready lessons)
  { id: 'mod.web-access-control', levelId: 'lvl.web', title: 'Access Control', summary: 'Autenticazione, autorizzazione, IDOR.', lessons: ['found.http-cookies', 'web.broken-access-control'], checkpoint: { id: 'chk.access-control', title: 'Checkpoint: Access Control', description: 'Dimostra di saper trovare, sfruttare e correggere un broken access control.', requirements: [{ skillId: 'access-control', dimension: 'exploitation', min: 0.6 }, { skillId: 'access-control', dimension: 'mitigation', min: 0.5 }] } },
  { id: 'mod.web-injection', levelId: 'lvl.web', title: 'Injection', summary: 'SQL injection, command injection.', lessons: ['web.sql-injection', 'web.command-injection'], checkpoint: { id: 'chk.injection', title: 'Checkpoint: Injection', description: 'Bypassa un login e correggi la vulnerabilità con query parametrizzate.', requirements: [{ skillId: 'sqli', dimension: 'exploitation', min: 0.6 }, { skillId: 'sqli', dimension: 'mitigation', min: 0.5 }] } },
  { id: 'mod.web-client', levelId: 'lvl.web', title: 'Client-side', summary: 'XSS, CSRF.', lessons: ['web.xss', 'web.csrf'] },
  { id: 'mod.web-advanced', levelId: 'lvl.web', title: 'Avanzate', summary: 'SSRF, JWT, path traversal, API, logica di business.', lessons: ['web.ssrf', 'web.jwt', 'web.path-traversal', 'web.file-upload', 'web.business-logic'] },

  // Level 2 — Recon
  { id: 'mod.recon-passive', levelId: 'lvl.recon', title: 'Passiva', summary: 'OSINT senza toccare il target.', lessons: ['recon.passive', 'recon.dns-subdomains'] },
  { id: 'mod.recon-active', levelId: 'lvl.recon', title: 'Attiva', summary: 'Scanning ed enumerazione.', lessons: ['recon.nmap', 'recon.services', 'recon.content-discovery'] },

  // Level 3 — Pentest
  { id: 'mod.pentest-method', levelId: 'lvl.pentest', title: 'Metodologia', summary: 'Dal recon al report.', lessons: ['pentest.methodology', 'pentest.exploitation', 'pentest.post-exploitation', 'pentest.reporting'] },

  // Level 4 — Linux (contains 1 ready lesson)
  { id: 'mod.linux-internals', levelId: 'lvl.linux', title: 'Internals', summary: 'Processi, servizi, cron, sudo.', lessons: ['linux.processes', 'linux.sudo-cron'] },
  { id: 'mod.linux-privesc', levelId: 'lvl.linux', title: 'Privilege Escalation', summary: 'Da utente a root.', lessons: ['linux.privilege-escalation', 'linux.suid'], checkpoint: { id: 'chk.linux-privesc', title: 'Checkpoint: Linux PrivEsc', description: 'Ottieni root sfruttando una misconfigurazione, unassisted.', requirements: [{ skillId: 'linux-privesc', dimension: 'exploitation', min: 0.6 }] } },

  // Level 5 — Windows
  { id: 'mod.windows-internals', levelId: 'lvl.windows', title: 'Internals & PrivEsc', summary: 'Servizi, registro, token, PowerShell.', lessons: ['windows.internals', 'windows.powershell', 'windows.privesc'] },

  // Level 6 — AD
  { id: 'mod.ad-basics', levelId: 'lvl.ad', title: 'Fondamenti', summary: 'Domini, utenti, gruppi, Kerberos, LDAP, SMB.', lessons: ['ad.domains', 'ad.kerberos'] },
  { id: 'mod.ad-attacks', levelId: 'lvl.ad', title: 'Attacchi', summary: 'Enumerazione, attack path, lateral movement.', lessons: ['ad.enumeration', 'ad.attack-paths', 'ad.lateral'] },

  // Level 7 — Reversing
  { id: 'mod.re-basics', levelId: 'lvl.reversing', title: 'Fondamenti', summary: 'Assembly, PE/ELF, analisi.', lessons: ['re.assembly', 're.static', 're.dynamic'] },

  // Level 8 — Malware
  { id: 'mod.malware-basics', levelId: 'lvl.malware', title: 'Analisi', summary: 'Triage, IOC, comportamento.', lessons: ['malware.lifecycle', 'malware.static', 'malware.dynamic'] },

  // Level 9 — Red team
  { id: 'mod.redteam-ops', levelId: 'lvl.redteam', title: 'Operazioni', summary: 'Kill chain, C2, persistence, evasione.', lessons: ['redteam.kill-chain', 'redteam.initial-access', 'redteam.c2', 'redteam.persistence', 'redteam.evasion'] },

  // Level 10 — Blue team
  { id: 'mod.blueteam-detect', levelId: 'lvl.blueteam', title: 'Difesa', summary: 'Log, detection, hunting, IR, hardening.', lessons: ['blue.logs', 'blue.siem', 'blue.detection', 'blue.threat-hunting', 'blue.incident-response', 'blue.hardening'] },
];

// ── Planned lessons ──────────────────────────────────────────────────────────

export const PLANNED_LESSONS: Lesson[] = [
  // Foundations

  // Web
  planned('mod.web-advanced', { id: 'web.ssrf', title: 'SSRF', skills: ['ssrf'], difficulty: 'advanced', outline: ['Far fare richieste al server', 'Accesso a servizi interni e metadata cloud', 'Filtri e bypass', 'Mitigazione: allow-list'] }),
  planned('mod.web-advanced', { id: 'web.jwt', title: 'JWT & attacchi', skills: ['jwt'], difficulty: 'advanced', outline: ['Struttura header.payload.signature', 'alg=none e confusione di algoritmo', 'Chiavi deboli', 'Verifica corretta'] }),
  planned('mod.web-advanced', { id: 'web.path-traversal', title: 'Path Traversal', skills: ['path-traversal'], difficulty: 'intermediate', outline: ['../ e canonicalizzazione', 'Lettura di file arbitrari', 'Mitigazione'] }),
  planned('mod.web-advanced', { id: 'web.file-upload', title: 'File Upload insicuro', skills: ['business-logic'], difficulty: 'intermediate', outline: ['Validazione di tipo e contenuto', 'Esecuzione remota via upload', 'Storage sicuro'] }),
  planned('mod.web-advanced', { id: 'web.business-logic', title: 'Business Logic Flaws', skills: ['business-logic'], difficulty: 'advanced', outline: ['Abusi che non violano nessuna regola verificata', 'Race condition', 'Manipolazione di flussi multi-step'] }),

  // Recon
  planned('mod.recon-passive', { id: 'recon.passive', title: 'Ricognizione passiva', skills: ['passive-recon'], outline: ['OSINT e footprinting', 'Certificati, DNS storici', 'Fonti pubbliche'] }),
  planned('mod.recon-passive', { id: 'recon.dns-subdomains', title: 'DNS & sottodomini', skills: ['dns', 'passive-recon'], outline: ['Enumerazione di sottodomini', 'Zone transfer', 'Wildcard'] }),
  planned('mod.recon-active', { id: 'recon.nmap', title: 'Port scanning con Nmap', skills: ['port-scanning', 'active-recon'], difficulty: 'intermediate', outline: ['Tipi di scan', 'Timing e rilevabilità', 'Interpretare i risultati'] }),
  planned('mod.recon-active', { id: 'recon.services', title: 'Enumerazione servizi', skills: ['enumeration'], difficulty: 'intermediate', outline: ['Banner e versioni', 'Fingerprinting', 'Da porta a vettore'] }),
  planned('mod.recon-active', { id: 'recon.content-discovery', title: 'Content discovery', skills: ['content-discovery'], difficulty: 'intermediate', outline: ['Directory e file nascosti', 'Wordlist', 'Analisi delle risposte'] }),

  // Pentest
  planned('mod.pentest-method', { id: 'pentest.methodology', title: 'Metodologia', skills: ['methodology'], difficulty: 'intermediate', outline: ['Le fasi di un test', 'Attack surface', 'Gestione dello scope'] }),
  planned('mod.pentest-method', { id: 'pentest.exploitation', title: 'Exploitation', skills: ['exploitation'], difficulty: 'advanced', outline: ['Da vulnerabilità ad accesso', 'Affidabilità di un exploit', 'Chaining'] }),
  planned('mod.pentest-method', { id: 'pentest.post-exploitation', title: 'Post-exploitation', skills: ['exploitation', 'persistence'], difficulty: 'advanced', outline: ['Consolidare l’accesso', 'Raccolta di credenziali', 'Pivoting'] }),
  planned('mod.pentest-method', { id: 'pentest.reporting', title: 'Reporting', skills: ['reporting'], difficulty: 'intermediate', outline: ['Struttura di un report', 'Impatto e rischio', 'Remediation utile'] }),

  // Linux
  planned('mod.linux-internals', { id: 'linux.processes', title: 'Processi e servizi', skills: ['linux-fundamentals'], outline: ['Modello dei processi', 'systemd e servizi', 'Segnali'] }),
  planned('mod.linux-internals', { id: 'linux.sudo-cron', title: 'sudo, cron ed environment', skills: ['linux-fundamentals', 'permissions'], difficulty: 'intermediate', outline: ['sudoers', 'cron e i suoi rischi', 'Variabili d’ambiente pericolose'] }),
  planned('mod.linux-privesc', { id: 'linux.suid', title: 'SUID & capabilities', skills: ['linux-privesc'], difficulty: 'advanced', prerequisites: ['linux.privilege-escalation'], outline: ['Binari SUID', 'Linux capabilities', 'GTFOBins in pratica'] }),

  // Windows
  planned('mod.windows-internals', { id: 'windows.internals', title: 'Windows internals', skills: ['windows-fundamentals'], difficulty: 'intermediate', outline: ['Servizi e registro', 'Token e privilegi', 'ACL'] }),
  planned('mod.windows-internals', { id: 'windows.powershell', title: 'PowerShell', skills: ['powershell'], difficulty: 'intermediate', outline: ['Cmdlet e pipeline di oggetti', 'PowerShell per l’enumerazione', 'Logging e AMSI'] }),
  planned('mod.windows-internals', { id: 'windows.privesc', title: 'Windows Privilege Escalation', skills: ['windows-privesc'], difficulty: 'advanced', outline: ['Servizi mal configurati', 'Token impersonation', 'Da user a SYSTEM'] }),

  // AD
  planned('mod.ad-basics', { id: 'ad.domains', title: 'Domini, utenti, gruppi', skills: ['ad-fundamentals'], difficulty: 'intermediate', outline: ['Struttura di un dominio', 'LDAP e SMB', 'Relazioni di fiducia'] }),
  planned('mod.ad-basics', { id: 'ad.kerberos', title: 'Kerberos', skills: ['kerberos'], difficulty: 'advanced', outline: ['Ticket TGT e TGS', 'Kerberoasting (concetto)', 'AS-REP roasting (concetto)'] }),
  planned('mod.ad-attacks', { id: 'ad.enumeration', title: 'Enumerazione AD', skills: ['ad-fundamentals'], difficulty: 'advanced', outline: ['Concetti dietro BloodHound', 'Oggetti e ACL', 'Percorsi verso Domain Admin'] }),
  planned('mod.ad-attacks', { id: 'ad.attack-paths', title: 'Attack path', skills: ['ad-lateral'], difficulty: 'advanced', outline: ['Grafo di attacco', 'Diritti abusabili', 'Prioritizzazione'] }),
  planned('mod.ad-attacks', { id: 'ad.lateral', title: 'Lateral movement', skills: ['ad-lateral'], difficulty: 'advanced', outline: ['Pass-the-hash / ticket (concetto)', 'Movimento host-to-host', 'OPSEC'] }),

  // Reversing
  planned('mod.re-basics', { id: 're.assembly', title: 'Assembly x86/x64', skills: ['assembly'], difficulty: 'advanced', outline: ['Registri e stack', 'Istruzioni comuni', 'Convenzioni di chiamata'] }),
  planned('mod.re-basics', { id: 're.static', title: 'Analisi statica', skills: ['static-analysis'], difficulty: 'advanced', outline: ['PE/ELF', 'Disassembly con Ghidra', 'Riconoscere pattern'] }),
  planned('mod.re-basics', { id: 're.dynamic', title: 'Analisi dinamica', skills: ['dynamic-analysis'], difficulty: 'advanced', outline: ['Debugging con x64dbg/gdb', 'Breakpoint e watch', 'Patch runtime'] }),

  // Malware
  planned('mod.malware-basics', { id: 'malware.lifecycle', title: 'Ciclo di vita del malware', skills: ['malware-triage', 'ioc'], difficulty: 'intermediate', outline: ['Fasi di un’infezione', 'Persistenza', 'Comunicazione C2'] }),
  planned('mod.malware-basics', { id: 'malware.static', title: 'Analisi statica di malware', skills: ['static-analysis', 'ioc'], difficulty: 'advanced', outline: ['Stringhe e import', 'Packing', 'Estrazione di IOC'] }),
  planned('mod.malware-basics', { id: 'malware.dynamic', title: 'Analisi dinamica & sandbox', skills: ['dynamic-analysis', 'ioc'], difficulty: 'advanced', outline: ['Detonazione in sandbox', 'Comportamento su file/registro/rete', 'Isolamento'] }),

  // Red team
  planned('mod.redteam-ops', { id: 'redteam.kill-chain', title: 'La kill chain', skills: ['kill-chain'], difficulty: 'intermediate', outline: ['Le fasi di un’operazione', 'MITRE ATT&CK (panoramica)', 'Obiettivi vs rumore'] }),
  planned('mod.redteam-ops', { id: 'redteam.initial-access', title: 'Initial access', skills: ['initial-access'], difficulty: 'advanced', outline: ['Vettori d’ingresso', 'Payload e delivery (concetto)', 'Simulazione in lab'] }),
  planned('mod.redteam-ops', { id: 'redteam.c2', title: 'Command & Control', skills: ['evasion'], difficulty: 'advanced', outline: ['Concetti di C2', 'Canali e beacon', 'Rilevabilità'] }),
  planned('mod.redteam-ops', { id: 'redteam.persistence', title: 'Persistence', skills: ['persistence'], difficulty: 'advanced', outline: ['Meccanismi di persistenza', 'Trade-off OPSEC', 'Rilevamento'] }),
  planned('mod.redteam-ops', { id: 'redteam.evasion', title: 'Evasione & OPSEC', skills: ['evasion'], difficulty: 'advanced', outline: ['Ridurre gli artefatti', 'Log e telemetria', 'Disciplina operativa'] }),

  // Blue team
  planned('mod.blueteam-detect', { id: 'blue.logs', title: 'Log analysis', skills: ['log-analysis'], difficulty: 'intermediate', outline: ['Log Windows/Linux', 'Cosa registrano gli eventi chiave', 'Correlazione'] }),
  planned('mod.blueteam-detect', { id: 'blue.siem', title: 'Concetti SIEM', skills: ['log-analysis', 'detection'], difficulty: 'intermediate', outline: ['Ingestione e normalizzazione', 'Query e dashboard', 'Alert fatigue'] }),
  planned('mod.blueteam-detect', { id: 'blue.detection', title: 'Detection engineering', skills: ['detection'], difficulty: 'advanced', outline: ['Da TTP a regola', 'Sigma (concetto)', 'Falsi positivi'] }),
  planned('mod.blueteam-detect', { id: 'blue.threat-hunting', title: 'Threat hunting', skills: ['threat-hunting'], difficulty: 'advanced', outline: ['Ipotesi di caccia', 'Pivoting sui dati', 'Documentare i risultati'] }),
  planned('mod.blueteam-detect', { id: 'blue.incident-response', title: 'Incident response', skills: ['incident-response'], difficulty: 'advanced', outline: ['Contain, eradicate, recover', 'Catena di custodia', 'Lezioni apprese'] }),
  planned('mod.blueteam-detect', { id: 'blue.hardening', title: 'Hardening', skills: ['hardening'], difficulty: 'intermediate', outline: ['Ridurre la superficie', 'Baseline di configurazione', 'Difesa in profondità'] }),
];
