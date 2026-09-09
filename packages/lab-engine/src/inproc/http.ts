/**
 * A minimal, exact HTTP layer for lab targets.
 *
 * This is not a wrapper around Node's `http` module. Lab targets never bind a
 * socket and never touch the network; requests are values, handed straight to
 * a handler function. That gives three things: labs work offline, a lab cannot
 * reach anything it was not given, and the whole request/response cycle is
 * synchronous and therefore trivially deterministic.
 */

export interface TargetHttpRequest {
  method: string;
  /** Original request target, e.g. `/profile.php?id=16`. */
  path: string;
  pathname: string;
  query: Record<string, string>;
  /** Lower-cased header names. */
  headers: Record<string, string>;
  cookies: Record<string, string>;
  body: string;
  /** Parsed when the body is `application/x-www-form-urlencoded`. */
  form: Record<string, string>;
  /** Parsed when the body is JSON. `undefined` when it is not, or is invalid. */
  json?: unknown;
}

export interface TargetHttpResponse {
  status: number;
  statusText?: string;
  headers: Record<string, string | string[]>;
  body: string;
  /**
   * Notes the lab is happy for the learner to see — the point of a lab is to
   * make the invisible visible, so targets narrate their own internals here.
   * A real application would never do this.
   */
  serverNotes?: string[];
}

const STATUS_TEXT: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  204: 'No Content',
  301: 'Moved Permanently',
  302: 'Found',
  303: 'See Other',
  304: 'Not Modified',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  409: 'Conflict',
  418: "I'm a teapot",
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
};

export function statusText(status: number): string {
  return STATUS_TEXT[status] ?? 'Unknown';
}

export function parseRequest(input: {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: string;
}): TargetHttpRequest {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.headers)) {
    headers[key.toLowerCase()] = value;
  }

  const [rawPath = '/', rawQuery = ''] = splitOnce(input.path, '?');
  const query: Record<string, string> = {};
  for (const [key, value] of parseQueryString(rawQuery)) query[key] = value;

  const cookies = parseCookieHeader(headers['cookie'] ?? '');
  const body = input.body ?? '';
  const contentType = headers['content-type'] ?? '';

  const form: Record<string, string> = {};
  if (contentType.includes('application/x-www-form-urlencoded')) {
    for (const [key, value] of parseQueryString(body)) form[key] = value;
  }

  let json: unknown;
  if (contentType.includes('application/json') && body.trim()) {
    try {
      json = JSON.parse(body);
    } catch {
      json = undefined;
    }
  }

  return {
    method: input.method.toUpperCase(),
    path: input.path,
    pathname: decodeSafe(rawPath),
    query,
    headers,
    cookies,
    body,
    form,
    ...(json !== undefined ? { json } : {}),
  };
}

function splitOnce(value: string, separator: string): [string, string] {
  const index = value.indexOf(separator);
  if (index === -1) return [value, ''];
  return [value.slice(0, index), value.slice(index + separator.length)];
}

export function parseQueryString(input: string): [string, string][] {
  const out: [string, string][] = [];
  for (const part of input.split('&')) {
    if (!part) continue;
    const [key = '', value = ''] = splitOnce(part, '=');
    out.push([decodeSafe(key.replace(/\+/g, ' ')), decodeSafe(value.replace(/\+/g, ' '))]);
  }
  return out;
}

function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // A malformed percent-escape is itself something learners probe with.
    return value;
  }
}

export function parseCookieHeader(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [key = '', value = ''] = splitOnce(trimmed, '=');
    if (key) out[key.trim()] = decodeSafe(value.trim());
  }
  return out;
}

// ── Response helpers ───────────────────────────────────────────────────────

export function html(body: string, init: Partial<TargetHttpResponse> = {}): TargetHttpResponse {
  return {
    status: init.status ?? 200,
    headers: { 'content-type': 'text/html; charset=utf-8', ...(init.headers ?? {}) },
    body,
    ...(init.serverNotes ? { serverNotes: init.serverNotes } : {}),
  };
}

export function json(data: unknown, init: Partial<TargetHttpResponse> = {}): TargetHttpResponse {
  return {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json; charset=utf-8', ...(init.headers ?? {}) },
    body: JSON.stringify(data, null, 2),
    ...(init.serverNotes ? { serverNotes: init.serverNotes } : {}),
  };
}

export function text(body: string, init: Partial<TargetHttpResponse> = {}): TargetHttpResponse {
  return {
    status: init.status ?? 200,
    headers: { 'content-type': 'text/plain; charset=utf-8', ...(init.headers ?? {}) },
    body,
    ...(init.serverNotes ? { serverNotes: init.serverNotes } : {}),
  };
}

export function redirect(location: string, status = 302): TargetHttpResponse {
  return {
    status,
    headers: { location, 'content-type': 'text/html; charset=utf-8' },
    body: `<!doctype html><meta charset="utf-8"><p>Redirecting to <a href="${escapeHtml(location)}">${escapeHtml(location)}</a></p>`,
  };
}

export interface CookieOptions {
  path?: string;
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  domain?: string;
  expires?: string;
}

export function setCookie(
  response: TargetHttpResponse,
  name: string,
  value: string,
  options: CookieOptions = {},
): TargetHttpResponse {
  const parts = [`${name}=${value}`];
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.expires) parts.push(`Expires=${options.expires}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);

  const header = parts.join('; ');
  const existing = response.headers['set-cookie'];
  response.headers['set-cookie'] = existing
    ? [...(Array.isArray(existing) ? existing : [existing]), header]
    : [header];
  return response;
}

// ── HTML templating ────────────────────────────────────────────────────────

/**
 * `html` escapes every interpolation by default. A target that wants an
 * injection point must say so explicitly with `raw()`, which makes every
 * intentional vulnerability in this codebase greppable.
 */
export class RawHtml {
  constructor(readonly value: string) {}
}

export function raw(value: string): RawHtml {
  return new RawHtml(value);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function tpl(strings: TemplateStringsArray, ...values: unknown[]): string {
  let out = strings[0] ?? '';
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    out += value instanceof RawHtml ? value.value : escapeHtml(stringify(value));
    out += strings[i + 1] ?? '';
  }
  return out;
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  return String(value);
}

// ── Router ─────────────────────────────────────────────────────────────────

export type RouteHandler<C> = (
  req: TargetHttpRequest,
  ctx: C,
  params: Record<string, string>,
) => TargetHttpResponse;

interface Route<C> {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: RouteHandler<C>;
}

export class Router<C> {
  #routes: Route<C>[] = [];

  add(method: string, path: string, handler: RouteHandler<C>): this {
    const keys: string[] = [];
    const source = path.replace(/:([A-Za-z0-9_]+)/g, (_, key: string) => {
      keys.push(key);
      return '([^/]+)';
    });
    this.#routes.push({
      method: method.toUpperCase(),
      pattern: new RegExp(`^${source}$`),
      keys,
      handler,
    });
    return this;
  }

  get(path: string, handler: RouteHandler<C>): this {
    return this.add('GET', path, handler);
  }

  post(path: string, handler: RouteHandler<C>): this {
    return this.add('POST', path, handler);
  }

  any(path: string, handler: RouteHandler<C>): this {
    return this.add('*', path, handler);
  }

  handle(req: TargetHttpRequest, ctx: C): TargetHttpResponse | null {
    let pathMatched = false;
    for (const route of this.#routes) {
      const match = route.pattern.exec(req.pathname);
      if (!match) continue;
      pathMatched = true;
      if (route.method !== '*' && route.method !== req.method) continue;
      const params: Record<string, string> = {};
      route.keys.forEach((key, i) => {
        params[key] = match[i + 1] ?? '';
      });
      return route.handler(req, ctx, params);
    }
    if (pathMatched) {
      return {
        status: 405,
        headers: { 'content-type': 'text/plain; charset=utf-8', allow: 'GET, POST' },
        body: '405 Method Not Allowed',
      };
    }
    return null;
  }
}
