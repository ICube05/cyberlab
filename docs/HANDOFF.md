# Handoff — stato del lavoro e cosa resta

Questo documento è scritto per essere letto da chi riprende il lavoro (persona o
agente) senza avere il contesto della sessione precedente. Descrive cosa è stato
fatto, **perché** è stato fatto così, e cosa manca con abbastanza precisione da
poter essere ripreso subito.

---

## Come far partire il progetto

```bash
pnpm install
cp .env.example .env        # poi apri .env e metti la chiave
pnpm dev                    # backend + frontend insieme → http://localhost:5173
```

Verifiche prima di ogni commit:

```bash
pnpm typecheck              # tutti i package
pnpm test                   # vitest, 64 test
pnpm --filter @cyberlab/web build
```

### Il tutor AI

Il `.env` va nella **radice del workspace** (accanto a `pnpm-workspace.yaml`).
`AI_PROVIDER=gemini` da solo non basta: serve anche `GEMINI_API_KEY`. Se manca,
il server lo dice esplicitamente all'avvio e ripiega sul tutor offline — che non
è un guasto, risponde dalla pedagogia autoriale della lezione.

```
AI_PROVIDER=gemini
GEMINI_API_KEY=...          # https://aistudio.google.com/apikey
GEMINI_MODEL=gemini-2.5-flash
```

---

## Cosa è stato fatto in questa sessione

Cinque commit, ognuno autonomo e verificato.

### 1. `fix(config)` — il `.env` non veniva letto

**Causa:** `pnpm --filter <pkg> dev` esegue lo script con la directory del
package come cwd, quindi il backend partiva con `cwd = apps/server`. Tutto ciò
che era relativo a cwd finiva lì dentro: il `.env` di radice non veniva mai
trovato e il database di progresso veniva creato in
`apps/server/apps/server/data/` — cartella che era finita anche nel repo.

**Correzione:** `findWorkspaceRoot()` risale l'albero cercando
`pnpm-workspace.yaml`; `.env` e `CYBERLAB_DB` si risolvono rispetto a quella
radice. In più il provider AI viene risolto in modo onesto: chiedere `gemini`
senza chiave produce un avviso che dice cosa manca e dove metterlo, e un
provider configurato ma irraggiungibile ha il suo avviso separato.
`/api/health` espone `aiDetail`, `aiRequested` e `diagnostics`, così anche la UI
può spiegarsi (il chip "offline" del tutor ha il motivo nel tooltip).

### 2. `fix(lab)` — l'editor non salvava, e ora ha i colori IntelliJ

Erano **due** bug distinti:

- La UI decideva se un file fosse scrivibile dai **bit di permesso POSIX**, ma
  l'autorità è il *target*: il lab vault accetta solo `policy.json`, il catalog
  solo `config.json`. Quindi il pulsante Salva compariva anche su file che
  sarebbero sempre stati rifiutati. Ora `FsEntry` porta `writable` e
  `readOnlyReason`, e ogni target risponde per sé. Il target Linux (foothold) ha
  guadagnato una `write` vera che applica lo stesso controllo di permessi della
  sua shell.
- Un'azione rifiutata **non è un errore di trasporto**: il lab risponde 200 con
  un `result` di tipo `error`. Il vecchio handler faceva `if (res.result.type
  !== 'error')` e poi non faceva nulla in caso di errore, quindi un rifiuto era
  indistinguibile da un no-op silenzioso. Ora il motivo viene mostrato sotto il
  codice e resta lì finché non lo correggi.

L'editor è nuovo: `apps/web/src/components/lab/CodeEditor.tsx`, textarea
trasparente sopra un livello colorato, tema Darcula (`apps/web/src/syntax.ts`),
gutter con numeri di riga, riga corrente evidenziata, parentesi e virgolette
auto-chiuse, Tab/Shift-Tab sulla selezione, `⌘/Ctrl+/` per commentare,
`⌘/Ctrl+S` per salvare. Il tokenizer sostituisce il vecchio colorizzatore che
spezzava sulle keyword e coloriva le parole chiave *dentro le stringhe*; ora è
condiviso anche dai blocchi di codice delle lezioni.

### 3. `feat(ui)` — uscita dalla missione, pannelli collassabili

- Una missione avviata si poteva lasciare solo inviandola: aprire quella
  sbagliata significava un tentativo fallito a curriculum. Ora c'è l'uscita
  nella barra della missione e accanto a Invia, più "torna alle missioni" dopo
  il risultato. È un abbandono reale: `DELETE /api/attempts/:id` chiude il
  tentativo senza valutazione (non tocca la mastery) e libera il lab
  dall'anteprima degli obiettivi. La conferma viene chiesta solo se hai già
  fatto progressi.
- Il tutor si comprime dal suo stesso header e lascia una barra verticale per
  riaprirlo.
- I pulsanti della activity rail ora fanno toggle (cliccare quello attivo
  chiude), la roadmap ha "comprimi tutto" e "nascondi". Gli stati dei pannelli
  sono persistiti in `localStorage`.

### 4. `feat(content)` — blocchi cookie e JWT, completamento delle lezioni teoriche

`cookie-jar` e `jwt` esistevano nel modello dei contenuti ma renderizzavano un
segnaposto. Ora sono reali: il cookie playground applica le regole vere
(Secure/SameSite/HttpOnly) e dice quale attributo ha deciso; il JWT inspector
ricalcola davvero HMAC-SHA256 con Web Crypto, quindi modificare il payload rende
la firma non valida e `alg: none` mostra il bypass.

Inoltre: una lezione senza esercizi non poteva **mai** arrivare a `completed`
(la condizione era "tutti gli esercizi superati"), quindi avrebbe bloccato per
sempre le lezioni che la elencano come prerequisito. Ora una lezione senza
missioni si completa quando tutti i blocchi sono stati visti e tutti i quiz
inline risposti correttamente.

### 5. `feat(curriculum)` — tutto il livello Foundations

Dieci lezioni scritte per intero in `packages/curriculum/src/lessons/`:

| Modulo | Lezioni |
| --- | --- |
| Reti | `how-internet-works`, `tcp-ip`, `dns`, `ports-sockets`, `nat-firewall` |
| Web & crypto | `http`, `crypto` |
| Linux | `linux-shell`, `linux-permissions` |
| Access control | `http-cookies` |

Sono marcate `theory-only`: teoria autoriale e blocchi interattivi, senza
laboratorio. Roadmap, intestazione della lezione e status bar distinguono ora i
tre stati (`ready` / `theory-only` / `planned`) invece di riportare solo "3
live".

Stato attuale: **58 lezioni — 3 con lab, 10 di teoria, 45 pianificate.**

---

## Cosa resta da fare

### A. Web Security — 8 lezioni ancora `planned`

È il blocco più importante. Le lezioni da scrivere, nell'ordine consigliato:

| id | modulo | note |
| --- | --- | --- |
| `web.command-injection` | `mod.web-injection` | gemella di SQLi: input che finisce in una shell |
| `web.xss` | `mod.web-client` | reflected / stored / DOM, contesti di output, CSP |
| `web.csrf` | `mod.web-client` | si appoggia al cookie-jar già scritto in `http-cookies` |
| `web.ssrf` | `mod.web-advanced` | richiama `found.ports-sockets` (servizi su loopback) |
| `web.jwt` | `mod.web-advanced` | **usa il blocco `jwt` già implementato**: alg none, segreto debole |
| `web.path-traversal` | `mod.web-advanced` | richiama `found.linux-permissions` |
| `web.file-upload` | `mod.web-advanced` | validazione del tipo, esecuzione, storage |
| `web.business-logic` | `mod.web-advanced` | prezzi negativi, race, salti di stato |

**Come si scrivono.** Prendere come modello
`packages/curriculum/src/lessons/foundations/http.ts` (la più completa) e
`.../linux-permissions.ts` (usa un blocco interattivo). Il pattern:

1. nuovo file in `packages/curriculum/src/lessons/web/<nome>.ts`;
2. esportare un `Lesson` con `status: 'theory-only'`, obiettivi, `theory[]`,
   `recap`, `furtherReading`, `exercises: []`;
3. importarlo in `packages/curriculum/src/index.ts` e aggiungerlo a
   `THEORY_LESSONS`;
4. **rimuovere la riga `planned(...)` corrispondente** da
   `packages/curriculum/src/roadmap.ts` (altrimenti id duplicato → il controllo
   di integrità fallisce all'avvio, ed è voluto);
5. `pnpm typecheck && pnpm test`, poi commit.

Regole di contenuto da rispettare, sono ciò che rende buone le lezioni già
scritte:

- ogni id di blocco è unico dentro la lezione;
- almeno un quiz per lezione (serve anche al completamento) con `skills` valorizzato,
  e una `explanation` che insegni qualcosa anche a chi ha risposto giusto;
- alternare prosa e blocchi: `flow`, `sequence`, `comparison`, `table`,
  `timeline`, `keypoints`, `callout`, `code` con `annotations`;
- ogni lezione offensiva ha un `callout` `variant: 'legal'` o una nota di scope;
- collegare in avanti e indietro ("questo tornerà nel livello X"), non lezioni
  isolate;
- i tipi di skill devono esistere in `packages/curriculum/src/skills.ts`;
- italiano, seconda persona, niente elenchi di comandi senza il perché.

### B. Rendere `ready` alcune lezioni web (nuovo target di lab)

Le lezioni sopra restano `theory-only` finché non hanno un laboratorio. Il passo
più prezioso è **un nuovo target multi-vulnerabilità** in
`packages/lab-engine/src/inproc/targets/` — per esempio `webapp.ts` — che copra
XSS riflesso e stored, CSRF, path traversal e un endpoint SSRF verso un servizio
interno su loopback.

Riferimenti da leggere prima: `targets/vault.ts` (il più completo: HTTP,
sessioni, policy modificabile, segnali) e `packages/core/src/lab.ts` per il
contratto `LabTarget`. Poi:

1. registrare lo spec in `packages/curriculum/src/labs.ts`;
2. registrare il builder in `targets/index.ts`;
3. scrivere gli esercizi in `packages/curriculum/src/exercises/<nome>.ts` con i
   criteri espressi nella regola DSL (`packages/core/src/exercise.ts`) — usare
   preferibilmente regole `signal`, che sono la prova più forte: è il target a
   dichiarare che la vulnerabilità è stata sfruttata, non il client;
4. passare la lezione a `status: 'ready'`, con `labSpecId` ed `exercises`;
5. aggiungere test in `packages/lab-engine/src/__tests__/labs.test.ts`.

Vincolo di onestà, già applicato in tutto il progetto: una lezione è `ready`
solo se il lab esiste e gli esercizi sono valutabili davvero. Il controllo di
integrità lo verifica all'avvio e fallisce se non è così.

### C. Push su GitHub

I commit sono già scritti in locale. Dalla macchina dell'utente:

```bash
git remote -v                       # deve puntare a github.com/ICube05/cyberlab
git push origin main
```

(Nella sessione cloud il push era bloccato dal proxy, non da GitHub: il repo non
era nell'elenco autorizzato della sessione.)

---

## Mappa rapida del codice

```
packages/core         modello di dominio puro: contenuti, esercizi, regole,
                      valutazione, mastery, progressione. Nessun I/O.
packages/curriculum   il contenuto: skill, roadmap, lezioni, esercizi, lab spec.
packages/lab-engine   i laboratori: VFS con permessi veri, motore SQL, HTTP,
                      shell, e i target.
packages/ai           il tutor: provider (ollama, gemini, offline), prompt,
                      assemblaggio del contesto.
apps/server           Fastify, SQLite, rotte, composizione dei servizi.
apps/web              React: shell IDE, renderer dei blocchi, pannelli lab.
```

Due invarianti che vale la pena non rompere:

- **Il server è l'autorità.** Il browser manda *azioni*, mai risultati: non può
  dichiarare di aver catturato una flag, può solo chiedere al lab di eseguire
  qualcosa. La valutazione gira sul server sul transcript reale.
- **Il contenuto è dato, non HTML.** Le lezioni sono blocchi tipizzati, così il
  renderer possiede la tipografia e il tutor può ricevere esattamente il blocco
  che stai guardando.
