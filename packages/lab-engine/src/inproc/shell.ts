import type { ShellResultView } from '@cyberlab/core';
import { Vfs, modeString, normalizePath, type User } from './vfs.js';
import type { TargetContext } from './target.js';

/**
 * A small, real shell interpreter over the VFS.
 *
 * "Real" means: `cat` on a file the current user cannot read genuinely fails
 * with a permission error, `cd` into a directory without +x is refused, `sudo`
 * consults an actual sudoers table, and a setuid binary genuinely runs with its
 * owner's authority. The command set is small on purpose — it is enough to
 * teach enumeration and a real privilege-escalation path, and every command is
 * a function you can read, not a canned transcript.
 */

export interface ShellEnv {
  vfs: Vfs;
  users: Record<string, User>;
  currentUser: string;
  cwd: string;
  host: string;
  /** username -> what they may run as, or '*' for anything. */
  sudoers: Record<string, { runAs: string[]; nopasswd: boolean; commands: string[] }>;
  env: Record<string, string>;
}

export interface ShellHooks {
  onSignal?: (name: string, data?: Record<string, unknown>) => void;
  onReadFile?: (path: string, content: string) => void;
  onFlag?: (value: string) => void;
}

const FLAG_RE = /CL\{[^}]+\}/;

export function runCommand(
  input: string,
  env: ShellEnv,
  ctx: TargetContext,
  hooks: ShellHooks = {},
): ShellResultView {
  const user = env.users[env.currentUser]!;
  const trimmed = input.trim();
  const base = (stdout = '', stderr = '', exitCode = 0): ShellResultView => ({
    stdout,
    stderr,
    exitCode,
    cwd: env.cwd,
    user: env.currentUser,
    host: env.host,
  });

  if (!trimmed) return base();

  // One pipeline stage of `grep` support, because enumeration lives on grep.
  const [command, pipeTarget] = splitPipe(trimmed);
  const [rawCmd, ...args] = tokenize(command);
  if (!rawCmd) return base();
  // Commands are commonly invoked by absolute path (sudo needs the full path in
  // sudoers), so normalise `/usr/bin/find` down to `find` before dispatch.
  const cmd = rawCmd.includes('/') ? rawCmd.slice(rawCmd.lastIndexOf('/') + 1) : rawCmd;

  let result: ShellResultView;
  switch (cmd) {
    case 'help':
      result = base(
        'Available: ls, cd, pwd, cat, echo, whoami, id, find, grep, chmod, ps, sudo, cat, env, uname, clear, help',
      );
      break;
    case 'pwd':
      result = base(env.cwd);
      break;
    case 'whoami':
      result = base(env.currentUser);
      break;
    case 'id': {
      const groups = user.groups.join(',');
      result = base(`uid=${user.uid}(${user.name}) groups=${groups}`);
      break;
    }
    case 'uname':
      result = base('Linux lab 6.1.0-cyberlab x86_64 GNU/Linux');
      break;
    case 'env':
      result = base(Object.entries(env.env).map(([k, v]) => `${k}=${v}`).join('\n'));
      break;
    case 'echo':
      result = base(args.join(' '));
      break;
    case 'clear':
      result = base('\x1b[2J\x1b[H');
      break;
    case 'ls':
      result = cmdLs(args, env, user);
      break;
    case 'cd':
      result = cmdCd(args, env, user);
      break;
    case 'cat':
      result = cmdCat(args, env, user, ctx, hooks);
      break;
    case 'find':
      result = cmdFind(args, env, user, ctx, hooks);
      break;
    case 'grep':
      result = cmdGrep(args, env, user, ctx, hooks);
      break;
    case 'chmod':
      result = cmdChmod(args, env, user, ctx);
      break;
    case 'ps':
      result = base(
        'PID   USER     COMMAND\n' +
          '  1   root     /sbin/init\n' +
          '412   root     /usr/sbin/cron\n' +
          `900   ${env.currentUser.padEnd(8)} -bash\n` +
          '901   root     /usr/local/bin/backup.sh',
      );
      break;
    case 'sudo':
      result = cmdSudo(args, env, ctx, hooks);
      break;
    default:
      result = base('', `${cmd}: command not found`, 127);
  }

  if (pipeTarget) result = applyGrep(result, pipeTarget);
  return result;
}

// ── commands ─────────────────────────────────────────────────────────────────

function make(env: ShellEnv, stdout = '', stderr = '', exitCode = 0): ShellResultView {
  return { stdout, stderr, exitCode, cwd: env.cwd, user: env.currentUser, host: env.host };
}

function cmdLs(args: string[], env: ShellEnv, user: User): ShellResultView {
  const long = args.includes('-l') || args.includes('-la') || args.includes('-al');
  const all = args.includes('-a') || args.includes('-la') || args.includes('-al');
  const targets = args.filter((a) => !a.startsWith('-'));
  const path = resolve(env, targets[0] ?? '.');

  const node = env.vfs.lookup(path);
  if (!node) return make(env, '', `ls: cannot access '${targets[0] ?? path}': No such file or directory`, 2);
  if (node.type !== 'dir') {
    const entry = env.vfs.entry(path)!;
    return make(env, long ? longFormat([entry]) : entry.name);
  }
  if (!env.vfs.can(node, user, 'r')) {
    return make(env, '', `ls: cannot open directory '${targets[0] ?? path}': Permission denied`, 2);
  }
  let entries = env.vfs.list(path);
  if (!all) entries = entries.filter((e) => !e.name.startsWith('.'));
  return make(env, long ? longFormat(entries) : entries.map((e) => e.name).join('  '));
}

function cmdCd(args: string[], env: ShellEnv, user: User): ShellResultView {
  const target = args[0] ?? env.users[env.currentUser]!.home;
  const path = resolve(env, target);
  const node = env.vfs.lookup(path);
  if (!node) return make(env, '', `cd: ${target}: No such file or directory`, 1);
  if (node.type !== 'dir') return make(env, '', `cd: ${target}: Not a directory`, 1);
  if (!env.vfs.can(node, user, 'x')) return make(env, '', `cd: ${target}: Permission denied`, 1);
  env.cwd = path;
  return make(env);
}

function cmdCat(
  args: string[],
  env: ShellEnv,
  user: User,
  ctx: TargetContext,
  hooks: ShellHooks,
): ShellResultView {
  const files = args.filter((a) => !a.startsWith('-'));
  if (files.length === 0) return make(env, '', 'cat: missing operand', 1);
  const out: string[] = [];
  const err: string[] = [];
  let exit = 0;
  for (const file of files) {
    const path = resolve(env, file);
    const node = env.vfs.lookup(path);
    if (!node) {
      err.push(`cat: ${file}: No such file or directory`);
      exit = 1;
      continue;
    }
    if (node.type === 'dir') {
      err.push(`cat: ${file}: Is a directory`);
      exit = 1;
      continue;
    }
    if (!env.vfs.can(node, user, 'r')) {
      ctx.signal('fs.read.denied', { path, user: user.name });
      err.push(`cat: ${file}: Permission denied`);
      exit = 1;
      continue;
    }
    const content = node.content ?? '';
    ctx.signal('fs.read', { path, user: user.name });
    hooks.onReadFile?.(path, content);
    const flag = FLAG_RE.exec(content);
    if (flag) hooks.onFlag?.(flag[0]);
    out.push(content);
  }
  return make(env, out.join('\n'), err.join('\n'), exit);
}

function cmdFind(
  args: string[],
  env: ShellEnv,
  user: User,
  ctx: TargetContext,
  hooks: ShellHooks,
): ShellResultView {
  const start = resolve(env, args[0] && !args[0].startsWith('-') ? args[0] : '.');
  const permIdx = args.indexOf('-perm');
  const nameIdx = args.indexOf('-name');
  const execIdx = args.indexOf('-exec');
  const wantPerm = permIdx !== -1 ? args[permIdx + 1] : undefined;
  const wantName = nameIdx !== -1 ? args[nameIdx + 1]?.replace(/[*"']/g, '') : undefined;

  const results: string[] = [];
  const walk = (path: string) => {
    const node = env.vfs.lookup(path);
    if (!node) return;
    if (node.type === 'dir') {
      if (!env.vfs.can(node, user, 'r')) return;
      for (const entry of env.vfs.list(path)) {
        matchFind(entry, wantPerm, wantName, results);
        if (entry.type === 'dir') walk(entry.path);
      }
    }
  };
  const startEntry = env.vfs.entry(start);
  if (startEntry) matchFind(startEntry, wantPerm, wantName, results);
  walk(start);

  // `-exec CMD {} ;` runs CMD once per match, with the *current* privileges.
  // This is the real GTFOBins escalation: run find as root, and its -exec runs
  // as root too. The interpreter honours that because runCommand carries the
  // elevated env down here unchanged.
  if (execIdx !== -1) {
    const term = args.findIndex((a, i) => i > execIdx && (a === ';' || a === '\\;' || a === '{};'));
    const execArgs = args.slice(execIdx + 1, term === -1 ? undefined : term);
    if (execArgs.length > 0) {
      ctx.signal('shell.find-exec', { command: execArgs.join(' ') });
      const out: string[] = [];
      const targets = results.length ? results : [''];
      for (const match of targets) {
        const rendered = execArgs.map((a) => (a === '{}' ? match : a)).join(' ');
        const inner = runCommand(rendered, env, ctx, hooks);
        if (inner.stdout) out.push(inner.stdout);
        if (inner.stderr) out.push(inner.stderr);
      }
      return make(env, out.join('\n'));
    }
  }

  return make(env, results.join('\n'));
}

function matchFind(
  entry: { path: string; mode: number; name: string },
  wantPerm: string | undefined,
  wantName: string | undefined,
  out: string[],
): void {
  if (wantPerm) {
    const target = parseInt(wantPerm.replace(/^-/, ''), 8);
    if (wantPerm.startsWith('-')) {
      if ((entry.mode & target) !== target) return;
    } else if ((entry.mode & 0o7777) !== target) return;
  }
  if (wantName && !new RegExp('^' + wantName.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$').test(entry.name)) {
    return;
  }
  out.push(entry.path);
}

function cmdGrep(
  args: string[],
  env: ShellEnv,
  user: User,
  ctx: TargetContext,
  hooks: ShellHooks,
): ShellResultView {
  const recursive = args.some((a) => a === '-r' || a === '-R' || a === '-rn');
  const positional = args.filter((a) => !a.startsWith('-'));
  const pattern = positional[0];
  if (!pattern) return make(env, '', 'usage: grep PATTERN FILE', 2);
  let regex: RegExp;
  try {
    regex = new RegExp(pattern);
  } catch {
    return make(env, '', `grep: invalid pattern: ${pattern}`, 2);
  }
  const out: string[] = [];
  const scanFile = (path: string, prefix: boolean) => {
    const node = env.vfs.lookup(path);
    if (!node || node.type !== 'file') return;
    if (!env.vfs.can(node, user, 'r')) return;
    for (const line of (node.content ?? '').split('\n')) {
      if (regex.test(line)) {
        out.push(prefix ? `${path}:${line}` : line);
        const flag = FLAG_RE.exec(line);
        if (flag) hooks.onFlag?.(flag[0]);
      }
    }
  };
  const scanDir = (path: string) => {
    const node = env.vfs.lookup(path);
    if (!node || node.type !== 'dir' || !env.vfs.can(node, user, 'r')) return;
    for (const entry of env.vfs.list(path)) {
      if (entry.type === 'file') scanFile(entry.path, true);
      else if (entry.type === 'dir') scanDir(entry.path);
    }
  };
  for (const file of positional.slice(1)) {
    const path = resolve(env, file);
    const node = env.vfs.lookup(path);
    if (node?.type === 'dir' && recursive) scanDir(path);
    else scanFile(path, positional.length > 2);
  }
  ctx.signal('shell.grep', { pattern });
  return make(env, out.join('\n'), '', out.length ? 0 : 1);
}

function cmdChmod(args: string[], env: ShellEnv, user: User, ctx: TargetContext): ShellResultView {
  const [modeArg, target] = args.filter((a) => !a.startsWith('-') || /^[0-7]+$/.test(a));
  if (!modeArg || !target) return make(env, '', 'chmod: missing operand', 1);
  const path = resolve(env, target);
  const node = env.vfs.lookup(path, false);
  if (!node) return make(env, '', `chmod: cannot access '${target}': No such file or directory`, 1);
  if (node.owner !== user.name && user.name !== 'root') {
    return make(env, '', `chmod: changing permissions of '${target}': Operation not permitted`, 1);
  }
  if (!/^[0-7]{3,4}$/.test(modeArg)) {
    return make(env, '', `chmod: invalid mode: '${modeArg}' (symbolic modes not supported in this lab)`, 1);
  }
  env.vfs.chmod(path, parseInt(modeArg, 8));
  ctx.signal('shell.chmod', { path, mode: modeArg });
  return make(env);
}

function cmdSudo(args: string[], env: ShellEnv, ctx: TargetContext, hooks: ShellHooks): ShellResultView {
  if (args[0] === '-l') {
    const entry = env.sudoers[env.currentUser];
    if (!entry) return make(env, `User ${env.currentUser} is not allowed to run sudo.`, '', 1);
    const lines = entry.commands.map(
      (c) => `    (${entry.runAs.join(', ')}) ${entry.nopasswd ? 'NOPASSWD: ' : ''}${c}`,
    );
    return make(env, `User ${env.currentUser} may run the following commands:\n${lines.join('\n')}`);
  }

  const entry = env.sudoers[env.currentUser];
  if (!entry) {
    ctx.signal('sudo.denied', { user: env.currentUser });
    return make(env, '', `${env.currentUser} is not in the sudoers file. This incident will be reported.`, 1);
  }

  const command = args.join(' ');
  // Match leniently on the command's basename so both `sudo find …` and
  // `sudo /usr/bin/find …` satisfy a sudoers entry written with a full path —
  // real sudo is stricter, but for teaching we accept either spelling.
  const basename = (c: string) => {
    const [head, ...rest] = c.split(' ');
    const base = head?.includes('/') ? head.slice(head.lastIndexOf('/') + 1) : head ?? '';
    return [base, ...rest].join(' ');
  };
  const normalizedCommand = basename(command);
  const allowed =
    entry.commands.includes('ALL') ||
    entry.commands.some((c) => {
      const nc = basename(c);
      const prefix = nc.replace(/\*$/, '');
      return normalizedCommand === nc || normalizedCommand.startsWith(prefix) || command === c || command.startsWith(c.replace(/\*$/, ''));
    });
  if (!allowed) {
    ctx.signal('sudo.denied', { user: env.currentUser, command });
    return make(env, '', `Sorry, user ${env.currentUser} is not allowed to execute '${command}' as root.`, 1);
  }

  // Run the inner command as the sudo target user.
  ctx.signal('sudo.granted', { user: env.currentUser, command, runAs: entry.runAs[0] ?? 'root' });
  const elevated: ShellEnv = { ...env, currentUser: entry.runAs[0] ?? 'root' };
  const inner = runCommand(command, elevated, ctx, hooks);
  if (elevated.currentUser === 'root' && /(-i|bash|sh)$/.test(command.split(' ')[0] ?? '')) {
    ctx.signal('privesc.root-shell', { via: 'sudo', command });
    return make(env, 'root@' + env.host + ':~# (you now have a root shell — enumerate /root)', '', 0);
  }
  return { ...inner, user: env.currentUser };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function resolve(env: ShellEnv, path: string): string {
  if (path.startsWith('/')) return normalizePath(path);
  if (path.startsWith('~')) {
    const home = env.users[env.currentUser]!.home;
    return normalizePath(home + path.slice(1));
  }
  return normalizePath(env.cwd + '/' + path);
}

function longFormat(entries: { type: 'file' | 'dir' | 'symlink'; mode: number; owner: string; group: string; size: number; name: string; target?: string }[]): string {
  return entries
    .map((e) => {
      const perms = modeString(e);
      const link = e.target ? ` -> ${e.target}` : '';
      return `${perms} ${e.owner.padEnd(8)} ${e.group.padEnd(8)} ${String(e.size).padStart(6)} ${e.name}${link}`;
    })
    .join('\n');
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(input))) tokens.push(match[1] ?? match[2] ?? match[3] ?? '');
  return tokens;
}

function splitPipe(input: string): [string, string | null] {
  const index = input.indexOf('|');
  if (index === -1) return [input, null];
  return [input.slice(0, index).trim(), input.slice(index + 1).trim()];
}

function applyGrep(result: ShellResultView, pipeCommand: string): ShellResultView {
  const [cmd, ...args] = tokenize(pipeCommand);
  if (cmd !== 'grep') return result;
  const pattern = args.filter((a) => !a.startsWith('-'))[0];
  if (!pattern) return result;
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, args.includes('-i') ? 'i' : '');
  } catch {
    return result;
  }
  const filtered = result.stdout
    .split('\n')
    .filter((line) => regex.test(line))
    .join('\n');
  return { ...result, stdout: filtered };
}
