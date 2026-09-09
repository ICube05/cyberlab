import type {
  LabAction,
  LabActionResult,
  LabEvent,
  LabSnapshot,
  LabSpec,
  LabState,
  HttpResponseView,
} from '@cyberlab/core';
import { LabError, type LabInstance } from '../runtime.js';
import { Rng } from '../rng.js';
import { LabTargetContext, type BuilderRegistry, type LabTarget } from './target.js';
import { parseCookieHeader, parseRequest, statusText, type TargetHttpResponse } from './http.js';

/**
 * One live lab.
 *
 * Owns the target, the cookie jar, the transcript and the virtual clock. All
 * mutation goes through `dispatch`, which is what guarantees that the
 * transcript is a complete and ordered record of everything the learner did —
 * the input the evaluator and the AI tutor both read.
 */
export class InProcLabInstance implements LabInstance {
  readonly id: string;
  readonly specId: string;
  readonly seed: string;
  readonly spec: LabSpec;

  lastUsedAt = Date.now();

  #target: LabTarget;
  #ctx: LabTargetContext;
  #events: LabEvent[] = [];
  #cookies = new Map<string, { value: string; attributes: Record<string, string | true> }>();
  #seq = 0;
  #disposed = false;
  #status: LabState['status'] = 'ready';
  #error?: string;

  readonly #registry: BuilderRegistry;
  readonly #actionTimeoutMs: number;

  constructor(options: {
    id: string;
    spec: LabSpec;
    seed: string;
    registry: BuilderRegistry;
    actionTimeoutMs?: number;
  }) {
    this.id = options.id;
    this.spec = options.spec;
    this.specId = options.spec.id;
    this.seed = options.seed;
    this.#registry = options.registry;
    this.#actionTimeoutMs = options.actionTimeoutMs ?? 4000;

    const builder = this.#registry.get(options.spec.builderId);
    if (!builder) {
      throw new LabError(`No target builder registered for "${options.spec.builderId}"`, 'unknown_target');
    }
    this.#ctx = new LabTargetContext(options.seed, new Rng(options.seed));
    this.#target = builder.build(options.spec, this.#ctx);
  }

  getState(): LabState {
    const shell = this.#target.shellContext?.();
    return {
      instanceId: this.id,
      specId: this.specId,
      status: this.#status,
      createdAt: this.#ctx.now(),
      seed: this.seed,
      surfaces: [...this.#target.surfaces],
      cookies: [...this.#cookies.entries()].map(([name, entry]) => ({
        name,
        value: entry.value,
        attributes: entry.attributes,
      })),
      ...(shell ? { shell } : {}),
      signals: this.#ctx.signals.map((s) => ({
        name: s.name,
        at: s.at,
        seq: s.seq,
        ...(s.data ? { data: s.data } : {}),
      })),
      eventCount: this.#events.length,
      flags: [...this.#ctx.flags],
      ...(this.#error ? { error: this.#error } : {}),
    };
  }

  getTranscript(): LabEvent[] {
    return this.#events;
  }

  async dispatch(action: LabAction): Promise<LabActionResult> {
    if (this.#disposed) throw new LabError('This lab has been disposed.', 'disposed');
    this.lastUsedAt = Date.now();
    this.#seq += 1;
    this.#ctx.setSeq(this.#seq);
    this.#ctx.tick();

    const startedAt = performance.now();
    let result: LabActionResult;
    try {
      result = this.#execute(action);
    } catch (error) {
      result = {
        type: 'error',
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        durationMs: round(performance.now() - startedAt),
      };
    }

    const durationMs = round(performance.now() - startedAt);
    if (durationMs > this.#actionTimeoutMs) {
      // Targets are synchronous by contract, so this cannot pre-empt a runaway
      // handler — it flags one. Interpreters enforce their own step budgets.
      this.#status = 'error';
      this.#error = `Action exceeded the ${this.#actionTimeoutMs}ms budget and the lab was marked unhealthy.`;
    }

    const event: LabEvent = {
      seq: this.#seq,
      at: this.#ctx.now(),
      action,
      result: { ...result, durationMs } as LabActionResult,
      signals: [...this.#ctx.currentActionSignals],
    };
    this.#events.push(event);
    if (this.#events.length > 500) this.#events.splice(0, this.#events.length - 500);

    return event.result;
  }

  #execute(action: LabAction): LabActionResult {
    switch (action.type) {
      case 'http.request':
        return this.#http({
          method: action.method,
          path: action.path,
          headers: action.headers ?? {},
          ...(action.body !== undefined ? { body: action.body } : {}),
          useCookieJar: action.useCookieJar ?? false,
          followRedirects: action.followRedirects ?? false,
        });

      case 'browser.navigate':
        return this.#http({
          method: 'GET',
          path: action.path,
          headers: { accept: 'text/html,application/xhtml+xml' },
          useCookieJar: true,
          followRedirects: true,
        });

      case 'browser.submit': {
        const encoded = new URLSearchParams(action.fields).toString();
        if (action.method === 'GET') {
          const joiner = action.path.includes('?') ? '&' : '?';
          return this.#http({
            method: 'GET',
            path: `${action.path}${encoded ? joiner + encoded : ''}`,
            headers: { accept: 'text/html' },
            useCookieJar: true,
            followRedirects: true,
          });
        }
        return this.#http({
          method: 'POST',
          path: action.path,
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            accept: 'text/html',
          },
          body: encoded,
          useCookieJar: true,
          followRedirects: true,
        });
      }

      case 'shell.exec': {
        if (!this.#target.shell) throw new LabError('This lab has no terminal.', 'unsupported_action');
        const result = this.#target.shell(action.command, this.#ctx);
        return { type: 'shell.result', ok: result.exitCode === 0, result, durationMs: 0 };
      }

      case 'sql.query': {
        if (!this.#target.sql) throw new LabError('This lab has no SQL console.', 'unsupported_action');
        const result = this.#target.sql(action.sql, this.#ctx);
        return { type: 'sql.result', ok: !result.error, result, durationMs: 0 };
      }

      case 'fs.list': {
        if (!this.#target.files) throw new LabError('This lab has no filesystem.', 'unsupported_action');
        const listing = this.#target.files.list(action.path, this.#ctx);
        return { type: 'fs.listing', ok: true, listing, path: action.path, durationMs: 0 };
      }

      case 'fs.read': {
        if (!this.#target.files) throw new LabError('This lab has no filesystem.', 'unsupported_action');
        const content = this.#target.files.read(action.path, this.#ctx);
        return { type: 'fs.content', ok: true, path: action.path, content, durationMs: 0 };
      }

      case 'editor.write': {
        if (!this.#target.files?.write) {
          throw new LabError('This lab is read-only.', 'unsupported_action');
        }
        this.#target.files.write(action.path, action.content, this.#ctx);
        return { type: 'fs.content', ok: true, path: action.path, content: action.content, durationMs: 0 };
      }

      case 'lab.inspect': {
        // Logs are owned by the shared context, so every target gets a log
        // viewer for free and none of them has to reimplement one.
        if (action.what === 'logs') {
          return {
            type: 'inspect',
            ok: true,
            view: { kind: 'logs', entries: [...this.#ctx.logs] },
            durationMs: 0,
          };
        }
        const view = this.#target.inspect(action.what, this.#ctx);
        return { type: 'inspect', ok: true, view, durationMs: 0 };
      }
    }
  }

  #http(input: {
    method: string;
    path: string;
    headers: Record<string, string>;
    body?: string;
    useCookieJar: boolean;
    followRedirects: boolean;
  }): LabActionResult {
    if (!this.#target.http) throw new LabError('This lab has no HTTP surface.', 'unsupported_action');

    const redirectChain: { from: string; to: string; status: number }[] = [];
    let path = input.path;
    let response: TargetHttpResponse | undefined;
    let hops = 0;

    while (hops <= 5) {
      const headers = { ...input.headers };
      if (input.useCookieJar && !hasHeader(headers, 'cookie')) {
        const jar = this.#cookieHeader();
        if (jar) headers['Cookie'] = jar;
      }
      const request = parseRequest({
        method: hops === 0 ? input.method : 'GET',
        path,
        headers,
        ...(hops === 0 && input.body !== undefined ? { body: input.body } : {}),
      });

      response = this.#target.http(request, this.#ctx);
      this.#absorbSetCookie(response);

      const location = firstHeader(response.headers, 'location');
      const isRedirect = response.status >= 300 && response.status < 400 && Boolean(location);
      if (!input.followRedirects || !isRedirect || !location) break;

      redirectChain.push({ from: path, to: location, status: response.status });
      path = location;
      hops += 1;
    }

    if (!response) throw new LabError('Target produced no response.', 'internal');

    const view: HttpResponseView = {
      status: response.status,
      statusText: response.statusText ?? statusText(response.status),
      headers: flattenHeaders(response.headers),
      body: response.body,
      contentType: firstHeader(response.headers, 'content-type') ?? 'text/plain',
      finalPath: path,
      ...(redirectChain.length ? { redirectChain } : {}),
      ...(response.serverNotes?.length ? { serverNotes: response.serverNotes } : {}),
    };

    return { type: 'http.response', ok: response.status < 400, response: view, durationMs: 0 };
  }

  #cookieHeader(): string {
    return [...this.#cookies.entries()].map(([name, entry]) => `${name}=${entry.value}`).join('; ');
  }

  #absorbSetCookie(response: TargetHttpResponse): void {
    const header = response.headers['set-cookie'];
    if (!header) return;
    const list = Array.isArray(header) ? header : [header];
    for (const line of list) {
      const [pair = '', ...rest] = line.split(';');
      const parsed = parseCookieHeader(pair);
      const [name, value] = Object.entries(parsed)[0] ?? [];
      if (!name) continue;

      const attributes: Record<string, string | true> = {};
      for (const attribute of rest) {
        const trimmed = attribute.trim();
        if (!trimmed) continue;
        const index = trimmed.indexOf('=');
        if (index === -1) attributes[trimmed] = true;
        else attributes[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
      }

      const maxAge = attributes['Max-Age'] ?? attributes['max-age'];
      if (maxAge === '0') {
        this.#cookies.delete(name);
        continue;
      }
      this.#cookies.set(name, { value: value ?? '', attributes });
    }
  }

  snapshot(): LabSnapshot {
    return {
      specId: this.specId,
      seed: this.seed,
      takenAt: Date.now(),
      data: JSON.stringify({
        target: this.#target.serialize(),
        cookies: [...this.#cookies.entries()],
        signals: this.#ctx.signals,
        logs: this.#ctx.logs,
        flags: this.#ctx.flags,
        events: this.#events,
        seq: this.#seq,
      }),
    };
  }

  restore(snapshot: LabSnapshot): void {
    if (snapshot.specId !== this.specId) {
      throw new LabError('Snapshot belongs to a different lab.', 'internal');
    }
    const parsed = JSON.parse(snapshot.data) as {
      target: unknown;
      cookies: [string, { value: string; attributes: Record<string, string | true> }][];
      signals: LabTargetContext['signals'];
      logs: LabTargetContext['logs'];
      flags: string[];
      events: LabEvent[];
      seq: number;
    };
    this.#target.deserialize(parsed.target);
    this.#cookies = new Map(parsed.cookies);
    this.#ctx.clear();
    this.#ctx.signals.push(...parsed.signals);
    this.#ctx.logs.push(...parsed.logs);
    this.#ctx.flags.push(...parsed.flags);
    this.#events = parsed.events;
    this.#seq = parsed.seq;
    this.#status = 'ready';
    this.#error = undefined;
  }

  reset(): void {
    const builder = this.#registry.get(this.spec.builderId);
    if (!builder) throw new LabError('Target builder vanished.', 'unknown_target');
    this.#target.dispose?.();
    this.#ctx = new LabTargetContext(this.seed, new Rng(this.seed));
    this.#target = builder.build(this.spec, this.#ctx);
    this.#cookies.clear();
    this.#events = [];
    this.#seq = 0;
    this.#status = 'ready';
    this.#error = undefined;
    this.lastUsedAt = Date.now();
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#status = 'disposed';
    this.#target.dispose?.();
  }
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const lower = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === lower);
}

function firstHeader(
  headers: Record<string, string | string[]>,
  name: string,
): string | undefined {
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== lower) continue;
    return Array.isArray(value) ? value[0] : value;
  }
  return undefined;
}

function flattenHeaders(headers: Record<string, string | string[]>): { name: string; value: string }[] {
  const out: { name: string; value: string }[] = [];
  for (const [name, value] of Object.entries(headers)) {
    if (Array.isArray(value)) for (const v of value) out.push({ name, value: v });
    else out.push({ name, value });
  }
  return out;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
