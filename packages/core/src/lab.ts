import type { LabInstanceId, LabSpecId } from './ids.js';

/**
 * Lab contracts.
 *
 * These types are shared by the engine, the server and the browser. The engine
 * implements them; the UI renders them; the evaluator reads them. Nothing here
 * knows *how* a lab runs, which is what lets the in-process runtime and the
 * Docker runtime be swapped without touching a single component.
 */

/** Which panels the lab UI should offer for this scenario. */
export type LabSurface =
  | 'request' // raw HTTP request editor + response viewer
  | 'browser' // rendered view of the target, with a real cookie jar
  | 'terminal' // virtual shell
  | 'sql' // direct SQL console (only where the scenario justifies it)
  | 'files' // file explorer over the lab filesystem
  | 'database' // read-only table browser, "what the server sees"
  | 'logs' // server-side log stream, for blue-team work
  | 'editor'; // code editor, used by "fix the vulnerability" steps

export type LabKind = 'web' | 'shell' | 'sql' | 'mixed';

export interface LabSpec {
  id: LabSpecId;
  title: string;
  subtitle?: string;
  kind: LabKind;
  /** Key into the runtime's target registry. See packages/lab-engine. */
  builderId: string;
  /** Narrative framing shown when the lab boots. */
  scenario: string;
  target: {
    name: string;
    description: string;
    /** Cosmetic host shown in the UI, e.g. "vault.lab". Never resolved. */
    host: string;
  };
  surfaces: LabSurface[];
  /** Human-readable description of the world at t=0. */
  initialState: string[];
  /** Credentials the learner is *given*. Anything else must be earned. */
  credentials?: { label: string; username: string; password: string; note?: string }[];
  /** Whether a fresh seed produces a different (but equivalent) scenario. */
  seedable: boolean;
  notes?: string[];
}

// ── Actions ────────────────────────────────────────────────────────────────

export type LabAction =
  | HttpRequestAction
  | BrowserNavigateAction
  | BrowserSubmitAction
  | ShellExecAction
  | SqlQueryAction
  | FsListAction
  | FsReadAction
  | EditorWriteAction
  | InspectAction;

export interface HttpRequestAction {
  type: 'http.request';
  method: string;
  /** Path plus query string, e.g. `/profile.php?id=16`. */
  path: string;
  headers: Record<string, string>;
  body?: string;
  /** When true the engine applies Set-Cookie to the instance cookie jar. */
  useCookieJar?: boolean;
  followRedirects?: boolean;
}

export interface BrowserNavigateAction {
  type: 'browser.navigate';
  path: string;
}

export interface BrowserSubmitAction {
  type: 'browser.submit';
  path: string;
  method: 'GET' | 'POST';
  fields: Record<string, string>;
}

export interface ShellExecAction {
  type: 'shell.exec';
  command: string;
}

export interface SqlQueryAction {
  type: 'sql.query';
  sql: string;
}

export interface FsListAction {
  type: 'fs.list';
  path: string;
}

export interface FsReadAction {
  type: 'fs.read';
  path: string;
}

export interface EditorWriteAction {
  type: 'editor.write';
  path: string;
  content: string;
}

export interface InspectAction {
  type: 'lab.inspect';
  what: 'database' | 'sessions' | 'logs' | 'files';
}

// ── Results ────────────────────────────────────────────────────────────────

export type LabActionResult =
  | { type: 'http.response'; ok: boolean; response: HttpResponseView; durationMs: number }
  | { type: 'shell.result'; ok: boolean; result: ShellResultView; durationMs: number }
  | { type: 'sql.result'; ok: boolean; result: SqlResultView; durationMs: number }
  | { type: 'fs.listing'; ok: boolean; listing: FsEntry[]; path: string; durationMs: number }
  | { type: 'fs.content'; ok: boolean; path: string; content: string; durationMs: number }
  | { type: 'inspect'; ok: boolean; view: LabInspectView; durationMs: number }
  | { type: 'error'; ok: false; message: string; durationMs: number };

export interface HttpResponseView {
  status: number;
  statusText: string;
  headers: { name: string; value: string }[];
  body: string;
  /** Content type used by the UI to pick a renderer. */
  contentType: string;
  /** Where the request ended up if redirects were followed. */
  finalPath: string;
  redirectChain?: { from: string; to: string; status: number }[];
  /** Server-side detail the learner is allowed to see (this is a lab). */
  serverNotes?: string[];
}

export interface ShellResultView {
  stdout: string;
  stderr: string;
  exitCode: number;
  /** Prompt after the command, so the terminal can show `cd` effects. */
  cwd: string;
  user: string;
  host: string;
}

export interface SqlResultView {
  /** The SQL the server actually executed, after any concatenation. */
  executedSql: string;
  columns: string[];
  rows: (string | number | null)[][];
  rowCount: number;
  error?: string;
  durationMs: number;
}

export interface FsEntry {
  name: string;
  path: string;
  type: 'file' | 'dir' | 'symlink';
  mode: number;
  owner: string;
  group: string;
  size: number;
  mtime: number;
  target?: string;
}

export type LabInspectView =
  | { kind: 'database'; tables: { name: string; columns: string[]; rows: (string | number | null)[][] }[] }
  | { kind: 'sessions'; sessions: { id: string; userId: string; username: string; createdAt: number; data?: Record<string, unknown> }[] }
  | { kind: 'logs'; entries: LabLogEntry[] }
  | { kind: 'files'; root: FsEntry[] };

export interface LabLogEntry {
  at: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  source: string;
  message: string;
  data?: Record<string, unknown>;
}

// ── Signals & transcript ───────────────────────────────────────────────────

/**
 * A signal is raised *by the target itself* when something security-relevant
 * happens — an authorisation check being skipped, a row being returned for a
 * user who should not see it, a flag being read.
 *
 * This is the backbone of honest evaluation. We do not grade by matching the
 * learner's payload against an expected string; we grade by asking the
 * vulnerable application what actually happened inside it.
 */
export interface LabSignal {
  name: string;
  at: number;
  /** Which transcript event produced it. */
  seq: number;
  data?: Record<string, unknown>;
}

export interface LabEvent {
  seq: number;
  at: number;
  action: LabAction;
  result: LabActionResult;
  signals: string[];
}

export type LabStatus = 'creating' | 'ready' | 'busy' | 'error' | 'disposed';

export interface LabState {
  instanceId: LabInstanceId;
  specId: LabSpecId;
  status: LabStatus;
  createdAt: number;
  seed: string;
  surfaces: LabSurface[];
  /** Cookie jar contents, so the UI can show what the "browser" is holding. */
  cookies: { name: string; value: string; attributes: Record<string, string | true> }[];
  /** Current shell context, when the lab has a terminal. */
  shell?: { user: string; host: string; cwd: string };
  /** Distinct signals raised so far, in order of first occurrence. */
  signals: LabSignal[];
  eventCount: number;
  /** Set when the learner has captured a scenario flag. */
  flags: string[];
  error?: string;
}

export interface LabSnapshot {
  specId: LabSpecId;
  seed: string;
  takenAt: number;
  /** Opaque, runtime-specific serialised world state. */
  data: string;
}
