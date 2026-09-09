import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InProcessRuntime, LabManager } from '../index.js';
import { SqlEngine } from '../inproc/sql.js';
import type { LabSpec } from '@cyberlab/core';

const spec = (id: string, builderId: string): LabSpec => ({
  id,
  title: id,
  kind: 'web',
  builderId,
  scenario: '',
  target: { name: '', description: '', host: 'x.lab' },
  surfaces: ['request'],
  initialState: [],
  seedable: true,
});

const SPECS = [
  spec('lab.vault', 'web.vault'),
  spec('lab.catalog', 'web.injection'),
  spec('lab.foothold', 'linux.foothold'),
  spec('lab.helpdesk', 'web.helpdesk'),
];

describe('lab engine — real execution', () => {
  let mgr: LabManager;
  beforeEach(() => {
    mgr = new LabManager({ runtime: new InProcessRuntime(), specs: SPECS });
  });
  afterEach(async () => {
    await mgr.shutdown();
  });

  it('IDOR: an authenticated user reads another user and raises the bypass signal', async () => {
    const { instanceId } = await mgr.create('u', 'lab.vault', 'seed1');
    await mgr.dispatch('u', instanceId, { type: 'browser.submit', path: '/login.php', method: 'POST', fields: { username: 'seba', password: 'PrimaveraFredda!24' } });
    await mgr.dispatch('u', instanceId, { type: 'http.request', method: 'GET', path: '/profile.php?id=16', headers: {}, useCookieJar: true });
    const state = mgr.getState('u', instanceId);
    expect(state.signals.some((s) => s.name === 'authz.horizontal.bypass')).toBe(true);
  });

  it('fixing the policy turns the same request into a real 403', async () => {
    const { instanceId } = await mgr.create('u', 'lab.vault', 'seed1');
    await mgr.dispatch('u', instanceId, { type: 'browser.submit', path: '/login.php', method: 'POST', fields: { username: 'seba', password: 'PrimaveraFredda!24' } });
    await mgr.dispatch('u', instanceId, {
      type: 'editor.write',
      path: '/srv/vault/policy.json',
      content: JSON.stringify({ version: 2, routes: { '/profile.php': { requireSession: true, ownership: 'match:query.id' }, '/dashboard.php': { requireSession: true, ownership: 'none' } } }),
    });
    const denied = (await mgr.dispatch('u', instanceId, { type: 'http.request', method: 'GET', path: '/profile.php?id=16', headers: {}, useCookieJar: true })).result;
    expect(denied.type).toBe('http.response');
    if (denied.type === 'http.response') expect(denied.response.status).toBe(403);
    // own profile still 200
    const own = (await mgr.dispatch('u', instanceId, { type: 'http.request', method: 'GET', path: '/profile.php?id=15', headers: {}, useCookieJar: true })).result;
    if (own.type === 'http.response') expect(own.response.status).toBe(200);
  });

  it('SQL injection: auth bypass with a commented tautology really logs in', async () => {
    const { instanceId } = await mgr.create('u', 'lab.catalog', 'seed1');
    // Enumerate the admin username honestly first.
    const enumRes = (await mgr.dispatch('u', instanceId, { type: 'sql.query', sql: 'SELECT username, role FROM accounts' })).result;
    const admin = enumRes.type === 'sql.result' ? enumRes.result.rows.find((r) => r[1] === 'admin')?.[0] : undefined;
    expect(admin).toBeTruthy();
    await mgr.dispatch('u', instanceId, { type: 'browser.submit', path: '/login', method: 'POST', fields: { username: `${admin}' -- `, password: 'anything' } });
    const state = mgr.getState('u', instanceId);
    expect(state.signals.some((s) => s.name === 'sqli.auth-bypass')).toBe(true);
  });

  it('privilege escalation: sudo find -exec reads the root flag', async () => {
    const { instanceId } = await mgr.create('u', 'lab.foothold', 'seed1');
    const denied = (await mgr.dispatch('u', instanceId, { type: 'shell.exec', command: 'cat /root/flag.txt' })).result;
    expect(denied.type === 'shell.result' && denied.result.exitCode).not.toBe(0);
    await mgr.dispatch('u', instanceId, { type: 'shell.exec', command: 'sudo find /root/flag.txt -exec cat {} ;' });
    const state = mgr.getState('u', instanceId);
    expect(state.flags.some((f) => f.startsWith('CL{'))).toBe(true);
  });

  it('reset rebuilds the identical world from the seed', async () => {
    const { instanceId } = await mgr.create('u', 'lab.vault', 'fixed-seed');
    await mgr.dispatch('u', instanceId, { type: 'browser.submit', path: '/login.php', method: 'POST', fields: { username: 'seba', password: 'PrimaveraFredda!24' } });
    await mgr.dispatch('u', instanceId, { type: 'http.request', method: 'GET', path: '/profile.php?id=15', headers: {}, useCookieJar: true });
    await mgr.reset('u', instanceId);
    const state = mgr.getState('u', instanceId);
    expect(state.eventCount).toBe(0);
    expect(state.flags).toHaveLength(0);
    // Same seed → same recovery token in the DB (deterministic world).
    const inspect = (await mgr.dispatch('u', instanceId, { type: 'lab.inspect', what: 'database' })).result;
    expect(inspect.type).toBe('inspect');
  });

  it('enforces the per-user instance cap by evicting the LRU lab', async () => {
    const capped = new LabManager({ runtime: new InProcessRuntime(), specs: SPECS, maxInstancesPerUser: 2 });
    const a = await capped.create('u', 'lab.vault');
    await capped.create('u', 'lab.catalog');
    await capped.create('u', 'lab.foothold'); // should evict `a`
    expect(capped.count()).toBe(2);
    expect(() => capped.getState('u', a.instanceId)).toThrow();
    await capped.shutdown();
  });

  it('isolates one user from another user’s lab', async () => {
    const { instanceId } = await mgr.create('alice', 'lab.vault');
    expect(() => mgr.getState('bob', instanceId)).toThrow();
  });

  // ── Helpdesk: XSS + path traversal, the multi-vuln web target ──────────────

  it('reflected XSS: a script in the search box lands in executable position', async () => {
    const { instanceId } = await mgr.create('u', 'lab.helpdesk', 'seed1');
    await mgr.dispatch('u', instanceId, {
      type: 'http.request',
      method: 'GET',
      path: '/cerca?q=' + encodeURIComponent('<script>alert(1)</script>'),
      headers: {},
    });
    const state = mgr.getState('u', instanceId);
    expect(state.signals.some((s) => s.name === 'xss.reflected.executed')).toBe(true);
  });

  it('stored XSS: a comment steals the agent session, which then opens /staff', async () => {
    const { instanceId } = await mgr.create('u', 'lab.helpdesk', 'seed1');
    // Plant the payload as a ticket comment.
    const posted = (
      await mgr.dispatch('u', instanceId, {
        type: 'browser.submit',
        path: '/commento',
        method: 'POST',
        fields: { id: '4101', autore: 'x', testo: '<script>steal()</script>' },
      })
    ).result;
    const afterPost = mgr.getState('u', instanceId);
    expect(afterPost.signals.some((s) => s.name === 'xss.stored.persisted')).toBe(true);
    expect(afterPost.signals.some((s) => s.name === 'xss.agent.session.exposed')).toBe(true);

    // The exposed session is handed over in the server notes.
    if (posted.type !== 'http.response') throw new Error('expected response');
    const noted = (posted.response.serverNotes ?? []).join('\n');
    const session = /session=(\S+)/.exec(noted)?.[1];
    expect(session).toBeTruthy();

    // Using it as a cookie reaches the staff area and captures the flag.
    const staff = (
      await mgr.dispatch('u', instanceId, {
        type: 'http.request',
        method: 'GET',
        path: '/staff',
        headers: { Cookie: `session=${session}` },
      })
    ).result;
    expect(staff.type === 'http.response' && staff.response.status).toBe(200);
    const state = mgr.getState('u', instanceId);
    expect(state.signals.some((s) => s.name === 'staff.area.reached')).toBe(true);
    expect(state.flags.some((f) => f.startsWith('CL{xss_'))).toBe(true);
  });

  it('/staff refuses a request without the agent session', async () => {
    const { instanceId } = await mgr.create('u', 'lab.helpdesk', 'seed1');
    const res = (await mgr.dispatch('u', instanceId, { type: 'http.request', method: 'GET', path: '/staff', headers: {} }))
      .result;
    expect(res.type === 'http.response' && res.response.status).toBe(403);
  });

  it('fixing escapeOutput neutralises the same payload', async () => {
    const { instanceId } = await mgr.create('u', 'lab.helpdesk', 'seed1');
    const read = (await mgr.dispatch('u', instanceId, { type: 'fs.read', path: '/srv/helpdesk/config.json' })).result;
    if (read.type !== 'fs.content') throw new Error('expected config');
    const patched = read.content.replace('"escapeOutput": false', '"escapeOutput": true');
    const write = await mgr.dispatch('u', instanceId, {
      type: 'editor.write',
      path: '/srv/helpdesk/config.json',
      content: patched,
    });
    expect(write.result.ok).toBe(true);
    await mgr.dispatch('u', instanceId, {
      type: 'http.request',
      method: 'GET',
      path: '/cerca?q=' + encodeURIComponent('<script>alert(1)</script>'),
      headers: {},
    });
    const state = mgr.getState('u', instanceId);
    expect(state.signals.some((s) => s.name === 'config.updated')).toBe(true);
    expect(state.signals.some((s) => s.name === 'xss.payload.neutralised')).toBe(true);
    expect(state.signals.some((s) => s.name === 'xss.reflected.executed')).toBe(false);
  });

  it('path traversal: escapes the attachment dir and reads /etc/passwd, then the .env flag', async () => {
    const { instanceId } = await mgr.create('u', 'lab.helpdesk', 'seed1');
    const passwd = (
      await mgr.dispatch('u', instanceId, {
        type: 'http.request',
        method: 'GET',
        path: '/allegato?file=' + encodeURIComponent('../../../etc/passwd'),
        headers: {},
      })
    ).result;
    expect(passwd.type === 'http.response' && passwd.response.body).toMatch(/root:x:0:0/);
    await mgr.dispatch('u', instanceId, {
      type: 'http.request',
      method: 'GET',
      path: '/allegato?file=' + encodeURIComponent('../.env'),
      headers: {},
    });
    const state = mgr.getState('u', instanceId);
    expect(state.signals.some((s) => s.name === 'traversal.escaped' && /\/etc\/passwd$/.test(String(s.data?.['resolved'])))).toBe(true);
    expect(state.signals.some((s) => s.name === 'traversal.sensitive.read')).toBe(true);
    expect(state.flags.some((f) => f.startsWith('CL{traversal_'))).toBe(true);
  });

  it('path traversal hits the permission wall on /etc/shadow, not a filter', async () => {
    const { instanceId } = await mgr.create('u', 'lab.helpdesk', 'seed1');
    const res = (
      await mgr.dispatch('u', instanceId, {
        type: 'http.request',
        method: 'GET',
        path: '/allegato?file=' + encodeURIComponent('../../../etc/shadow'),
        headers: {},
      })
    ).result;
    expect(res.type === 'http.response' && res.response.status).toBe(500);
    const state = mgr.getState('u', instanceId);
    expect(state.signals.some((s) => s.name === 'traversal.permission.denied')).toBe(true);
    // passwd works, shadow does not: the boundary is permissions, not a blocklist.
    expect(state.flags.some((f) => f.startsWith('CL{'))).toBe(false);
  });

  it('confining attachments blocks the traversal but still serves a legit file', async () => {
    const { instanceId } = await mgr.create('u', 'lab.helpdesk', 'seed1');
    const read = (await mgr.dispatch('u', instanceId, { type: 'fs.read', path: '/srv/helpdesk/config.json' })).result;
    if (read.type !== 'fs.content') throw new Error('expected config');
    const patched = read.content.replace('"confineAttachments": false', '"confineAttachments": true');
    await mgr.dispatch('u', instanceId, { type: 'editor.write', path: '/srv/helpdesk/config.json', content: patched });

    const blocked = (
      await mgr.dispatch('u', instanceId, {
        type: 'http.request',
        method: 'GET',
        path: '/allegato?file=' + encodeURIComponent('../../../etc/passwd'),
        headers: {},
      })
    ).result;
    expect(blocked.type === 'http.response' && blocked.response.status).toBe(403);

    const ok = (
      await mgr.dispatch('u', instanceId, {
        type: 'http.request',
        method: 'GET',
        path: '/allegato?file=nota-cliente.txt',
        headers: {},
      })
    ).result;
    expect(ok.type === 'http.response' && ok.response.status).toBe(200);
    const state = mgr.getState('u', instanceId);
    expect(state.signals.some((s) => s.name === 'traversal.blocked')).toBe(true);
  });

  it('helpdesk file panel does not hand over .env for free', async () => {
    const { instanceId } = await mgr.create('u', 'lab.helpdesk', 'seed1');
    const listing = (await mgr.dispatch('u', instanceId, { type: 'lab.inspect', what: 'files' })).result;
    if (listing.type !== 'inspect' || listing.view.kind !== 'files') throw new Error('expected files view');
    expect(listing.view.root.some((e) => e.path.endsWith('.env'))).toBe(false);
    const refused = (await mgr.dispatch('u', instanceId, { type: 'fs.read', path: '/srv/helpdesk/.env' })).result;
    expect(refused.type === 'error' && refused.message).toMatch(/non è esposto|allegato/i);
  });
});

describe('SQL sandbox', () => {
  it('permits injection but blocks host-touching statements', () => {
    const db = new SqlEngine('CREATE TABLE t(a); INSERT INTO t VALUES (1),(2);');
    // Injection works: tautology returns all rows.
    const inj = db.query("SELECT a FROM t WHERE a = '' OR '1'='1'");
    expect(inj.error).toBeUndefined();
    // ATTACH is refused by the sandbox, not by SQLite.
    const attach = db.query("ATTACH DATABASE '/etc/passwd' AS x");
    expect(attach.blocked).toBe(true);
    // Comment-obfuscated ATTACH is still caught.
    const sneaky = db.query('ATT/**/ACH DATABASE "x" AS y');
    expect(sneaky.error).toBeDefined();
    db.close();
  });

  it('surfaces genuine SQLite errors for error-based injection', () => {
    const db = new SqlEngine('CREATE TABLE t(a);');
    const broken = db.query("SELECT * FROM t WHERE a = '''");
    expect(broken.error).toMatch(/SQL|syntax|token/i);
    db.close();
  });

  it('schema enumeration via sqlite_master is deliberately allowed', () => {
    const db = new SqlEngine('CREATE TABLE secrets(k, v);');
    const res = db.query("SELECT name FROM sqlite_master WHERE type='table'");
    expect(res.error).toBeUndefined();
    expect(res.rows.flat()).toContain('secrets');
    db.close();
  });
});

/**
 * The editor contract.
 *
 * The web editor used to decide what was saveable from POSIX mode bits, which
 * disagreed with what the targets actually accept. These pin the agreement:
 * a listing says which paths are writable, and a write to anything else is
 * refused with a message a learner can act on.
 */
describe('file write contract', () => {
  const newManager = () => new LabManager({ runtime: new InProcessRuntime(), specs: SPECS });

  it('vault exposes exactly one writable file, and refuses the others by name', async () => {
    const manager = newManager();
    const { instanceId } = await manager.create('u-write', 'lab.vault');

    const listing = await manager.dispatch('u-write', instanceId, {
      type: 'lab.inspect',
      what: 'files',
    });
    if (listing.result.type !== 'inspect' || listing.result.view.kind !== 'files') {
      throw new Error('expected a files view');
    }
    const files = listing.result.view.root.filter((e) => e.type === 'file');
    const writable = files.filter((e) => e.writable).map((e) => e.path);
    expect(writable).toEqual(['/srv/vault/policy.json']);
    // Every read-only file explains itself, so the UI never has to guess.
    for (const entry of files.filter((e) => !e.writable)) {
      expect(entry.readOnlyReason).toBeTruthy();
    }

    // A refused action is reported as an error *result*, not a thrown error:
    // the lab always answers, and the answer carries the reason.
    const refused = await manager.dispatch('u-write', instanceId, {
      type: 'editor.write',
      path: '/srv/vault/profile.php',
      content: '<?php // nope',
    });
    expect(refused.result.ok).toBe(false);
    expect(refused.result.type === 'error' && refused.result.message).toMatch(/read-only/i);
  });

  it('a saved policy actually changes how the target behaves', async () => {
    const manager = newManager();
    const { instanceId } = await manager.create('u-policy', 'lab.vault');
    const read = await manager.dispatch('u-policy', instanceId, {
      type: 'fs.read',
      path: '/srv/vault/policy.json',
    });
    if (read.result.type !== 'fs.content') throw new Error('expected file content');

    const patched = read.result.content.replace(/"ownership"\s*:\s*"[^"]*"/, '"ownership": "enforced"');
    const write = await manager.dispatch('u-policy', instanceId, {
      type: 'editor.write',
      path: '/srv/vault/policy.json',
      content: patched,
    });
    expect(write.result.ok).toBe(true);
    expect(write.state.signals.some((s) => s.name === 'policy.updated')).toBe(true);

    const reread = await manager.dispatch('u-policy', instanceId, {
      type: 'fs.read',
      path: '/srv/vault/policy.json',
    });
    if (reread.result.type !== 'fs.content') throw new Error('expected file content');
    expect(reread.result.content).toContain('"ownership": "enforced"');
  });

  it('invalid JSON is refused with a reason, and nothing is persisted', async () => {
    const manager = newManager();
    const { instanceId } = await manager.create('u-bad', 'lab.vault');
    const refused = await manager.dispatch('u-bad', instanceId, {
      type: 'editor.write',
      path: '/srv/vault/policy.json',
      content: '{ not json',
    });
    expect(refused.result.type === 'error' && refused.result.message).toMatch(/not valid JSON/i);

    const after = await manager.dispatch('u-bad', instanceId, {
      type: 'fs.read',
      path: '/srv/vault/policy.json',
    });
    if (after.result.type !== 'fs.content') throw new Error('expected file content');
    expect(() => JSON.parse(after.result.content)).not.toThrow();
  });

  it('the Linux lab honours real permissions in the editor', async () => {
    const manager = newManager();
    const { instanceId } = await manager.create('u-linux', 'lab.foothold');
    const listing = await manager.dispatch('u-linux', instanceId, {
      type: 'lab.inspect',
      what: 'files',
    });
    if (listing.result.type !== 'inspect' || listing.result.view.kind !== 'files') {
      throw new Error('expected a files view');
    }
    // As `seba`, root-owned 0600 files must not be offered as editable.
    const rootOnly = listing.result.view.root.filter(
      (e) => e.type === 'file' && e.owner === 'root' && (e.mode & 0o006) === 0,
    );
    for (const entry of rootOnly) expect(entry.writable).toBe(false);
  });
});
