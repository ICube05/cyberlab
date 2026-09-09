import type { FsEntry, LabInspectView, LabSpec, LabSurface } from '@cyberlab/core';
import {
  Router,
  escapeHtml,
  html,
  raw,
  text,
  tpl,
  type TargetHttpRequest,
  type TargetHttpResponse,
  formBodyProblem,
} from '../http.js';
import { Vfs, type User } from '../vfs.js';
import type { LabTarget, TargetBuilder, TargetContext } from '../target.js';

/**
 * "Helpdesk" — a customer support portal with two real, independent bugs.
 *
 * It exists because two lessons needed a lab and neither deserved a scripted
 * one. Both vulnerabilities here are genuine properties of the code path:
 *
 *  - **XSS.** Ticket comments and the search box are rendered into the page
 *    without escaping, because `config.json` says `escapeOutput: false`. Flip
 *    that field in the lab's editor and the *same* handler escapes instead —
 *    the fix is real, not a second branch pretending to be one.
 *  - **Path traversal.** `/allegato` concatenates the requested filename onto
 *    the attachment directory and resolves the result. Reads then go through
 *    the same `Vfs` the Linux labs use, with real owner/group/mode checks as
 *    `www-data`. That is why `/etc/passwd` comes back and `/etc/shadow` does
 *    not: nothing special-cases them, the permission bits decide.
 *
 * The one simulation is the support agent. A lab has no browser, so instead of
 * pretending to execute JavaScript the target inspects the markup it just
 * produced and asks a narrow, honest question: does the response contain, in
 * executable position, something that came from user input? When the answer is
 * yes on the page the agent opens, it says so and hands over the session the
 * payload would have stolen. The learner still has to *use* that session to
 * reach /staff, which is a real request against a real check.
 */

/** The identity the web server runs as. Everything it reads is read as this. */
const WWW_DATA: User = { name: 'www-data', uid: 33, groups: ['www-data'], home: '/var/www' };

interface Ticket {
  id: number;
  title: string;
  body: string;
  author: string;
  status: string;
}

interface Comment {
  id: number;
  ticketId: number;
  author: string;
  body: string;
  at: number;
}

interface HelpdeskConfig {
  /** When true, user content is HTML-escaped on output. The XSS fix. */
  escapeOutput: boolean;
  /** Directory attachments are served from. */
  attachmentRoot: string;
  /** When true, the resolved attachment path must stay inside the root. */
  confineAttachments: boolean;
}

interface HelpdeskState {
  tickets: Ticket[];
  comments: Comment[];
  nextCommentId: number;
  config: HelpdeskConfig;
  configSource: string;
  agentSession: string;
  agentName: string;
  staffFlag: string;
  envFlag: string;
}

const DEFAULT_CONFIG_SOURCE = `{
  "escapeOutput": false,
  "attachmentRoot": "/srv/helpdesk/allegati",
  "confineAttachments": false,

  "_note": "escapeOutput e' stato disattivato nel 2021 per far passare l'HTML nelle firme degli agenti. confineAttachments non e' mai stato attivato."
}`;

const CERCA_SOURCE = `<?php
// helpdesk/cerca.php — ricerca ticket
$q = $_GET['q'] ?? '';

$risultati = cerca_ticket($q);

// render_user_content() applica htmlspecialchars() SOLO se
// config.escapeOutput e' true. Ora e' false.
echo '<p>Risultati per: ' . render_user_content($q) . '</p>';
`;

const ALLEGATO_SOURCE = `<?php
// helpdesk/allegato.php — download allegati
$file = $_GET['file'] ?? '';

// Concatenazione diretta: nessuna canonicalizzazione.
$percorso = $config['attachmentRoot'] . '/' . $file;

// Se confineAttachments fosse true, qui ci sarebbe il
// controllo del prefisso sul percorso REALE risolto.
readfile($percorso);
`;

class HelpdeskTarget implements LabTarget {
  readonly surfaces: readonly LabSurface[] = ['request', 'browser', 'files', 'editor', 'logs'];

  #vfs: Vfs;
  #state: HelpdeskState;
  #router: Router<TargetContext>;

  constructor(_spec: LabSpec, ctx: TargetContext) {
    const envFlag = `CL{traversal_${ctx.rng.token(10)}}`;
    const staffFlag = `CL{xss_${ctx.rng.token(10)}}`;
    const agentName = ctx.rng.pick(['g.ferrari', 'm.rossi', 'd.marino', 'c.esposito']);

    this.#state = {
      tickets: [
        { id: 4101, title: 'Non riesco ad accedere al portale', body: 'Da stamattina il login mi dice credenziali errate.', author: 'cliente.rossi', status: 'aperto' },
        { id: 4102, title: 'Fattura di marzo sbagliata', body: 'La fattura riporta un importo diverso dall’ordine.', author: 'cliente.bianchi', status: 'aperto' },
        { id: 4103, title: 'Richiesta di reso', body: 'Vorrei restituire l’articolo ricevuto la settimana scorsa.', author: 'cliente.greco', status: 'in lavorazione' },
      ],
      comments: [
        { id: 1, ticketId: 4101, author: agentName, body: 'Buongiorno, ho resettato la password. Provi ora.', at: 0 },
        { id: 2, ticketId: 4101, author: 'cliente.rossi', body: 'Grazie, ora funziona.', at: 0 },
      ],
      nextCommentId: 3,
      config: JSON.parse(stripNotes(DEFAULT_CONFIG_SOURCE)) as HelpdeskConfig,
      configSource: DEFAULT_CONFIG_SOURCE,
      agentSession: `sess_${ctx.rng.token(20)}`,
      agentName,
      staffFlag,
      envFlag,
    };

    this.#vfs = buildFilesystem(this.#state, envFlag);
    this.#router = buildRouter(this);
    ctx.log('info', 'helpdesk', 'Helpdesk avviato', {
      escapeOutput: this.#state.config.escapeOutput,
      confineAttachments: this.#state.config.confineAttachments,
    });
  }

  get state(): HelpdeskState {
    return this.#state;
  }

  get vfs(): Vfs {
    return this.#vfs;
  }

  /**
   * The single output path for anything the user supplied.
   *
   * Both the escaping fix and the XSS signal live here, so there is exactly one
   * place in the target where "user content becomes markup" — and the lesson
   * can point at it.
   */
  renderUserContent(
    value: string,
    ctx: TargetContext,
    where: 'reflected' | 'stored',
    meta: Record<string, unknown> = {},
  ): string {
    const executable = isExecutablePayload(value);
    if (this.#state.config.escapeOutput) {
      if (executable) {
        ctx.signal('xss.payload.neutralised', { where, ...meta });
        ctx.log('info', 'render', 'Payload eseguibile neutralizzato da escapeOutput', { where });
      }
      return escapeHtml(value);
    }
    if (executable) {
      ctx.signal(`xss.${where}.executed`, { payload: value.slice(0, 200), ...meta });
      ctx.log('warn', 'render', `Contenuto utente inserito come markup (${where}): il browser lo eseguirebbe`, {
        payload: value.slice(0, 120),
      });
    }
    return value;
  }

  /**
   * Resolve an attachment request the way the vulnerable code does: concatenate,
   * then let the filesystem normalise. `escaped` records whether the result left
   * the configured root — which is exactly what the fix checks.
   */
  resolveAttachment(file: string): { resolved: string; escaped: boolean } {
    const root = normalizePath(this.#state.config.attachmentRoot);
    const resolved = normalizePath(`${root}/${file}`);
    const escaped = resolved !== root && !resolved.startsWith(`${root}/`);
    return { resolved, escaped };
  }

  // ── LabTarget surface ────────────────────────────────────────────────────

  http(req: TargetHttpRequest, ctx: TargetContext): TargetHttpResponse {
    ctx.log('info', 'http', `${req.method} ${req.path}`);
    const response = this.#router.handle(req, ctx);
    if (response) return response;
    return html(page('404', tpl`<div class="card"><h1>404</h1><p>Nessuna pagina per <code>${req.pathname}</code>.</p></div>`), {
      status: 404,
    });
  }

  files = {
    list: (path: string): FsEntry[] => {
      const prefix = path.endsWith('/') ? path : `${path}/`;
      return this.#curatedFiles().filter((entry) => entry.path === path || entry.path.startsWith(prefix));
    },
    read: (path: string): string => {
      // The file panel is a source/config view, deliberately curated: it does
      // not expose .env or /etc. Those are reachable only through the
      // /allegato traversal, which is the point of the exercise.
      const norm = normalizePath(path);
      if (!this.#curatedFiles().some((e) => e.path === norm)) {
        throw new Error(`${path} non è esposto nel pannello file. Gli allegati si leggono da /allegato.`);
      }
      const node = this.#vfs.lookup(norm);
      if (!node || node.type === 'dir') throw new Error(`Nessun file: ${path}`);
      return node.content ?? '';
    },
    write: (path: string, content: string, ctx: TargetContext): void => {
      if (normalizePath(path) !== '/srv/helpdesk/config.json') {
        throw new Error(`${path} è in sola lettura in questo laboratorio. Solo config.json è modificabile.`);
      }
      let parsed: HelpdeskConfig;
      try {
        parsed = JSON.parse(stripNotes(content)) as HelpdeskConfig;
      } catch (error) {
        ctx.signal('config.invalid', { error: String(error) });
        throw new Error(`config.json non è JSON valido: ${String(error)}`);
      }
      if (!parsed || typeof parsed !== 'object' || typeof parsed.attachmentRoot !== 'string') {
        ctx.signal('config.invalid', { error: 'attachmentRoot mancante' });
        throw new Error('config.json deve contenere almeno "attachmentRoot".');
      }
      const before = this.#state.config;
      this.#state.config = {
        escapeOutput: Boolean(parsed.escapeOutput),
        attachmentRoot: parsed.attachmentRoot,
        confineAttachments: Boolean(parsed.confineAttachments),
      };
      this.#state.configSource = content;
      this.#vfs.writeFile('/srv/helpdesk/config.json', content, {
        mode: 0o664,
        owner: 'www-data',
        group: 'www-data',
      });
      ctx.signal('config.updated', {
        escapeOutputBefore: before.escapeOutput,
        escapeOutput: this.#state.config.escapeOutput,
        confineAttachmentsBefore: before.confineAttachments,
        confineAttachments: this.#state.config.confineAttachments,
      });
      ctx.log('info', 'config', 'Configurazione ricaricata', {
        escapeOutput: this.#state.config.escapeOutput,
        confineAttachments: this.#state.config.confineAttachments,
      });
    },
  };

  #decorate(entry: FsEntry): FsEntry {
    const editable = entry.path === '/srv/helpdesk/config.json';
    return {
      ...entry,
      writable: editable,
      ...(editable
        ? {}
        : { readOnlyReason: 'Sorgente di riferimento. Le correzioni si applicano in config.json.' }),
    };
  }

  /** What the file panel shows: sources and the editable config, nothing else. */
  #curatedFiles(): FsEntry[] {
    const paths = [
      '/srv/helpdesk',
      '/srv/helpdesk/config.json',
      '/srv/helpdesk/app',
      '/srv/helpdesk/app/cerca.php',
      '/srv/helpdesk/app/allegato.php',
    ];
    const out: FsEntry[] = [];
    for (const path of paths) {
      const entry = this.#vfs.entry(path);
      if (entry) out.push(this.#decorate(entry));
    }
    return out;
  }

  inspect(what: 'database' | 'sessions' | 'logs' | 'files'): LabInspectView {
    switch (what) {
      case 'database':
        return {
          kind: 'database',
          tables: [
            {
              name: 'tickets',
              columns: ['id', 'title', 'author', 'status'],
              rows: this.#state.tickets.map((t) => [t.id, t.title, t.author, t.status]),
            },
            {
              name: 'comments',
              columns: ['id', 'ticket_id', 'author', 'body'],
              rows: this.#state.comments.map((c) => [c.id, c.ticketId, c.author, c.body]),
            },
          ],
        };
      case 'sessions':
        return {
          kind: 'sessions',
          sessions: [
            {
              id: this.#state.agentSession,
              userId: 'agent',
              username: this.#state.agentName,
              createdAt: 0,
              data: { role: 'support-agent', note: 'Sessione dell’agente. Non ti è stata data.' },
            },
          ],
        };
      case 'logs':
        return { kind: 'logs', entries: [] };
      case 'files':
        return { kind: 'files', root: this.#curatedFiles() };
    }
  }

  serialize(): unknown {
    return { vfs: this.#vfs.serialize(), state: this.#state };
  }

  deserialize(data: unknown): void {
    const parsed = data as { vfs: unknown; state: HelpdeskState };
    this.#vfs = Vfs.deserialize(parsed.vfs);
    this.#state = parsed.state;
  }
}

// ── routes ───────────────────────────────────────────────────────────────────

function buildRouter(target: HelpdeskTarget): Router<TargetContext> {
  const router = new Router<TargetContext>();
  const state = () => target.state;

  router.get('/', () =>
    html(
      page(
        'Helpdesk',
        tpl`
        <div class="card">
          <h1>Assistenza clienti</h1>
          <form method="GET" action="/cerca">
            <label>Cerca fra i ticket <input name="q" placeholder="parola chiave" /></label>
            <button type="submit">Cerca</button>
          </form>
          <ul class="list">
            ${raw(
              state()
                .tickets.map(
                  (t) =>
                    `<li><a href="/ticket?id=${t.id}">#${t.id} — ${escapeHtml(t.title)}</a> <span class="tag">${escapeHtml(t.status)}</span></li>`,
                )
                .join(''),
            )}
          </ul>
          <p class="muted">Gli allegati si scaricano da <code>/allegato?file=nome.txt</code>.</p>
        </div>`,
      ),
    ),
  );

  // ── Reflected XSS ────────────────────────────────────────────────────────
  router.get('/cerca', (req, ctx) => {
    const q = req.query['q'] ?? '';
    const matches = state().tickets.filter(
      (t) => q && (t.title.toLowerCase().includes(q.toLowerCase()) || t.body.toLowerCase().includes(q.toLowerCase())),
    );
    const rendered = target.renderUserContent(q, ctx, 'reflected', { path: '/cerca' });
    return html(
      page(
        'Ricerca',
        tpl`
        <div class="card">
          <h1>Ricerca</h1>
          <p>Risultati per: ${raw(rendered)}</p>
          <ul class="list">
            ${raw(
              matches.map((t) => `<li><a href="/ticket?id=${t.id}">#${t.id} — ${escapeHtml(t.title)}</a></li>`).join('') ||
                '<li class="muted">Nessun ticket corrispondente.</li>',
            )}
          </ul>
        </div>`,
      ),
      {
        serverNotes: [
          `Il parametro q è stato inserito nella pagina ${state().config.escapeOutput ? 'dopo htmlspecialchars()' : 'senza alcun escape'}.`,
          `config.escapeOutput = ${String(state().config.escapeOutput)} (modificabile in /srv/helpdesk/config.json).`,
        ],
      },
    );
  });

  // ── Ticket + stored comments ─────────────────────────────────────────────
  router.get('/ticket', (req, ctx) => {
    const id = Number(req.query['id']);
    const ticket = state().tickets.find((t) => t.id === id);
    if (!ticket) return html(page('Ticket', tpl`<div class="card"><p class="error">Ticket inesistente.</p></div>`), { status: 404 });

    const comments = state().comments.filter((c) => c.ticketId === id);
    const body = comments
      .map(
        (c) =>
          `<li><strong>${escapeHtml(c.author)}</strong>: ${target.renderUserContent(c.body, ctx, 'stored', {
            ticketId: id,
            commentId: c.id,
            viewer: 'cliente',
          })}</li>`,
      )
      .join('');

    return html(
      page(
        `Ticket #${ticket.id}`,
        tpl`
        <div class="card">
          <h1>#${ticket.id} — ${ticket.title}</h1>
          <p>${ticket.body}</p>
          <ul class="list">${raw(body)}</ul>
          <form method="POST" action="/commento">
            <input type="hidden" name="id" value="${String(ticket.id)}" />
            <label>Nome <input name="autore" value="cliente" /></label>
            <label>Commento <input name="testo" /></label>
            <button type="submit">Invia</button>
          </form>
        </div>`,
      ),
    );
  });

  router.post('/commento', (req, ctx) => {
    // Say when the body was not readable as a form, instead of reporting a
    // missing ticket: the ticket is usually there, the encoding is not.
    const problem = formBodyProblem(req);
    if (problem) {
      return html(
        page('Commento', tpl`<div class="card"><p class="error">Commento non salvato.</p><p>${problem}</p></div>`),
        { status: 400, serverNotes: [problem] },
      );
    }

    const id = Number(req.form['id']);
    const ticket = state().tickets.find((t) => t.id === id);
    if (!ticket) {
      const known = state().tickets.map((t) => `#${t.id}`).join(', ');
      return html(
        page('Errore', tpl`<div class="card"><p class="error">Ticket inesistente.</p><p class="muted">Ticket presenti: ${known}</p></div>`),
        { status: 404, serverNotes: [`Nessun ticket con id "${req.form['id'] ?? ''}". Presenti: ${known}.`] },
      );
    }

    const author = req.form['autore'] ?? 'anonimo';
    const bodyText = req.form['testo'] ?? '';
    const comment: Comment = {
      id: state().nextCommentId++,
      ticketId: id,
      author,
      body: bodyText,
      at: ctx.now(),
    };
    state().comments.push(comment);

    const notes = [`Commento #${comment.id} salvato sul ticket ${id}, così com'è stato inviato.`];
    if (isExecutablePayload(bodyText)) {
      ctx.signal('xss.stored.persisted', { ticketId: id, commentId: comment.id });
      ctx.log('warn', 'helpdesk', 'Salvato un commento che contiene markup eseguibile', { commentId: comment.id });
    }

    // The support agent opens new tickets shortly after they are updated. The
    // target re-renders the page as the agent would receive it and reports,
    // honestly, whether the markup it produced contains something executable
    // that came from user input.
    const agentView = state()
      .comments.filter((c) => c.ticketId === id)
      .map((c) => target.renderUserContent(c.body, ctx, 'stored', { ticketId: id, commentId: c.id, viewer: 'agente' }))
      .join('\n');
    notes.push(`Simulazione: l'agente ${state().agentName} ha aperto il ticket #${id}.`);
    if (!state().config.escapeOutput && isExecutablePayload(agentView)) {
      ctx.signal('xss.agent.session.exposed', { ticketId: id, session: state().agentSession });
      ctx.log('error', 'helpdesk', 'Il markup servito all’agente contiene uno script proveniente dai commenti', {
        session: state().agentSession,
      });
      notes.push(
        `Il tuo script è stato eseguito nella sessione dell'agente. Ha raccolto: session=${state().agentSession}`,
        'Un cookie HttpOnly non sarebbe stato leggibile — ma le azioni sarebbero comunque partite dalla sua pagina.',
      );
    }

    return html(
      page(
        'Commento inviato',
        tpl`<div class="card"><p>Commento aggiunto al ticket #${String(id)}.</p><p><a href="/ticket?id=${String(id)}">Torna al ticket</a></p></div>`,
      ),
      { serverNotes: notes },
    );
  });

  // ── Staff area, reachable with the agent's session ───────────────────────
  router.get('/staff', (req, ctx) => {
    const token = req.cookies['session'];
    if (token !== state().agentSession) {
      ctx.signal('staff.area.denied', { hadCookie: Boolean(token) });
      return html(
        page('Area staff', tpl`<div class="card"><p class="error">403 — area riservata agli agenti di supporto.</p></div>`),
        { status: 403 },
      );
    }
    ctx.signal('staff.area.reached', { as: state().agentName });
    ctx.captureFlag(state().staffFlag);
    ctx.log('warn', 'authz', 'Area staff raggiunta con la sessione dell’agente', { agent: state().agentName });
    return html(
      page(
        'Area staff',
        tpl`
        <div class="card">
          <h1>Area staff</h1>
          <p class="muted">Autenticato come ${state().agentName} (agente di supporto).</p>
          <p>Token operativo interno: <code>${state().staffFlag}</code></p>
        </div>`,
      ),
      {
        serverNotes: [
          'Il cookie di sessione presentato appartiene a un agente di supporto.',
          'Il server non ha modo di sapere che non sei tu: una sessione rubata è una sessione valida.',
        ],
      },
    );
  });

  // ── Path traversal ───────────────────────────────────────────────────────
  router.get('/allegato', (req, ctx) => {
    const file = req.query['file'] ?? '';
    if (!file) {
      return html(page('Allegati', tpl`<div class="card"><p>Indica un file: <code>/allegato?file=nota-cliente.txt</code></p></div>`), {
        status: 400,
      });
    }

    const { resolved, escaped } = target.resolveAttachment(file);
    const notes = [
      `attachmentRoot = ${target.state.config.attachmentRoot}`,
      `Percorso costruito e risolto: ${resolved}`,
    ];

    if (escaped) {
      ctx.signal('traversal.attempt', { requested: file, resolved });
    }

    if (target.state.config.confineAttachments && escaped) {
      ctx.signal('traversal.blocked', { requested: file, resolved });
      ctx.log('warn', 'allegati', 'Richiesta fuori dalla directory consentita, respinta', { resolved });
      notes.push('confineAttachments = true: il percorso risolto è fuori dalla radice, richiesta respinta.');
      return text('403 — percorso non consentito.', { status: 403, serverNotes: notes });
    }

    const node = target.vfs.lookup(resolved);
    if (!node || node.type === 'dir') {
      return text('404 — file inesistente.', { status: 404, serverNotes: notes });
    }
    if (!target.vfs.can(node, WWW_DATA, 'r')) {
      ctx.signal('traversal.permission.denied', { resolved, mode: node.mode, owner: node.owner });
      ctx.log('warn', 'allegati', 'Lettura negata dai permessi del filesystem', {
        resolved,
        owner: node.owner,
        group: node.group,
      });
      notes.push(
        `Il processo web è www-data; ${resolved} è ${node.owner}:${node.group} con modo ${node.mode.toString(8)}.`,
        'Il traversal ha funzionato: è la lettura ad essere negata, e a negarla sono i permessi.',
      );
      return text('500 — impossibile leggere il file.', { status: 500, serverNotes: notes });
    }

    if (escaped) {
      ctx.signal('traversal.escaped', { requested: file, resolved });
      ctx.log('error', 'allegati', 'Servito un file fuori dalla directory degli allegati', { resolved });
      notes.push('Il file servito si trova FUORI dalla directory degli allegati.');
    }
    if (resolved === '/srv/helpdesk/.env') {
      ctx.signal('traversal.sensitive.read', { resolved });
      ctx.captureFlag(target.state.envFlag);
    }

    return text(node.content ?? '', { serverNotes: notes });
  });

  return router;
}

// ── the world ────────────────────────────────────────────────────────────────

function buildFilesystem(state: HelpdeskState, envFlag: string): Vfs {
  const vfs = new Vfs();

  vfs.mkdirp('/srv/helpdesk', { mode: 0o755, owner: 'www-data', group: 'www-data' });
  vfs.mkdirp('/srv/helpdesk/allegati', { mode: 0o755, owner: 'www-data', group: 'www-data' });
  vfs.mkdirp('/srv/helpdesk/app', { mode: 0o755, owner: 'www-data', group: 'www-data' });
  vfs.mkdirp('/etc', { mode: 0o755, owner: 'root', group: 'root' });

  vfs.writeFile(
    '/srv/helpdesk/allegati/nota-cliente.txt',
    'Nota allegata al ticket 4101.\nIl cliente segnala il problema dal 12 marzo.\n',
    { mode: 0o644, owner: 'www-data', group: 'www-data' },
  );
  vfs.writeFile(
    '/srv/helpdesk/allegati/ricevuta-4102.txt',
    'Ricevuta ordine 4102 — importo 149,00 EUR.\n',
    { mode: 0o644, owner: 'www-data', group: 'www-data' },
  );

  // Readable by www-data through the group: the classic deployment mistake.
  vfs.writeFile(
    '/srv/helpdesk/.env',
    [
      'APP_ENV=production',
      'DB_HOST=127.0.0.1',
      'DB_USER=helpdesk',
      'DB_PASSWORD=Tramontana!2019',
      `HELPDESK_TOKEN=${envFlag}`,
      '',
    ].join('\n'),
    { mode: 0o640, owner: 'deploy', group: 'www-data' },
  );

  vfs.writeFile('/srv/helpdesk/config.json', state.configSource, {
    mode: 0o664,
    owner: 'www-data',
    group: 'www-data',
  });
  vfs.writeFile('/srv/helpdesk/app/cerca.php', CERCA_SOURCE, { mode: 0o644, owner: 'www-data', group: 'www-data' });
  vfs.writeFile('/srv/helpdesk/app/allegato.php', ALLEGATO_SOURCE, { mode: 0o644, owner: 'www-data', group: 'www-data' });

  vfs.writeFile(
    '/etc/passwd',
    [
      'root:x:0:0:root:/root:/bin/bash',
      'daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin',
      'www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin',
      'deploy:x:1001:1001::/home/deploy:/bin/bash',
      '',
    ].join('\n'),
    { mode: 0o644, owner: 'root', group: 'root' },
  );

  // 0640 root:shadow, and www-data is not in the shadow group. Nothing
  // special-cases this file: the permission check simply says no.
  vfs.writeFile('/etc/shadow', 'root:$6$rounds=656000$xxxx:19700:0:99999:7:::\n', {
    mode: 0o640,
    owner: 'root',
    group: 'shadow',
  });

  return vfs;
}

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Would this string, placed verbatim into HTML, give the browser something to
 * run? Deliberately narrow: a script element, an inline event handler, or a
 * javascript: URI. It answers a question about the markup, not about intent.
 */
export function isExecutablePayload(value: string): boolean {
  return /<\s*script\b/i.test(value) || /\bon[a-z]+\s*=/i.test(value) || /javascript\s*:/i.test(value);
}

/** Resolve `.` and `..` the way a filesystem does. */
function normalizePath(path: string): string {
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return `/${parts.join('/')}`;
}

/** Drop the `_note` key so the config file can carry a comment for the learner. */
function stripNotes(source: string): string {
  const parsed = JSON.parse(source) as Record<string, unknown>;
  delete parsed['_note'];
  return JSON.stringify(parsed);
}

/**
 * The page shell.
 *
 * The markup already spoke in `topbar`, `card`, `list`, `tag` — but no
 * stylesheet was ever shipped with it, so this target rendered as raw HTML
 * while the other web lab looked like an application. That difference reads as
 * "the lab is broken", which is the wrong thing to be wondering about while you
 * are trying to land a payload. Same house style as the vault target.
 *
 * Nothing here touches the vulnerabilities: escaping is decided by
 * `renderUserContent`, and a payload lands in the DOM exactly as before.
 */
const STYLE = `<style>
:root{color-scheme:dark;--bg:#0d1117;--panel:#161b22;--line:#26303d;--text:#d7dee8;--muted:#7d8899;--accent:#4a9eff;--danger:#f4666a;--ok:#3fb950}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
.topbar{display:flex;gap:16px;align-items:center;padding:12px 20px;background:var(--panel);border-bottom:1px solid var(--line)}
.topbar a{margin-left:auto;color:var(--accent)}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:22px;margin:24px auto;max-width:680px}
h1{font-size:20px;margin:0 0 12px}
h2{font-size:16px;margin:20px 0 8px}
a{color:var(--accent)}
.muted{color:var(--muted)}
.error{color:var(--danger)}
form{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:12px 0}
input,textarea{padding:9px 11px;background:#0d1117;border:1px solid var(--line);border-radius:6px;color:var(--text);font:inherit}
input{min-width:220px}
textarea{width:100%;min-height:90px}
button{padding:9px 18px;background:var(--accent);border:0;border-radius:6px;color:#04121f;font:inherit;font-weight:600;cursor:pointer}
code,pre{font-family:ui-monospace,"SFMono-Regular",Menlo,monospace}
pre{white-space:pre-wrap;background:#0d1117;border:1px solid var(--line);border-radius:6px;padding:12px}
.list{list-style:none;padding:0;margin:0}
.list li{padding:10px 0;border-bottom:1px solid var(--line)}
.list li:last-child{border-bottom:0}
.tag{display:inline-block;padding:1px 8px;border:1px solid var(--line);border-radius:999px;font-size:11px;color:var(--muted)}
</style>`;

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="it">
<head><meta charset="utf-8"><title>${escapeHtml(title)} · Helpdesk</title>${STYLE}</head>
<body>
<nav class="topbar"><strong>Helpdesk</strong><a href="/">Ticket</a></nav>
${body}
</body>
</html>`;
}

export const helpdeskBuilder: TargetBuilder = {
  id: 'web.helpdesk',
  description: 'Portale di assistenza con XSS riflesso e persistente e path traversal negli allegati.',
  build: (spec, ctx) => new HelpdeskTarget(spec, ctx),
};
