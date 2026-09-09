import type { FsEntry, LabInspectView, LabSpec, LabSurface, SqlResultView } from '@cyberlab/core';
import { SqlEngine } from '../sql.js';
import {
  Router,
  escapeHtml,
  html,
  json,
  raw,
  redirect,
  setCookie,
  tpl,
  type TargetHttpRequest,
  type TargetHttpResponse,
  formBodyProblem,
} from '../http.js';
import type { LabTarget, TargetBuilder, TargetContext } from '../target.js';

/**
 * "Vault" — an internal document portal with a broken authorisation model.
 *
 * This is a real application. It authenticates with a real session cookie, it
 * queries a real database, and its access control is driven by a real policy
 * document that it evaluates on every request. The vulnerability is not a
 * scripted branch: `/profile.php` genuinely trusts a client-supplied id because
 * its policy entry says `ownership: "none"`.
 *
 * Which is what makes the fix real too. Edit `/srv/vault/policy.json` in the
 * lab's editor, change that one field, replay the same request, and the server
 * genuinely returns 403 — because the same code path now has an owner to
 * compare against.
 */

interface Session {
  token: string;
  userId: number;
  username: string;
  createdAt: number;
}

type Ownership = 'none' | 'match:query.id' | 'match:path.id' | 'role:admin';

interface RoutePolicy {
  requireSession: boolean;
  ownership: Ownership;
  note?: string;
}

interface Policy {
  version: number;
  routes: Record<string, RoutePolicy>;
}

interface VaultState {
  sessions: Session[];
  policy: Policy;
  policySource: string;
  flag: string;
  adminId: number;
}

const SEBA_ID = 15;

const DEFAULT_POLICY_SOURCE = `{
  "version": 1,
  "routes": {
    "/profile.php": {
      "requireSession": true,
      "ownership": "none",
      "note": "TODO(auth): ownership check was disabled during the 2019 migration"
    },
    "/documents.php": {
      "requireSession": true,
      "ownership": "none"
    },
    "/dashboard.php": {
      "requireSession": true,
      "ownership": "none"
    },
    "/admin.php": {
      "requireSession": true,
      "ownership": "role:admin"
    }
  }
}`;

const PROFILE_SOURCE = `<?php
// vault/profile.php — user profile view
require_once 'lib/session.php';
require_once 'lib/policy.php';

$session = session_load($_COOKIE['session'] ?? null);
$policy  = policy_for('/profile.php');

if ($policy['requireSession'] && !$session) {
    header('Location: /login.php');
    exit;
}

// The requested profile id comes straight from the query string.
$id = $_GET['id'] ?? $session['user_id'];

// policy_enforce() compares the session subject with the requested object
// *only if* the route policy names an ownership rule. Right now it does not.
policy_enforce($policy, $session, ['query.id' => $id]);

$stmt = $db->prepare('SELECT * FROM users WHERE id = ?');
$stmt->execute([$id]);
$user = $stmt->fetch();

render('profile', ['user' => $user]);
`;

class VaultTarget implements LabTarget {
  readonly surfaces: readonly LabSurface[] = ['request', 'browser', 'database', 'logs', 'editor', 'files'];

  #db: SqlEngine;
  #state: VaultState;
  #router: Router<TargetContext>;

  constructor(_spec: LabSpec, ctx: TargetContext) {
    this.#db = new SqlEngine(SCHEMA);

    const flag = `CL{idor_${ctx.rng.token(12)}}`;
    const adminId = ctx.rng.pick([12, 13, 17, 18, 19]);
    this.#state = {
      sessions: [],
      policy: JSON.parse(DEFAULT_POLICY_SOURCE) as Policy,
      policySource: DEFAULT_POLICY_SOURCE,
      flag,
      adminId,
    };

    this.#seed(ctx, adminId, flag);
    this.#router = buildRouter(this);
    ctx.log('info', 'vault', 'Vault portal started', { policyVersion: this.#state.policy.version });
  }

  // ── seeding ──────────────────────────────────────────────────────────────

  #seed(ctx: TargetContext, adminId: number, flag: string): void {
    const people: [number, string, string, string, string, string][] = [
      [11, 'm.rossi', 'Marta Rossi', 'm.rossi@vault.lab', 'user', 'Finance'],
      [12, 'l.bianchi', 'Luca Bianchi', 'l.bianchi@vault.lab', 'user', 'Engineering'],
      [13, 'g.ferrari', 'Giulia Ferrari', 'g.ferrari@vault.lab', 'user', 'Legal'],
      [14, 'a.conti', 'Alessio Conti', 'a.conti@vault.lab', 'user', 'Engineering'],
      [SEBA_ID, 'seba', 'Seba Turina', 'seba@vault.lab', 'user', 'Security'],
      [16, 'f.greco', 'Federica Greco', 'f.greco@vault.lab', 'user', 'Finance'],
      [17, 'd.marino', 'Davide Marino', 'd.marino@vault.lab', 'user', 'Operations'],
      [18, 'c.esposito', 'Chiara Esposito', 'c.esposito@vault.lab', 'user', 'HR'],
      [19, 's.romano', 'Sara Romano', 's.romano@vault.lab', 'user', 'Engineering'],
    ];

    const passwords = ['autumn2019', 'Tramonto!91', 'vault-temp-2', 'ciaociao', 'Peperoncino7', 'hunter22'];

    for (const [id, username, fullName, email, role, department] of people) {
      const isAdmin = id === adminId;
      this.#db.run(
        `INSERT INTO users (id, username, password, full_name, email, role, department, recovery_token)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          username,
          id === SEBA_ID ? 'PrimaveraFredda!24' : ctx.rng.pick(passwords),
          fullName,
          email,
          isAdmin ? 'admin' : role,
          department,
          isAdmin ? flag : `rt-${ctx.rng.token(8)}`,
        ],
      );
    }

    const documents: [number, number, string, string, string][] = [
      [101, SEBA_ID, 'Q3 pentest scope', 'Perimetro concordato con il cliente: 10.13.0.0/24, finestra 22:00-06:00.', 'internal'],
      [102, SEBA_ID, 'Note su cookie di sessione', 'Il portale usa un cookie `session` opaco. HttpOnly attivo, Secure no (lab in HTTP).', 'internal'],
      [103, 16, 'Fatture Q3 (bozza)', 'Riepilogo fatture fornitori — NON condividere fuori dal reparto Finance.', 'confidential'],
      [104, 11, 'Budget 2026', 'Allocazione preliminare per il prossimo esercizio.', 'confidential'],
      [105, adminId, 'Runbook recupero accessi', `Token di recovery amministratore: ${flag}`, 'restricted'],
    ];
    for (const [id, ownerId, title, body, classification] of documents) {
      this.#db.run(
        'INSERT INTO documents (id, owner_id, title, body, classification) VALUES (?, ?, ?, ?, ?)',
        [id, ownerId, title, body, classification],
      );
    }
  }

  // ── policy ───────────────────────────────────────────────────────────────

  policyFor(pathname: string): RoutePolicy {
    return (
      this.#state.policy.routes[pathname] ?? {
        requireSession: false,
        ownership: 'none',
      }
    );
  }

  get state(): VaultState {
    return this.#state;
  }

  get db(): SqlEngine {
    return this.#db;
  }

  /**
   * The real enforcement point. Returns `null` when the request is allowed and
   * a response when it is refused. Every branch raises a signal, so the
   * evaluator can tell "the check ran and passed" from "there was no check".
   */
  enforce(
    policy: RoutePolicy,
    session: Session | null,
    subject: { requestedId?: number; pathname: string },
    ctx: TargetContext,
  ): TargetHttpResponse | null {
    if (policy.requireSession && !session) {
      ctx.signal('auth.required', { pathname: subject.pathname });
      ctx.log('warn', 'authz', `No session for ${subject.pathname}, redirecting to login`);
      return redirect('/login.php');
    }

    switch (policy.ownership) {
      case 'none': {
        ctx.signal('authz.check.skipped', {
          pathname: subject.pathname,
          reason: 'route policy declares ownership "none"',
        });
        return null;
      }
      case 'match:query.id':
      case 'match:path.id': {
        ctx.signal('authz.check.enforced', {
          pathname: subject.pathname,
          rule: policy.ownership,
          subjectId: session?.userId ?? null,
          objectId: subject.requestedId ?? null,
        });
        if (session && subject.requestedId !== undefined && subject.requestedId !== session.userId) {
          ctx.signal('authz.denied', {
            pathname: subject.pathname,
            subjectId: session.userId,
            objectId: subject.requestedId,
          });
          ctx.log('warn', 'authz', `Denied: user ${session.userId} requested object ${subject.requestedId}`);
          return forbidden(
            'Forbidden',
            `The session belongs to user ${session.userId}; object ${subject.requestedId} belongs to somebody else.`,
          );
        }
        return null;
      }
      case 'role:admin': {
        const role = session ? this.userRole(session.userId) : null;
        ctx.signal('authz.check.enforced', { pathname: subject.pathname, rule: 'role:admin', role });
        if (role !== 'admin') {
          ctx.signal('authz.denied', { pathname: subject.pathname, role });
          return forbidden('Forbidden', 'This area requires the admin role.');
        }
        ctx.signal('authz.admin.granted', { userId: session?.userId ?? null });
        return null;
      }
    }
  }

  userRole(userId: number): string | null {
    const rows = this.#db.select('SELECT role FROM users WHERE id = ?', [userId]);
    return rows[0] ? String(rows[0]['role']) : null;
  }

  session(req: TargetHttpRequest): Session | null {
    const token = req.cookies['session'];
    if (!token) return null;
    return this.#state.sessions.find((s) => s.token === token) ?? null;
  }

  createSession(userId: number, username: string, ctx: TargetContext): Session {
    const session: Session = {
      token: `sess_${ctx.rng.token(24)}`,
      userId,
      username,
      createdAt: ctx.now(),
    };
    this.#state.sessions.push(session);
    return session;
  }

  // ── LabTarget surface ────────────────────────────────────────────────────

  http(req: TargetHttpRequest, ctx: TargetContext): TargetHttpResponse {
    ctx.log('info', 'http', `${req.method} ${req.path}`, {
      cookie: req.headers['cookie'] ? 'present' : 'absent',
    });
    const response = this.#router.handle(req, ctx);
    if (response) return response;
    return html(page('404', tpl`<h1>404</h1><p>No handler for <code>${req.pathname}</code>.</p>`), {
      status: 404,
    });
  }

  sql(sql: string, ctx: TargetContext): SqlResultView {
    // The vault lab exposes SQL read-only, as a "what the server sees" window.
    // Injection lessons use a different target that routes user input into the
    // query text on purpose.
    const trimmed = sql.trim();
    if (!/^select\b/i.test(trimmed)) {
      ctx.signal('sql.write.blocked', { sql: trimmed.slice(0, 200) });
      return {
        executedSql: trimmed,
        columns: [],
        rows: [],
        rowCount: 0,
        error: 'This lab exposes the database read-only. Only SELECT is allowed here.',
        durationMs: 0,
      };
    }
    const result = this.#db.query(trimmed);
    ctx.signal('sql.query', { rowCount: result.rowCount, error: result.error ?? null });
    return result;
  }

  files = {
    list: (path: string): FsEntry[] => {
      const all = this.#fileTable();
      const prefix = path.endsWith('/') ? path : `${path}/`;
      return all.filter((entry) => entry.path.startsWith(prefix) || entry.path === path);
    },
    read: (path: string): string => {
      const content = this.#fileContents()[path];
      if (content === undefined) throw new Error(`No such file: ${path}`);
      return content;
    },
    write: (path: string, content: string, ctx: TargetContext): void => {
      if (path !== '/srv/vault/policy.json') {
        throw new Error(`${path} is read-only in this lab. Only the policy document is editable.`);
      }
      let parsed: Policy;
      try {
        parsed = JSON.parse(content) as Policy;
      } catch (error) {
        ctx.signal('policy.invalid', { error: String(error) });
        throw new Error(`policy.json is not valid JSON: ${String(error)}`);
      }
      if (!parsed || typeof parsed !== 'object' || typeof parsed.routes !== 'object') {
        ctx.signal('policy.invalid', { error: 'missing "routes"' });
        throw new Error('policy.json must contain a "routes" object.');
      }
      const before = this.#state.policy.routes['/profile.php']?.ownership;
      this.#state.policy = parsed;
      this.#state.policySource = content;
      const after = parsed.routes['/profile.php']?.ownership;
      ctx.signal('policy.updated', { route: '/profile.php', before, after });
      ctx.log('info', 'policy', `Policy reloaded; /profile.php ownership is now "${after}"`);
    },
  };

  #fileContents(): Record<string, string> {
    return {
      '/srv/vault/policy.json': this.#state.policySource,
      '/srv/vault/profile.php': PROFILE_SOURCE,
      '/srv/vault/README.md':
        '# Vault portal\n\nInternal document portal. Authorisation rules live in policy.json and are\nevaluated by lib/policy.php on every request.\n\nKnown debt: the 2019 migration disabled per-object ownership checks on the\nprofile and document routes "temporarily".\n',
    };
  }

  #fileTable(): FsEntry[] {
    const contents = this.#fileContents();
    return [
      { name: 'vault', path: '/srv/vault', type: 'dir', mode: 0o755, owner: 'www-data', group: 'www-data', size: 4096, mtime: 1_700_000_000_000 },
      ...Object.entries(contents).map(([path, content]) => ({
        name: path.split('/').pop() ?? path,
        path,
        type: 'file' as const,
        mode: path.endsWith('policy.json') ? 0o664 : 0o644,
        owner: 'www-data',
        group: 'www-data',
        size: content.length,
        mtime: 1_700_000_000_000,
        // The editor asks the target, not the mode bits: profile.php is
        // readable so you can study the bug, but the fix belongs in the policy.
        writable: path.endsWith('policy.json'),
        ...(path.endsWith('policy.json')
          ? {}
          : { readOnlyReason: 'Sorgente di riferimento. La correzione va fatta in policy.json.' }),
      })),
    ];
  }

  inspect(what: 'database' | 'sessions' | 'logs' | 'files', ctx: TargetContext): LabInspectView {
    switch (what) {
      case 'database':
        return {
          kind: 'database',
          tables: this.#db.tableNames().map((name) => this.#db.table(name)),
        };
      case 'sessions':
        return {
          kind: 'sessions',
          sessions: this.#state.sessions.map((s) => ({
            id: s.token,
            userId: String(s.userId),
            username: s.username,
            createdAt: s.createdAt,
          })),
        };
      case 'logs':
        // Log inspection is served by the instance from the shared context, so
        // every target gets it without reimplementing it.
        return { kind: 'logs', entries: [] };
      case 'files':
        return { kind: 'files', root: this.#fileTable() };
    }
  }

  serialize(): unknown {
    return {
      db: this.#db.dump(),
      state: this.#state,
    };
  }

  deserialize(data: unknown): void {
    const parsed = data as { db: ReturnType<SqlEngine['dump']>; state: VaultState };
    this.#db.load(parsed.db);
    this.#state = parsed.state;
  }

  dispose(): void {
    this.#db.close();
  }
}

// ── routes ─────────────────────────────────────────────────────────────────

function buildRouter(target: VaultTarget): Router<TargetContext> {
  const router = new Router<TargetContext>();

  router.get('/', () => redirect('/dashboard.php'));

  router.get('/login.php', (req) => {
    const error = req.query['error'];
    return html(
      page(
        'Sign in',
        tpl`
        <div class="card narrow">
          <h1>Vault</h1>
          <p class="muted">Internal document portal</p>
          ${error ? raw(`<p class="error">${escapeHtml(error)}</p>`) : raw('')}
          <form method="POST" action="/login.php">
            <label>Username <input name="username" autocomplete="username" /></label>
            <label>Password <input name="password" type="password" autocomplete="current-password" /></label>
            <button type="submit">Sign in</button>
          </form>
        </div>`,
      ),
    );
  });

  router.post('/login.php', (req, ctx) => {
    // An unreadable body is an encoding problem, not a wrong password.
    const problem = formBodyProblem(req);
    if (problem) {
      return html(page('Accesso', `<div class="card narrow"><p class="error">${problem}</p></div>`), {
        status: 400,
        serverNotes: [problem],
      });
    }
    const username = req.form['username'] ?? '';
    const password = req.form['password'] ?? '';
    // Parameterised on purpose: this lab is about authorisation, not injection.
    const rows = target.db.select('SELECT id, username, role FROM users WHERE username = ? AND password = ?', [
      username,
      password,
    ]);
    const user = rows[0];
    if (!user) {
      ctx.signal('auth.failed', { username });
      ctx.log('warn', 'auth', `Failed login for "${username}"`);
      return redirect('/login.php?error=Invalid+credentials');
    }
    const session = target.createSession(Number(user['id']), String(user['username']), ctx);
    ctx.signal('session.created', { userId: session.userId, username: session.username });
    ctx.log('info', 'auth', `Session ${session.token} issued to ${session.username} (id ${session.userId})`);

    const response = redirect('/dashboard.php');
    setCookie(response, 'session', session.token, {
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    });
    response.serverNotes = [
      `Credentials matched user id ${session.userId} (${session.username}).`,
      `Created server-side session ${session.token}.`,
      'Set-Cookie carries only the opaque token — the user id never leaves the server here.',
    ];
    return response;
  });

  router.get('/logout.php', (req, ctx) => {
    const session = target.session(req);
    if (session) {
      target.state.sessions = target.state.sessions.filter((s) => s.token !== session.token);
      ctx.signal('session.destroyed', { userId: session.userId });
    }
    const response = redirect('/login.php');
    setCookie(response, 'session', '', { path: '/', maxAge: 0 });
    return response;
  });

  router.get('/dashboard.php', (req, ctx) => {
    const session = target.session(req);
    const policy = target.policyFor('/dashboard.php');
    const denied = target.enforce(policy, session, { pathname: '/dashboard.php' }, ctx);
    if (denied) return denied;
    if (!session) return redirect('/login.php');

    const docs = target.db.select(
      'SELECT id, title, classification FROM documents WHERE owner_id = ? ORDER BY id',
      [session.userId],
    );
    return html(
      page(
        'Dashboard',
        tpl`
        <nav class="topbar"><strong>Vault</strong><span class="muted">signed in as ${session.username} (id ${session.userId})</span><a href="/logout.php">Sign out</a></nav>
        <div class="card">
          <h1>Your documents</h1>
          <ul class="list">
            ${raw(
              docs
                .map(
                  (d) =>
                    `<li><a href="/documents.php?id=${escapeHtml(String(d['id']))}">${escapeHtml(String(d['title']))}</a> <span class="tag">${escapeHtml(String(d['classification']))}</span></li>`,
                )
                .join('') || '<li class="muted">No documents.</li>',
            )}
          </ul>
          <p><a href="/profile.php?id=${session.userId}">View my profile →</a></p>
        </div>`,
      ),
      {
        serverNotes: [
          `Session cookie resolved to user id ${session.userId}.`,
          `Documents query filtered by owner_id = ${session.userId} (this route does filter correctly).`,
        ],
      },
    );
  });

  router.get('/profile.php', (req, ctx) => {
    const session = target.session(req);
    const policy = target.policyFor('/profile.php');
    const requestedRaw = req.query['id'];
    const requestedId = requestedRaw !== undefined ? Number(requestedRaw) : session?.userId;

    const denied = target.enforce(
      policy,
      session,
      { pathname: '/profile.php', ...(requestedId !== undefined ? { requestedId } : {}) },
      ctx,
    );
    if (denied) return denied;
    if (!session) return redirect('/login.php');

    if (requestedId === undefined || Number.isNaN(requestedId)) {
      return html(page('Profile', tpl`<div class="card"><p class="error">Invalid id.</p></div>`), {
        status: 400,
      });
    }

    const rows = target.db.select('SELECT * FROM users WHERE id = ?', [requestedId]);
    const user = rows[0];

    const notes = [
      `Route policy for /profile.php → requireSession=${policy.requireSession}, ownership="${policy.ownership}".`,
      `Session subject: user ${session.userId} (${session.username}).`,
      `Requested object: id=${requestedId} (taken from the query string).`,
      policy.ownership === 'none'
        ? 'No ownership rule configured, so subject and object were never compared.'
        : `Ownership rule "${policy.ownership}" was evaluated.`,
      `SELECT * FROM users WHERE id = ${requestedId} → ${user ? '1 row' : '0 rows'}.`,
    ];

    if (!user) {
      ctx.signal('profile.read', { requestedId, sessionUserId: session.userId, found: false });
      return html(
        page('Profile', tpl`<div class="card"><h1>Not found</h1><p>No user with id ${requestedId}.</p></div>`),
        { status: 404, serverNotes: notes },
      );
    }

    const own = Number(user['id']) === session.userId;
    ctx.signal('profile.read', {
      requestedId,
      sessionUserId: session.userId,
      own,
      role: String(user['role']),
      found: true,
    });

    if (!own) {
      ctx.signal('authz.horizontal.bypass', {
        subjectId: session.userId,
        objectId: requestedId,
        objectRole: String(user['role']),
        parameter: 'id',
      });
      ctx.log('error', 'authz', `User ${session.userId} read the profile of user ${requestedId} — no ownership check ran`);
      if (String(user['role']) === 'admin') {
        ctx.signal('authz.privilege.admin-profile-read', { objectId: requestedId });
      }
    }

    const token = String(user['recovery_token']);
    if (token.startsWith('CL{')) ctx.captureFlag(token);

    return html(
      page(
        'Profile',
        tpl`
      <nav class="topbar"><strong>Vault</strong><span class="muted">signed in as ${session.username} (id ${session.userId})</span><a href="/dashboard.php">Dashboard</a></nav>
      <div class="card">
        <h1>${String(user['full_name'])}</h1>
        <dl>
          <dt>User id</dt><dd>${String(user['id'])}</dd>
          <dt>Username</dt><dd>${String(user['username'])}</dd>
          <dt>Email</dt><dd>${String(user['email'])}</dd>
          <dt>Department</dt><dd>${String(user['department'])}</dd>
          <dt>Role</dt><dd><span class="tag ${String(user['role']) === 'admin' ? 'danger' : ''}">${String(user['role'])}</span></dd>
          <dt>Recovery token</dt><dd><code>${token}</code></dd>
        </dl>
        ${own ? raw('<p class="muted">This is your own profile.</p>') : raw('<p class="error">You are viewing somebody else’s profile.</p>')}
      </div>`,
      ),
      { serverNotes: notes },
    );
  });

  router.get('/documents.php', (req, ctx) => {
    const session = target.session(req);
    const policy = target.policyFor('/documents.php');
    const documentId = Number(req.query['id']);
    if (!session) {
      ctx.signal('auth.required', { pathname: '/documents.php' });
      return redirect('/login.php');
    }

    const rows = target.db.select('SELECT * FROM documents WHERE id = ?', [documentId]);
    const doc = rows[0];
    if (!doc) {
      return html(page('Document', tpl`<div class="card"><h1>Not found</h1></div>`), { status: 404 });
    }

    // The object's owner is the subject the policy compares against, so the
    // document route is fixable with exactly the same one-line policy change.
    const denied = target.enforce(
      policy,
      session,
      { pathname: '/documents.php', requestedId: Number(doc['owner_id']) },
      ctx,
    );
    if (denied) return denied;

    const own = Number(doc['owner_id']) === session.userId;
    ctx.signal('document.read', { documentId, ownerId: Number(doc['owner_id']), own });
    if (!own) {
      ctx.signal('authz.horizontal.bypass.document', {
        subjectId: session.userId,
        documentId,
        ownerId: Number(doc['owner_id']),
        classification: String(doc['classification']),
      });
    }
    const body = String(doc['body']);
    const flagMatch = /CL\{[^}]+\}/.exec(body);
    if (flagMatch) ctx.captureFlag(flagMatch[0]);

    return html(
      page(
        'Document',
        tpl`
      <nav class="topbar"><strong>Vault</strong><a href="/dashboard.php">Dashboard</a></nav>
      <div class="card">
        <h1>${String(doc['title'])}</h1>
        <p class="tag">${String(doc['classification'])}</p>
        <pre>${body}</pre>
      </div>`,
      ),
      {
        serverNotes: [
          `Route policy for /documents.php → ownership="${policy.ownership}".`,
          `Document ${documentId} is owned by user ${String(doc['owner_id'])}; session subject is ${session.userId}.`,
        ],
      },
    );
  });

  router.get('/admin.php', (req, ctx) => {
    const session = target.session(req);
    const policy = target.policyFor('/admin.php');
    const denied = target.enforce(policy, session, { pathname: '/admin.php' }, ctx);
    if (denied) return denied;
    if (!session) return redirect('/login.php');
    return html(
      page(
        'Admin',
        tpl`<div class="card"><h1>Administration</h1><p>Recovery token: <code>${target.state.flag}</code></p></div>`,
      ),
    );
  });

  // A JSON API over the same data, so the request editor has something to
  // practise headers and content types against.
  router.get('/api/profile', (req, ctx) => {
    const session = target.session(req);
    if (!session) {
      ctx.signal('auth.required', { pathname: '/api/profile' });
      return json({ error: 'unauthenticated' }, { status: 401 });
    }
    const requestedId = req.query['id'] !== undefined ? Number(req.query['id']) : session.userId;
    const policy = target.policyFor('/profile.php');
    const denied = target.enforce(policy, session, { pathname: '/api/profile', requestedId }, ctx);
    if (denied) return json({ error: 'forbidden' }, { status: 403 });

    const rows = target.db.select('SELECT id, username, full_name, email, role, department FROM users WHERE id = ?', [
      requestedId,
    ]);
    const user = rows[0];
    if (!user) return json({ error: 'not_found' }, { status: 404 });
    const own = Number(user['id']) === session.userId;
    ctx.signal('profile.read', { requestedId, sessionUserId: session.userId, own, api: true, found: true });
    if (!own) {
      ctx.signal('authz.horizontal.bypass', {
        subjectId: session.userId,
        objectId: requestedId,
        parameter: 'id',
        api: true,
      });
    }
    return json(user, {
      serverNotes: [`ownership rule in force: "${policy.ownership}"`],
    });
  });

  return router;
}

// ── presentation ───────────────────────────────────────────────────────────

function forbidden(title: string, detail: string): TargetHttpResponse {
  return html(
    page(title, tpl`<div class="card"><h1>403 Forbidden</h1><p>${detail}</p></div>`),
    { status: 403 },
  );
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)} · Vault</title>
<style>
:root{color-scheme:dark;--bg:#0d1117;--panel:#161b22;--line:#26303d;--text:#d7dee8;--muted:#7d8899;--accent:#4a9eff;--danger:#f4666a}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
.topbar{display:flex;gap:16px;align-items:center;padding:12px 20px;background:var(--panel);border-bottom:1px solid var(--line)}
.topbar a{margin-left:auto;color:var(--accent)}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:22px;margin:24px auto;max-width:640px}
.card.narrow{max-width:360px;margin-top:60px}
h1{font-size:20px;margin:0 0 12px}
a{color:var(--accent)}
.muted{color:var(--muted)}
.error{color:var(--danger)}
label{display:block;margin:12px 0;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.06em}
input{display:block;width:100%;margin-top:6px;padding:9px 11px;background:#0d1117;border:1px solid var(--line);border-radius:6px;color:var(--text);font:inherit}
button{margin-top:16px;padding:9px 18px;background:var(--accent);border:0;border-radius:6px;color:#04121f;font:inherit;font-weight:600;cursor:pointer}
dl{display:grid;grid-template-columns:150px 1fr;gap:8px 16px;margin:0}
dt{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.06em}
dd{margin:0}
code,pre{font-family:ui-monospace,"SFMono-Regular",Menlo,monospace}
pre{white-space:pre-wrap;background:#0d1117;border:1px solid var(--line);border-radius:6px;padding:12px}
.list{list-style:none;padding:0;margin:0}
.list li{padding:8px 0;border-bottom:1px solid var(--line)}
.tag{display:inline-block;padding:1px 8px;border:1px solid var(--line);border-radius:999px;font-size:11px;color:var(--muted)}
.tag.danger{border-color:var(--danger);color:var(--danger)}
</style></head><body>${body}</body></html>`;
}

const SCHEMA = `
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  department TEXT,
  recovery_token TEXT
);
CREATE TABLE documents (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  classification TEXT NOT NULL DEFAULT 'internal'
);
`;

export const vaultBuilder: TargetBuilder = {
  id: 'web.vault',
  description:
    'Vault document portal: real sessions, a real policy engine, and a per-object authorisation check that is switched off.',
  build: (spec, ctx) => new VaultTarget(spec, ctx),
};

export { SEBA_ID };
