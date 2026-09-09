import { DatabaseSync } from 'node:sqlite';
import type { SqlResultView } from '@cyberlab/core';

/**
 * The lab SQL engine.
 *
 * This is a real SQLite database, and lab targets really do build queries by
 * concatenating strings into it. That is the entire point: when a learner types
 * `' OR '1'='1` the query is genuinely reparsed by SQLite and genuinely returns
 * rows it should not. Nothing here simulates injection — it permits it, inside
 * a box that cannot reach anything.
 *
 * The box:
 *  - every instance gets its own `:memory:` database, so there is no file to
 *    corrupt and nothing shared between learners;
 *  - extension loading is off;
 *  - a small deny-list blocks the handful of SQLite features that can touch the
 *    host filesystem (`ATTACH`, `VACUUM INTO`, `readfile`/`writefile`,
 *    `PRAGMA`). `sqlite_master` is deliberately *left open* because schema
 *    enumeration is a technique learners need to practise.
 */

export interface SqlEngineOptions {
  /** Hard cap on rows returned to the UI. */
  maxRows?: number;
  /** Hard cap on the length of a single statement. */
  maxSqlLength?: number;
}

const DENY_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\battach\s+(?:database\b|['"])/i, reason: 'ATTACH is not permitted inside a lab' },
  { pattern: /\bdetach\b/i, reason: 'DETACH is not permitted inside a lab' },
  { pattern: /\bvacuum\s+into\b/i, reason: 'VACUUM INTO would write to disk' },
  { pattern: /\bload_extension\s*\(/i, reason: 'extension loading is disabled' },
  { pattern: /\b(?:readfile|writefile|fileio_\w+)\s*\(/i, reason: 'filesystem functions are disabled' },
  { pattern: /\bpragma\b/i, reason: 'PRAGMA is not permitted inside a lab' },
];

export class SqlBlockedError extends Error {
  constructor(readonly reason: string) {
    super(`blocked by lab sandbox: ${reason}`);
    this.name = 'SqlBlockedError';
  }
}

export interface SqlQueryOutcome extends SqlResultView {
  /** True when the sandbox refused the statement rather than SQLite failing. */
  blocked?: boolean;
  truncated?: boolean;
  changes?: number;
}

export class SqlEngine {
  #db: DatabaseSync;
  readonly #maxRows: number;
  readonly #maxSqlLength: number;

  constructor(schema: string, options: SqlEngineOptions = {}) {
    this.#maxRows = options.maxRows ?? 500;
    this.#maxSqlLength = options.maxSqlLength ?? 8192;
    this.#db = new DatabaseSync(':memory:', { allowExtension: false });
    this.#db.exec(schema);
  }

  /** Trusted path: schema and seed data written by the target itself. */
  exec(sql: string): void {
    this.#db.exec(sql);
  }

  /** Trusted parameterised query, used by targets for their *safe* endpoints. */
  select(sql: string, params: unknown[] = []): Record<string, unknown>[] {
    const statement = this.#db.prepare(sql);
    return statement.all(...(params as never[])) as Record<string, unknown>[];
  }

  run(sql: string, params: unknown[] = []): { changes: number; lastInsertRowid: number | bigint } {
    const statement = this.#db.prepare(sql);
    const result = statement.run(...(params as never[]));
    return { changes: Number(result.changes), lastInsertRowid: result.lastInsertRowid };
  }

  /**
   * Untrusted path: whatever the (vulnerable) target assembled, including
   * anything the learner injected. Errors are returned, not thrown, because a
   * verbose SQL error *is* the lesson in error-based injection.
   */
  query(sql: string): SqlQueryOutcome {
    const startedAt = performance.now();
    const empty = { executedSql: sql, columns: [], rows: [], rowCount: 0 };

    if (sql.length > this.#maxSqlLength) {
      return {
        ...empty,
        error: `blocked by lab sandbox: statement longer than ${this.#maxSqlLength} characters`,
        blocked: true,
        durationMs: 0,
      };
    }

    const stripped = stripSqlComments(sql);
    for (const { pattern, reason } of DENY_PATTERNS) {
      if (pattern.test(stripped)) {
        return {
          ...empty,
          error: `blocked by lab sandbox: ${reason}`,
          blocked: true,
          durationMs: round(performance.now() - startedAt),
        };
      }
    }

    try {
      const statement = this.#db.prepare(sql);
      const columnMeta = statement.columns();

      if (columnMeta.length === 0) {
        const result = statement.run();
        return {
          executedSql: sql,
          columns: [],
          rows: [],
          rowCount: 0,
          changes: Number(result.changes),
          durationMs: round(performance.now() - startedAt),
        };
      }

      const raw = statement.all() as Record<string, unknown>[];
      const columns = columnMeta.map((c, i) => c.name ?? c.column ?? `col${i}`);
      const truncated = raw.length > this.#maxRows;
      const rows = (truncated ? raw.slice(0, this.#maxRows) : raw).map((row) =>
        columns.map((column) => normaliseValue(row[column])),
      );
      return {
        executedSql: sql,
        columns,
        rows,
        rowCount: rows.length,
        ...(truncated ? { truncated: true } : {}),
        durationMs: round(performance.now() - startedAt),
      };
    } catch (error) {
      return {
        ...empty,
        error: error instanceof Error ? error.message : String(error),
        durationMs: round(performance.now() - startedAt),
      };
    }
  }

  tableNames(): string[] {
    return this.select(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    ).map((row) => String(row['name']));
  }

  /** Full read of one table, for the lab's "database" inspector panel. */
  table(name: string): { name: string; columns: string[]; rows: (string | number | null)[][] } {
    const statement = this.#db.prepare(`SELECT * FROM "${name.replace(/"/g, '""')}"`);
    const columns = statement.columns().map((c, i) => c.name ?? c.column ?? `col${i}`);
    const rows = (statement.all() as Record<string, unknown>[]).map((row) =>
      columns.map((column) => normaliseValue(row[column])),
    );
    return { name, columns, rows };
  }

  dump(): SqlDump {
    const tables: SqlDump['tables'] = {};
    for (const name of this.tableNames()) {
      const t = this.table(name);
      tables[name] = { columns: t.columns, rows: t.rows };
    }
    return { tables };
  }

  load(dump: SqlDump): void {
    for (const [name, table] of Object.entries(dump.tables)) {
      const quoted = `"${name.replace(/"/g, '""')}"`;
      this.#db.exec(`DELETE FROM ${quoted}`);
      if (table.rows.length === 0) continue;
      const columnList = table.columns.map((c) => `"${c.replace(/"/g, '""')}"`).join(', ');
      const placeholders = table.columns.map(() => '?').join(', ');
      const statement = this.#db.prepare(`INSERT INTO ${quoted} (${columnList}) VALUES (${placeholders})`);
      for (const row of table.rows) statement.run(...(row as never[]));
    }
  }

  close(): void {
    try {
      this.#db.close();
    } catch {
      // Already closed; disposal must never throw.
    }
  }
}

export interface SqlDump {
  tables: Record<string, { columns: string[]; rows: (string | number | null)[][] }>;
}

function normaliseValue(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Uint8Array) return `<blob ${value.byteLength}b>`;
  return String(value);
}

/** Strips comments so the deny-list cannot be bypassed with `/*!ATTACH*​/`. */
export function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
