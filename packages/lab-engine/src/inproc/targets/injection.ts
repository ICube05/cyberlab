import type { FsEntry, LabInspectView, LabSpec, LabSurface, SqlResultView } from '@cyberlab/core';
import { SqlEngine } from '../sql.js';
import {
  Router,
  escapeHtml,
  html,
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
 * "Catalog" — a product search and login page that builds SQL by string
 * concatenation.
 *
 * The injection is not simulated. The search box does exactly this:
 *
 *   SELECT ... FROM products WHERE name LIKE '%' || <your input> || '%'
 *
 * assembled as a raw string and handed to SQLite, so `' OR '1'='1` really does
 * defeat the filter, `' UNION SELECT ...` really does pull columns from another
 * table, and a broken quote really does surface SQLite's own error — the whole
 * point of error-based injection. The login form is the same story: a classic
 * authentication bypass that works because the password check lives inside a
 * string, not a parameter.
 *
 * The "safe" endpoints alongside them use bound parameters, so the contrast the
 * curriculum needs — vulnerable vs fixed, same feature — is one real click away.
 */

interface CatalogState {
  flag: string;
  sessions: { token: string; username: string; role: string }[];
  /** Toggled by the "fix" exercise: when true, endpoints bind parameters. */
  patched: { search: boolean; login: boolean };
}

class InjectionTarget implements LabTarget {
  readonly surfaces: readonly LabSurface[] = ['request', 'browser', 'sql', 'database', 'logs', 'editor', 'files'];

  #db: SqlEngine;
  #state: CatalogState;
  #router: Router<TargetContext>;

  constructor(_spec: LabSpec, ctx: TargetContext) {
    this.#db = new SqlEngine(SCHEMA);
    this.#state = {
      flag: `CL{sqli_${ctx.rng.token(12)}}`,
      sessions: [],
      patched: { search: false, login: false },
    };
    this.#seed(ctx);
    this.#router = buildRouter(this);
    ctx.log('info', 'catalog', 'Catalog service started (SQL assembled by concatenation)');
  }

  #seed(ctx: TargetContext): void {
    const products: [string, string, number, number][] = [
      ['Laptop Stand', 'accessories', 3900, 1],
      ['Mechanical Keyboard', 'accessories', 8900, 1],
      ['USB-C Hub', 'accessories', 4500, 1],
      ['4K Monitor', 'displays', 32900, 1],
      ['Webcam 1080p', 'accessories', 5900, 1],
      ['Prototype Dock (unreleased)', 'internal', 0, 0],
      ['Noise-cancelling Headphones', 'audio', 19900, 1],
    ];
    for (const [name, category, priceCents, visible] of products) {
      this.#db.run(
        'INSERT INTO products (name, category, price_cents, visible) VALUES (?, ?, ?, ?)',
        [name, category, priceCents, visible],
      );
    }

    const admins: [string, string, string][] = [
      ['seba', 'PrimaveraFredda!24', 'user'],
      ['catalog_admin', ctx.rng.token(10), 'admin'],
      ['reporting', ctx.rng.token(8), 'user'],
    ];
    for (const [username, password, role] of admins) {
      this.#db.run('INSERT INTO accounts (username, password, role) VALUES (?, ?, ?)', [
        username,
        password,
        role,
      ]);
    }

    this.#db.run('INSERT INTO secrets (name, value) VALUES (?, ?)', ['recovery_flag', this.#state.flag]);
  }

  get db(): SqlEngine {
    return this.#db;
  }
  get state(): CatalogState {
    return this.#state;
  }

  http(req: TargetHttpRequest, ctx: TargetContext): TargetHttpResponse {
    ctx.log('info', 'http', `${req.method} ${req.path}`);
    return (
      this.#router.handle(req, ctx) ??
      html(page('404', tpl`<div class="card"><h1>404</h1></div>`), { status: 404 })
    );
  }

  /** Direct SQL console — a real one, so schema enumeration is practisable. */
  sql(sql: string, ctx: TargetContext): SqlResultView {
    const result = this.#db.query(sql);
    ctx.signal('sql.console.query', {
      rowCount: result.rowCount,
      error: result.error ?? null,
      touchedAccounts: /accounts/i.test(sql),
      touchedSecrets: /secrets/i.test(sql),
    });
    if (result.rows.some((row) => row.some((cell) => typeof cell === 'string' && cell.includes('CL{')))) {
      const flag = this.#state.flag;
      ctx.captureFlag(flag);
    }
    return result;
  }

  /**
   * The catalog exposes one editable file: a config that flips each endpoint
   * between the concatenated (vulnerable) query and the parameterised (safe)
   * one. This is what the "fix" exercise edits — and because the endpoints read
   * this flag on every request, the fix genuinely takes effect on replay.
   */
  files = {
    list: (path: string): FsEntry[] => {
      const entries: FsEntry[] = [
        {
          name: 'config.json',
          path: '/etc/catalog/config.json',
          type: 'file',
          mode: 0o664,
          owner: 'catalog',
          group: 'catalog',
          size: this.#configSource().length,
          mtime: 1_700_000_000_000,
          writable: true,
        },
        {
          name: 'search.php',
          path: '/srv/catalog/search.php',
          type: 'file',
          mode: 0o644,
          owner: 'catalog',
          group: 'catalog',
          size: SEARCH_SOURCE.length,
          mtime: 1_700_000_000_000,
          writable: false,
          readOnlyReason: 'Sorgente di riferimento: qui vedi la concatenazione. Il fix si applica da config.json.',
        },
      ];
      return path.startsWith('/etc/catalog') || path.startsWith('/srv/catalog') || path === '/' ? entries : [];
    },
    read: (path: string): string => {
      if (path === '/etc/catalog/config.json') return this.#configSource();
      if (path === '/srv/catalog/search.php') return SEARCH_SOURCE;
      throw new Error(`No such file: ${path}`);
    },
    write: (path: string, content: string, ctx: TargetContext): void => {
      if (path !== '/etc/catalog/config.json') {
        throw new Error(`${path} is read-only. Edit /etc/catalog/config.json to change query handling.`);
      }
      let parsed: { parameterised?: { search?: boolean; login?: boolean } };
      try {
        parsed = JSON.parse(content) as typeof parsed;
      } catch (error) {
        ctx.signal('config.invalid', { error: String(error) });
        throw new Error(`config.json is not valid JSON: ${String(error)}`);
      }
      const before = { ...this.#state.patched };
      this.#state.patched = {
        search: Boolean(parsed.parameterised?.search),
        login: Boolean(parsed.parameterised?.login),
      };
      ctx.signal('config.updated', { before, after: this.#state.patched });
      ctx.log('info', 'catalog', `Query handling updated: ${JSON.stringify(this.#state.patched)}`);
    },
  };

  #configSource(): string {
    return JSON.stringify(
      {
        parameterised: this.#state.patched,
        _note: 'Set an endpoint to true to use prepared statements instead of string concatenation.',
      },
      null,
      2,
    );
  }

  inspect(what: 'database' | 'sessions' | 'logs' | 'files', _ctx: TargetContext): LabInspectView {
    switch (what) {
      case 'database':
        return { kind: 'database', tables: this.#db.tableNames().map((n) => this.#db.table(n)) };
      case 'sessions':
        return {
          kind: 'sessions',
          sessions: this.#state.sessions.map((s) => ({
            id: s.token,
            userId: s.username,
            username: s.username,
            createdAt: 0,
            data: { role: s.role },
          })),
        };
      case 'logs':
        return { kind: 'logs', entries: [] };
      case 'files':
        return { kind: 'files', root: this.files.list('/') };
    }
  }

  serialize(): unknown {
    return { db: this.#db.dump(), state: this.#state };
  }
  deserialize(data: unknown): void {
    const parsed = data as { db: ReturnType<SqlEngine['dump']>; state: CatalogState };
    this.#db.load(parsed.db);
    this.#state = parsed.state;
  }
  dispose(): void {
    this.#db.close();
  }
}

function buildRouter(target: InjectionTarget): Router<TargetContext> {
  const router = new Router<TargetContext>();

  router.get('/', () => redirect('/search'));

  router.get('/search', (req, ctx) => {
    const term = req.query['q'] ?? '';
    const patched = target.state.patched.search;

    let result: SqlResultView;
    let executed: string;
    if (patched) {
      executed = "SELECT id, name, category, price_cents FROM products WHERE visible = 1 AND name LIKE ?";
      const rows = target.db.select(executed, [`%${term}%`]);
      result = {
        executedSql: executed.replace('?', `'%${term}%'`),
        columns: ['id', 'name', 'category', 'price_cents'],
        rows: rows.map((r) => [r['id'] as number, r['name'] as string, r['category'] as string, r['price_cents'] as number]),
        rowCount: rows.length,
        durationMs: 0,
      };
      ctx.signal('sql.parameterised', { endpoint: '/search' });
    } else {
      // The vulnerability, in one line: user input concatenated into SQL.
      executed = `SELECT id, name, category, price_cents FROM products WHERE visible = 1 AND name LIKE '%${term}%'`;
      result = target.db.query(executed);
      ctx.signal('sql.concatenated', { endpoint: '/search', input: term });
      if (result.error) {
        ctx.signal('sqli.error-based', { endpoint: '/search', error: result.error });
      }
      // Did the learner reach rows the filter should have hidden?
      const leakedHidden = !result.error && exposedHiddenProduct(result);
      const leakedOtherTable = !result.error && exposedForeignColumns(result);
      if (leakedHidden) ctx.signal('sqli.filter-bypass', { endpoint: '/search' });
      if (leakedOtherTable) {
        ctx.signal('sqli.union.cross-table', { endpoint: '/search' });
        if (rowsContainFlag(result)) ctx.captureFlag(target.state.flag);
        if (rowsContainCredentials(result)) ctx.signal('sqli.credentials-dumped', { endpoint: '/search' });
      }
    }

    return html(
      page(
        'Catalog',
        tpl`
      <nav class="topbar"><strong>Catalog</strong><a href="/login">Staff login</a></nav>
      <div class="card">
        <form method="GET" action="/search">
          <input name="q" value="${term}" placeholder="Search products…" autofocus />
          <button>Search</button>
        </form>
        <p class="muted">${result.error ? raw(`<span class="error">SQL error: ${escapeHtml(result.error)}</span>`) : raw(`${result.rowCount} result(s)`)}</p>
        ${raw(renderRows(result))}
      </div>`,
      ),
      {
        serverNotes: [
          patched
            ? 'This endpoint binds the search term as a parameter.'
            : 'This endpoint concatenates the search term directly into the SQL string.',
          `Executed: ${result.executedSql}`,
        ],
      },
    );
  });

  router.get('/login', (req) => loginPage(req.query['error']));

  router.post('/login', (req, ctx) => {
    // An unreadable body is an encoding problem, not a wrong password.
    const problem = formBodyProblem(req);
    if (problem) {
      return html(page('Accesso staff', `<div class="card"><p class="error">${problem}</p></div>`), {
        status: 400,
        serverNotes: [problem],
      });
    }
    const username = req.form['username'] ?? '';
    const password = req.form['password'] ?? '';
    const patched = target.state.patched.login;

    let row: Record<string, unknown> | undefined;
    let executed: string;
    if (patched) {
      executed = 'SELECT id, username, role FROM accounts WHERE username = ? AND password = ?';
      row = target.db.select(executed, [username, password])[0];
      ctx.signal('sql.parameterised', { endpoint: '/login' });
    } else {
      executed = `SELECT id, username, role FROM accounts WHERE username = '${username}' AND password = '${password}'`;
      const result = target.db.query(executed);
      ctx.signal('sql.concatenated', { endpoint: '/login', username });
      if (result.error) ctx.signal('sqli.error-based', { endpoint: '/login', error: result.error });
      row = result.rows[0]
        ? { id: result.rows[0][0], username: result.rows[0][1], role: result.rows[0][2] }
        : undefined;

      // Authentication bypass: a row came back for a password that does not match.
      if (row) {
        const realPw = target.db.select('SELECT password FROM accounts WHERE username = ?', [
          String(row['username']),
        ])[0]?.['password'];
        const bypassed = realPw !== password;
        if (bypassed) {
          ctx.signal('sqli.auth-bypass', {
            endpoint: '/login',
            landedAs: String(row['username']),
            role: String(row['role']),
          });
          if (String(row['role']) === 'admin') {
            ctx.signal('sqli.auth-bypass.admin', { landedAs: String(row['username']) });
            ctx.captureFlag(target.state.flag);
          }
        }
      }
    }

    if (!row) {
      ctx.signal('auth.failed', { username });
      return redirect('/login?error=Invalid+credentials');
    }

    const token = `cat_${ctx.rng.token(16)}`;
    target.state.sessions.push({ token, username: String(row['username']), role: String(row['role']) });
    const response = redirect('/account');
    setCookie(response, 'catalog_session', token, { path: '/', httpOnly: true });
    response.serverNotes = [`Executed: ${executed}`, `Row returned → signed in as ${String(row['username'])}.`];
    return response;
  });

  router.get('/account', (req) => {
    const token = req.cookies['catalog_session'];
    const session = target.state.sessions.find((s) => s.token === token);
    if (!session) return redirect('/login');
    const isAdmin = session.role === 'admin';
    return html(
      page(
        'Account',
        tpl`
        <nav class="topbar"><strong>Catalog</strong><span class="muted">${session.username}</span></nav>
        <div class="card">
          <h1>Welcome, ${session.username}</h1>
          <p>Role: <span class="tag ${isAdmin ? 'danger' : ''}">${session.role}</span></p>
          ${isAdmin ? raw(`<p>Admin recovery flag: <code>${escapeHtml(target.state.flag)}</code></p>`) : raw('<p class="muted">Standard account.</p>')}
        </div>`,
      ),
    );
  });

  return router;
}

// ── injection detection helpers ──────────────────────────────────────────────
// These read the *result* of a genuinely-executed query. They never inspect the
// learner's payload, so any technique that reaches the data scores, including
// ones the author never thought of.

function exposedHiddenProduct(result: SqlResultView): boolean {
  const nameIdx = result.columns.indexOf('name');
  if (nameIdx === -1) return false;
  return result.rows.some((row) => String(row[nameIdx] ?? '').includes('unreleased'));
}

function exposedForeignColumns(result: SqlResultView): boolean {
  return result.rows.some((row) =>
    row.some((cell) => typeof cell === 'string' && (/CL\{/.test(cell) || /^\$?[a-f0-9]{8,}$/i.test(cell))),
  );
}

function rowsContainFlag(result: SqlResultView): boolean {
  return result.rows.some((row) => row.some((cell) => typeof cell === 'string' && cell.includes('CL{')));
}

function rowsContainCredentials(result: SqlResultView): boolean {
  return result.rows.some((row) =>
    row.some((cell) => typeof cell === 'string' && /(admin|reporting|catalog_admin)/.test(cell)),
  );
}

// ── presentation ─────────────────────────────────────────────────────────────

function renderRows(result: SqlResultView): string {
  if (result.error || result.rows.length === 0) return '';
  const head = result.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('');
  const body = result.rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(String(cell ?? 'NULL'))}</td>`).join('')}</tr>`)
    .join('');
  return `<table class="grid"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function loginPage(error?: string): TargetHttpResponse {
  return html(
    page(
      'Staff login',
      tpl`
      <div class="card narrow">
        <h1>Staff login</h1>
        ${error ? raw(`<p class="error">${escapeHtml(error)}</p>`) : raw('')}
        <form method="POST" action="/login">
          <label>Username <input name="username" /></label>
          <label>Password <input name="password" type="password" /></label>
          <button>Sign in</button>
        </form>
      </div>`,
    ),
  );
}

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)} · Catalog</title>
<style>
:root{color-scheme:dark;--bg:#0d1117;--panel:#161b22;--line:#26303d;--text:#d7dee8;--muted:#7d8899;--accent:#6ee7b7;--danger:#f4666a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.6 ui-sans-serif,system-ui,sans-serif}
.topbar{display:flex;gap:16px;align-items:center;padding:12px 20px;background:var(--panel);border-bottom:1px solid var(--line)}
.topbar a{margin-left:auto;color:var(--accent)}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:22px;margin:24px auto;max-width:680px}
.card.narrow{max-width:360px;margin-top:60px}
h1{font-size:20px;margin:0 0 12px}a{color:var(--accent)}.muted{color:var(--muted)}.error{color:var(--danger)}
form{display:flex;gap:8px;margin-bottom:12px}label{display:block;flex:1}
input{width:100%;padding:9px 11px;background:#0d1117;border:1px solid var(--line);border-radius:6px;color:var(--text);font:inherit}
button{padding:9px 18px;background:var(--accent);border:0;border-radius:6px;color:#04121f;font:inherit;font-weight:600;cursor:pointer}
code{font-family:ui-monospace,Menlo,monospace}
.tag{display:inline-block;padding:1px 8px;border:1px solid var(--line);border-radius:999px;font-size:11px;color:var(--muted)}
.tag.danger{border-color:var(--danger);color:var(--danger)}
.grid{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}
.grid th,.grid td{border:1px solid var(--line);padding:6px 10px;text-align:left}
.grid th{background:#0d1117;color:var(--muted);font-weight:600}
</style></head><body>${body}</body></html>`;
}

const SEARCH_SOURCE = `<?php
// catalog/search.php — product search
$term = $_GET['q'] ?? '';
$config = json_decode(file_get_contents('/etc/catalog/config.json'), true);

if ($config['parameterised']['search']) {
    // SAFE: the term is bound as a parameter.
    $stmt = $db->prepare(
        'SELECT id,name,category,price_cents FROM products WHERE visible=1 AND name LIKE ?');
    $stmt->execute(['%' . $term . '%']);
} else {
    // VULNERABLE: the term is concatenated straight into the SQL string.
    $sql = "SELECT id,name,category,price_cents FROM products
            WHERE visible=1 AND name LIKE '%" . $term . "%'";
    $rows = $db->query($sql);
}
`;

const SCHEMA = `
CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  visible INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user'
);
CREATE TABLE secrets (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export const injectionBuilder: TargetBuilder = {
  id: 'web.injection',
  description:
    'Catalog search + staff login that assemble SQL by concatenation. Real SQLite: filter bypass, UNION exfiltration, error-based enumeration and auth bypass all execute for real.',
  build: (spec, ctx) => new InjectionTarget(spec, ctx),
};
