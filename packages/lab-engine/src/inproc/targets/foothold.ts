import type { FsEntry, LabInspectView, LabSpec, LabSurface, ShellResultView } from '@cyberlab/core';
import { Vfs, type User } from '../vfs.js';
import { runCommand, type ShellEnv } from '../shell.js';
import type { LabTarget, TargetBuilder, TargetContext } from '../target.js';

/**
 * "Foothold" — a Linux host you land on as an unprivileged user, with a real
 * privilege-escalation path.
 *
 * Every file has a genuine owner and mode; the shell enforces them. The
 * escalation is not a magic word: `sudo -l` shows a real sudoers entry, and the
 * path it reveals actually works because the interpreter runs that command with
 * root's authority and root can then read `/root/flag.txt`. Enumeration is the
 * lesson, and the VFS rewards it honestly.
 */

interface FootholdState {
  flag: string;
  escalated: boolean;
}

class FootholdTarget implements LabTarget {
  readonly surfaces: readonly LabSurface[] = ['terminal', 'files', 'editor', 'logs'];

  #vfs: Vfs;
  #env: ShellEnv;
  #state: FootholdState;

  constructor(_spec: LabSpec, ctx: TargetContext) {
    this.#vfs = new Vfs();
    this.#state = { flag: `CL{privesc_${ctx.rng.token(12)}}`, escalated: false };
    const users: Record<string, User> = {
      root: { name: 'root', uid: 0, groups: ['root'], home: '/root' },
      seba: { name: 'seba', uid: 1000, groups: ['seba', 'developers'], home: '/home/seba' },
      backup: { name: 'backup', uid: 34, groups: ['backup'], home: '/var/backups' },
    };
    this.#buildFs(ctx);
    this.#env = {
      vfs: this.#vfs,
      users,
      currentUser: 'seba',
      cwd: '/home/seba',
      host: 'foothold',
      sudoers: {
        // A deliberately over-broad sudo grant — the escalation path.
        seba: { runAs: ['root'], nopasswd: true, commands: ['/usr/bin/find', '/bin/cat /var/log/*'] },
      },
      env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/home/seba', USER: 'seba', SHELL: '/bin/bash' },
    };
    ctx.log('info', 'sshd', 'Accepted publickey for seba from 10.13.0.37');
  }

  #buildFs(ctx: TargetContext): void {
    const vfs = this.#vfs;
    vfs.mkdirp('/home/seba', { owner: 'seba', group: 'seba', mode: 0o750 });
    vfs.mkdirp('/root', { owner: 'root', group: 'root', mode: 0o700 });
    vfs.mkdirp('/var/log', { owner: 'root', group: 'root', mode: 0o755 });
    vfs.mkdirp('/etc', { owner: 'root', group: 'root', mode: 0o755 });
    vfs.mkdirp('/usr/local/bin', { owner: 'root', group: 'root', mode: 0o755 });

    vfs.writeFile('/home/seba/.bashrc', 'export PS1="\\u@\\h:\\w$ "\n', { owner: 'seba', group: 'seba', mode: 0o644 });
    vfs.writeFile(
      '/home/seba/notes.txt',
      'Reminder: the ops team gave my account a passwordless sudo entry for find\n' +
        'during the migration. Ask them to remove it — it is almost certainly too broad.\n' +
        'Run `sudo -l` to see what is granted.\n',
      { owner: 'seba', group: 'seba', mode: 0o644 },
    );
    vfs.writeFile('/root/flag.txt', `${this.#state.flag}\n`, { owner: 'root', group: 'root', mode: 0o600 });
    vfs.writeFile(
      '/root/.ssh_notes',
      'Root-only notes. If you can read this, the host is compromised.\n',
      { owner: 'root', group: 'root', mode: 0o600 },
    );
    vfs.writeFile(
      '/etc/shadow',
      'root:$6$rounds=5000$redacted:19000:0:99999:7:::\nseba:$6$abcd$redacted:19000:0:99999:7:::\n',
      { owner: 'root', group: 'shadow', mode: 0o640 },
    );
    vfs.writeFile('/etc/passwd', PASSWD, { owner: 'root', group: 'root', mode: 0o644 });
    vfs.writeFile(
      '/var/log/auth.log',
      'Accepted publickey for seba from 10.13.0.37 port 51224 ssh2\n' +
        'sudo: seba : TTY=pts/0 ; PWD=/home/seba ; USER=root ; COMMAND=list\n',
      { owner: 'root', group: 'adm', mode: 0o640 },
    );
    ctx.log('debug', 'fs', 'Filesystem staged');
  }

  http = undefined;

  shell(command: string, ctx: TargetContext): ShellResultView {
    const before = this.#env.currentUser;
    const result = runCommand(command, this.#env, ctx, {
      onFlag: (value) => {
        if (value === this.#state.flag) {
          this.#state.escalated = true;
          ctx.captureFlag(value);
          ctx.signal('privesc.flag-read', { path: '/root/flag.txt' });
        }
      },
      onReadFile: (path) => {
        if (path === '/etc/shadow') ctx.signal('enum.sensitive-read', { path });
      },
    });
    // Detect the specific escalation the lab teaches: sudo find -exec.
    if (/sudo\s+.*find.*-exec/i.test(command) || /sudo\s+find/i.test(command)) {
      ctx.signal('privesc.sudo-find', { command });
    }
    if (before !== this.#env.currentUser) {
      ctx.signal('shell.user-changed', { from: before, to: this.#env.currentUser });
    }
    return result;
  }

  shellContext(): { user: string; host: string; cwd: string } {
    return { user: this.#env.currentUser, host: this.#env.host, cwd: this.#env.cwd };
  }

  files = {
    list: (path: string): FsEntry[] =>
      // Editability is answered by the same permission check the shell uses, so
      // the editor and `echo > file` can never disagree about what is writable.
      this.#vfs.list(path).map((entry) => this.#decorate(entry)),
    read: (path: string): string => {
      const node = this.#vfs.lookup(path);
      if (!node || node.type === 'dir') throw new Error(`cannot read ${path}`);
      // The file browser respects the *current* shell user's permissions, so it
      // cannot be used to sidestep the escalation.
      const user = this.#env.users[this.#env.currentUser]!;
      if (!this.#vfs.can(node, user, 'r')) throw new Error(`${path}: Permission denied`);
      return node.content ?? '';
    },
    write: (path: string, content: string, ctx: TargetContext): void => {
      const node = this.#vfs.lookup(path, false);
      if (!node || node.type === 'dir') throw new Error(`${path}: No such file`);
      const user = this.#env.users[this.#env.currentUser]!;
      if (!this.#vfs.can(node, user, 'w')) throw new Error(`${path}: Permission denied`);
      node.content = content;
      node.mtime = Date.now();
      ctx.signal('file.written', { path, user: user.name, bytes: content.length });
      ctx.log('info', 'kernel', `${user.name} wrote ${content.length} bytes to ${path}`);
    },
  };

  /** Annotate a listing with what the current shell user may actually do. */
  #decorate(entry: FsEntry): FsEntry {
    if (entry.type === 'dir') return entry;
    const node = this.#vfs.lookup(entry.path, false);
    const user = this.#env.users[this.#env.currentUser]!;
    const writable = Boolean(node && this.#vfs.can(node, user, 'w'));
    return {
      ...entry,
      writable,
      ...(writable
        ? {}
        : { readOnlyReason: `Permesso negato: ${user.name} non ha il bit di scrittura su questo file.` }),
    };
  }

  inspect(what: 'database' | 'sessions' | 'logs' | 'files'): LabInspectView {
    if (what === 'files') return { kind: 'files', root: this.#vfs.list('/') };
    if (what === 'logs') return { kind: 'logs', entries: [] };
    return { kind: 'sessions', sessions: [] };
  }

  serialize(): unknown {
    return { vfs: this.#vfs.serialize(), env: { ...this.#env, vfs: undefined }, state: this.#state };
  }
  deserialize(data: unknown): void {
    const parsed = data as { vfs: unknown; env: Omit<ShellEnv, 'vfs'>; state: FootholdState };
    this.#vfs = Vfs.deserialize(parsed.vfs);
    this.#env = { ...parsed.env, vfs: this.#vfs };
    this.#state = parsed.state;
  }
}

const PASSWD = `root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
backup:x:34:34:backup:/var/backups:/usr/sbin/nologin
seba:x:1000:1000:Seba:/home/seba:/bin/bash
`;

export const footholdBuilder: TargetBuilder = {
  id: 'linux.foothold',
  description:
    'Unprivileged Linux foothold with a real VFS, enforced permissions and a working sudo privilege-escalation path to /root/flag.txt.',
  build: (spec, ctx) => new FootholdTarget(spec, ctx),
};
