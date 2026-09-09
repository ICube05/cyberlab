import type { Skill } from '@cyberlab/core';

/**
 * The skill graph.
 *
 * Skills are the durable axes the learner is measured on. They outlive lessons
 * and are shared across them — `http` is fed by the cookies lesson, the IDOR
 * lesson and the SSRF lesson alike. Keeping them in one flat, referenced list
 * (rather than nested under lessons) is what lets the mastery model and the
 * adaptive planner reason across the whole curriculum.
 */
export const SKILLS: Skill[] = [
  // Foundations
  { id: 'http', name: 'HTTP', domain: 'foundations', summary: 'Requests, responses, methods, status codes, headers.' },
  { id: 'cookies', name: 'Cookies & sessions', domain: 'foundations', summary: 'How stateless HTTP remembers who you are.', buildsOn: ['http'] },
  { id: 'tcpip', name: 'TCP/IP', domain: 'foundations', summary: 'Addressing, ports, the layered model.' },
  { id: 'dns', name: 'DNS', domain: 'foundations', summary: 'Name resolution and record types.', buildsOn: ['tcpip'] },
  { id: 'crypto-basics', name: 'Crypto fundamentals', domain: 'foundations', summary: 'Hashing, symmetric/asymmetric, signing.' },
  { id: 'encoding', name: 'Encoding', domain: 'foundations', summary: 'URL, base64, hex — and why encoding is not encryption.' },

  // Web
  { id: 'authn', name: 'Authentication', domain: 'web', summary: 'Proving who you are.', buildsOn: ['cookies'] },
  { id: 'authz', name: 'Authorization', domain: 'web', summary: 'Deciding what you may do.', buildsOn: ['authn'] },
  { id: 'access-control', name: 'Access control', domain: 'web', summary: 'Enforcing authorization on every object and action.', buildsOn: ['authz'] },
  { id: 'sqli', name: 'SQL injection', domain: 'web', summary: 'Breaking out of a query into the query language.', buildsOn: ['http'] },
  { id: 'sql', name: 'SQL', domain: 'web', summary: 'Reading and shaping relational data.' },
  { id: 'xss', name: 'Cross-site scripting', domain: 'web', summary: 'Getting the browser to run your script in someone else\'s page.', buildsOn: ['http', 'encoding'] },
  { id: 'csrf', name: 'CSRF', domain: 'web', summary: 'Making the victim\'s browser send a forged authenticated request.', buildsOn: ['cookies'] },
  { id: 'idor', name: 'IDOR', domain: 'web', summary: 'Reaching another user\'s object by changing an identifier.', buildsOn: ['access-control'] },
  { id: 'ssrf', name: 'SSRF', domain: 'web', summary: 'Making the server make requests for you.', buildsOn: ['http'] },
  { id: 'path-traversal', name: 'Path traversal', domain: 'web', summary: 'Escaping an intended directory.', buildsOn: ['http'] },
  { id: 'cmdi', name: 'Command injection', domain: 'web', summary: 'Breaking out of a shell command.', buildsOn: ['http'] },
  { id: 'file-upload', name: 'File upload', domain: 'web', summary: 'Validation, storage and execution of user-supplied files.', buildsOn: ['http'] },
  { id: 'jwt', name: 'JWT', domain: 'web', summary: 'Stateless signed tokens and how they fail.', buildsOn: ['crypto-basics', 'encoding'] },
  { id: 'api-security', name: 'API security', domain: 'web', summary: 'Authorization, rate limits and mass assignment on APIs.', buildsOn: ['access-control'] },
  { id: 'business-logic', name: 'Business logic flaws', domain: 'web', summary: 'Abuse that breaks no rule the code checks for.' },

  // Recon
  { id: 'passive-recon', name: 'Passive recon', domain: 'recon', summary: 'Learning about a target without touching it.' },
  { id: 'active-recon', name: 'Active recon', domain: 'recon', summary: 'Probing a target directly.', buildsOn: ['tcpip'] },
  { id: 'port-scanning', name: 'Port scanning', domain: 'recon', summary: 'Finding open services with Nmap.', buildsOn: ['tcpip'] },
  { id: 'enumeration', name: 'Service enumeration', domain: 'recon', summary: 'Turning open ports into named, versioned services.', buildsOn: ['active-recon'] },
  { id: 'content-discovery', name: 'Content discovery', domain: 'recon', summary: 'Finding hidden paths and endpoints.', buildsOn: ['http'] },

  // Pentest
  { id: 'methodology', name: 'Pentest methodology', domain: 'pentest', summary: 'Recon → enumerate → exploit → escalate → report.' },
  { id: 'exploitation', name: 'Exploitation', domain: 'pentest', summary: 'Turning a finding into access.' },
  { id: 'reporting', name: 'Reporting', domain: 'pentest', summary: 'Evidence, impact and remediation, written for the reader.' },

  // Linux
  { id: 'linux-fundamentals', name: 'Linux fundamentals', domain: 'linux', summary: 'Shell, filesystem, processes.' },
  { id: 'permissions', name: 'File permissions', domain: 'linux', summary: 'Owner/group/other rwx, and how it is evaluated.', buildsOn: ['linux-fundamentals'] },
  { id: 'linux-privesc', name: 'Linux privilege escalation', domain: 'linux', summary: 'From a shell to root via misconfiguration.', buildsOn: ['permissions'] },

  // Windows
  { id: 'windows-fundamentals', name: 'Windows internals', domain: 'windows', summary: 'Services, registry, tokens.' },
  { id: 'powershell', name: 'PowerShell', domain: 'windows', summary: 'The Windows automation and post-exploitation shell.' },
  { id: 'windows-privesc', name: 'Windows privilege escalation', domain: 'windows', summary: 'From user to SYSTEM.', buildsOn: ['windows-fundamentals'] },

  // Active Directory
  { id: 'ad-fundamentals', name: 'Active Directory basics', domain: 'ad', summary: 'Domains, users, groups, trusts.', buildsOn: ['windows-fundamentals'] },
  { id: 'kerberos', name: 'Kerberos', domain: 'ad', summary: 'Tickets, and the attacks against them.', buildsOn: ['ad-fundamentals'] },
  { id: 'ad-lateral', name: 'AD lateral movement', domain: 'ad', summary: 'Moving host to host inside a domain.', buildsOn: ['kerberos'] },

  // Reversing
  { id: 'assembly', name: 'Assembly', domain: 'reversing', summary: 'x86/x64 instructions, registers, the stack.' },
  { id: 'static-analysis', name: 'Static analysis', domain: 'reversing', summary: 'Understanding a binary without running it.', buildsOn: ['assembly'] },
  { id: 'dynamic-analysis', name: 'Dynamic analysis', domain: 'reversing', summary: 'Understanding a binary by running it under a debugger.', buildsOn: ['assembly'] },

  // Malware
  { id: 'malware-triage', name: 'Malware triage', domain: 'malware', summary: 'Fast classification and IOC extraction.', buildsOn: ['static-analysis'] },
  { id: 'ioc', name: 'Indicators of compromise', domain: 'malware', summary: 'The artefacts an intrusion leaves behind.' },

  // Red team
  { id: 'kill-chain', name: 'Kill chain', domain: 'redteam', summary: 'The stages of an intrusion, end to end.' },
  { id: 'initial-access', name: 'Initial access', domain: 'redteam', summary: 'The first foothold.' },
  { id: 'persistence', name: 'Persistence', domain: 'redteam', summary: 'Surviving a reboot and a password reset.' },
  { id: 'evasion', name: 'Evasion & OPSEC', domain: 'redteam', summary: 'Operating without being caught.' },

  // Blue team
  { id: 'log-analysis', name: 'Log analysis', domain: 'blueteam', summary: 'Reading what happened out of the record.' },
  { id: 'detection', name: 'Detection engineering', domain: 'blueteam', summary: 'Turning attacker behaviour into alerts.', buildsOn: ['log-analysis'] },
  { id: 'incident-response', name: 'Incident response', domain: 'blueteam', summary: 'Contain, eradicate, recover.', buildsOn: ['ioc'] },
  { id: 'threat-hunting', name: 'Threat hunting', domain: 'blueteam', summary: 'Looking for what the alerts missed.', buildsOn: ['detection'] },
  { id: 'hardening', name: 'Hardening', domain: 'blueteam', summary: 'Shrinking the attack surface before the attack.' },
];

export const SKILL_BY_ID: Map<string, Skill> = new Map(SKILLS.map((s) => [s.id, s]));
