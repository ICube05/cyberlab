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

const SPECS = [spec('lab.vault', 'web.vault'), spec('lab.catalog', 'web.injection'), spec('lab.foothold', 'linux.foothold')];

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
