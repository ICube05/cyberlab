import type { FsEntry } from '@cyberlab/core';

/**
 * A tiny in-memory POSIX-ish filesystem with *real* permission checks.
 *
 * The permission logic here is the genuine article — owner/group/other rwx
 * bits, evaluated in the correct order (owner beats group beats other, first
 * matching class wins even when it is more restrictive). That is what lets the
 * Linux labs teach permissions honestly: `chmod` really changes access,
 * `cat /etc/shadow` really fails for a normal user, and a world-writable cron
 * script really is escalatable.
 */

export interface VNode {
  type: 'file' | 'dir' | 'symlink';
  mode: number;
  owner: string;
  group: string;
  /** Files only. */
  content?: string;
  /** Symlinks only. */
  target?: string;
  /** Dirs only. */
  children?: Map<string, VNode>;
  mtime: number;
  /** setuid programs record whose authority they run with. */
  suidRunAs?: string;
}

export interface User {
  name: string;
  uid: number;
  groups: string[];
  home: string;
  shellPrompt?: string;
}

export type Access = 'r' | 'w' | 'x';

export class Vfs {
  #root: VNode;

  constructor() {
    this.#root = { type: 'dir', mode: 0o755, owner: 'root', group: 'root', children: new Map(), mtime: 0 };
  }

  // ── construction ───────────────────────────────────────────────────────────

  mkdirp(path: string, opts: Partial<Pick<VNode, 'mode' | 'owner' | 'group'>> = {}): VNode {
    const parts = normalize(path).split('/').filter(Boolean);
    let node = this.#root;
    for (const part of parts) {
      node.children ??= new Map();
      let child = node.children.get(part);
      if (!child) {
        child = {
          type: 'dir',
          mode: opts.mode ?? 0o755,
          owner: opts.owner ?? 'root',
          group: opts.group ?? 'root',
          children: new Map(),
          mtime: 0,
        };
        node.children.set(part, child);
      }
      node = child;
    }
    return node;
  }

  writeFile(
    path: string,
    content: string,
    opts: Partial<Pick<VNode, 'mode' | 'owner' | 'group' | 'suidRunAs'>> = {},
  ): void {
    const { dir, base } = split(path);
    const parent = this.mkdirp(dir);
    parent.children ??= new Map();
    parent.children.set(base, {
      type: 'file',
      mode: opts.mode ?? 0o644,
      owner: opts.owner ?? 'root',
      group: opts.group ?? 'root',
      content,
      mtime: 0,
      ...(opts.suidRunAs ? { suidRunAs: opts.suidRunAs } : {}),
    });
  }

  symlink(path: string, target: string): void {
    const { dir, base } = split(path);
    const parent = this.mkdirp(dir);
    parent.children ??= new Map();
    parent.children.set(base, { type: 'symlink', mode: 0o777, owner: 'root', group: 'root', target, mtime: 0 });
  }

  // ── lookup ─────────────────────────────────────────────────────────────────

  lookup(path: string, followFinal = true): VNode | null {
    const parts = normalize(path).split('/').filter(Boolean);
    let node: VNode = this.#root;
    for (let i = 0; i < parts.length; i += 1) {
      if (node.type === 'symlink' && node.target) {
        const resolved = this.lookup(node.target);
        if (!resolved) return null;
        node = resolved;
      }
      if (node.type !== 'dir' || !node.children) return null;
      const next = node.children.get(parts[i]!);
      if (!next) return null;
      const isFinal = i === parts.length - 1;
      if (isFinal && next.type === 'symlink' && followFinal && next.target) {
        return this.lookup(next.target);
      }
      node = next;
    }
    return node;
  }

  exists(path: string): boolean {
    return this.lookup(path) !== null;
  }

  // ── permissions ────────────────────────────────────────────────────────────

  /**
   * The real thing: pick the first matching class (owner, then group, then
   * other) and honour exactly its bits. root bypasses, as on a real system.
   */
  can(node: VNode, user: User, access: Access): boolean {
    if (user.name === 'root') return true;
    const bit = access === 'r' ? 4 : access === 'w' ? 2 : 1;
    let triad: number;
    if (node.owner === user.name) triad = (node.mode >> 6) & 7;
    else if (user.groups.includes(node.group)) triad = (node.mode >> 3) & 7;
    else triad = node.mode & 7;
    return (triad & bit) === bit;
  }

  /** Directory traversal requires x on every component. */
  canTraverse(path: string, user: User): boolean {
    const parts = normalize(path).split('/').filter(Boolean);
    let node: VNode = this.#root;
    if (!this.can(node, user, 'x')) return false;
    for (const part of parts.slice(0, -1)) {
      if (node.type !== 'dir' || !node.children) return false;
      const next = node.children.get(part);
      if (!next) return false;
      node = next;
      if (!this.can(node, user, 'x')) return false;
    }
    return true;
  }

  chmod(path: string, mode: number): boolean {
    const node = this.lookup(path, false);
    if (!node) return false;
    node.mode = mode & 0o7777;
    return true;
  }

  // ── listing ────────────────────────────────────────────────────────────────

  list(path: string): FsEntry[] {
    const node = this.lookup(path);
    if (!node || node.type !== 'dir' || !node.children) return [];
    const base = normalize(path);
    return [...node.children.entries()]
      .map(([name, child]) => this.#toEntry(name, child, base === '/' ? `/${name}` : `${base}/${name}`))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  entry(path: string): FsEntry | null {
    const node = this.lookup(path, false);
    if (!node) return null;
    const { base } = split(path);
    return this.#toEntry(base, node, normalize(path));
  }

  #toEntry(name: string, node: VNode, path: string): FsEntry {
    return {
      name,
      path,
      type: node.type,
      mode: node.mode,
      owner: node.owner,
      group: node.group,
      size: node.content?.length ?? (node.type === 'dir' ? 4096 : 0),
      mtime: node.mtime,
      ...(node.target ? { target: node.target } : {}),
    };
  }

  // ── serialisation ──────────────────────────────────────────────────────────

  serialize(): unknown {
    return serializeNode(this.#root);
  }

  static deserialize(data: unknown): Vfs {
    const vfs = new Vfs();
    vfs.#root = deserializeNode(data);
    return vfs;
  }
}

export function modeString(node: Pick<FsEntry, 'type' | 'mode'>): string {
  const type = node.type === 'dir' ? 'd' : node.type === 'symlink' ? 'l' : '-';
  const rwx = (triad: number) =>
    `${triad & 4 ? 'r' : '-'}${triad & 2 ? 'w' : '-'}${triad & 1 ? 'x' : '-'}`;
  return type + rwx((node.mode >> 6) & 7) + rwx((node.mode >> 3) & 7) + rwx(node.mode & 7);
}

function normalize(path: string): string {
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return '/' + parts.join('/');
}

function split(path: string): { dir: string; base: string } {
  const norm = normalize(path);
  const index = norm.lastIndexOf('/');
  return { dir: index <= 0 ? '/' : norm.slice(0, index), base: norm.slice(index + 1) };
}

function serializeNode(node: VNode): unknown {
  return {
    type: node.type,
    mode: node.mode,
    owner: node.owner,
    group: node.group,
    content: node.content,
    target: node.target,
    suidRunAs: node.suidRunAs,
    mtime: node.mtime,
    children: node.children ? [...node.children.entries()].map(([k, v]) => [k, serializeNode(v)]) : undefined,
  };
}

function deserializeNode(data: unknown): VNode {
  const d = data as {
    type: VNode['type'];
    mode: number;
    owner: string;
    group: string;
    content?: string;
    target?: string;
    suidRunAs?: string;
    mtime: number;
    children?: [string, unknown][];
  };
  return {
    type: d.type,
    mode: d.mode,
    owner: d.owner,
    group: d.group,
    ...(d.content !== undefined ? { content: d.content } : {}),
    ...(d.target !== undefined ? { target: d.target } : {}),
    ...(d.suidRunAs !== undefined ? { suidRunAs: d.suidRunAs } : {}),
    mtime: d.mtime,
    ...(d.children ? { children: new Map(d.children.map(([k, v]) => [k, deserializeNode(v)])) } : {}),
  };
}

export { normalize as normalizePath };
