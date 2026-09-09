import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { emptyProgress, type Attempt, type UserProgress } from '@cyberlab/core';

/**
 * Progress persistence.
 *
 * Progress is the one thing that must survive a restart, so it lives in SQLite
 * (the same `node:sqlite` the labs use, so there is no native dependency). The
 * shape is deliberately simple: the rich `UserProgress` object is stored as a
 * JSON document per user, because it is only ever read and written whole. Labs
 * are *not* persisted — they are ephemeral by design and rebuilt from their
 * seed — so there is no schema to migrate when a lab changes.
 */
export class Store {
  #db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.#db = new DatabaseSync(path);
    this.#db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS progress (
        user_id TEXT PRIMARY KEY,
        document TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS attempts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        exercise_id TEXT NOT NULL,
        document TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        finished_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id, started_at DESC);
    `);
  }

  getProgress(userId: string): UserProgress {
    const row = this.#db.prepare('SELECT document FROM progress WHERE user_id = ?').get(userId) as
      | { document: string }
      | undefined;
    if (!row) {
      const fresh = emptyProgress(userId);
      this.saveProgress(fresh);
      return fresh;
    }
    return JSON.parse(row.document) as UserProgress;
  }

  saveProgress(progress: UserProgress): void {
    progress.updatedAt = Date.now();
    this.#db
      .prepare(
        `INSERT INTO progress (user_id, document, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET document = excluded.document, updated_at = excluded.updated_at`,
      )
      .run(progress.userId, JSON.stringify(progress), progress.updatedAt);
  }

  saveAttempt(attempt: Attempt): void {
    this.#db
      .prepare(
        `INSERT INTO attempts (id, user_id, exercise_id, document, started_at, finished_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET document = excluded.document, finished_at = excluded.finished_at`,
      )
      .run(
        attempt.id,
        attempt.userId,
        attempt.exerciseId,
        JSON.stringify(attempt),
        attempt.startedAt,
        attempt.finishedAt ?? null,
      );
  }

  getAttempt(id: string): Attempt | undefined {
    const row = this.#db.prepare('SELECT document FROM attempts WHERE id = ?').get(id) as
      | { document: string }
      | undefined;
    return row ? (JSON.parse(row.document) as Attempt) : undefined;
  }

  recentAttempts(userId: string, limit = 20): Attempt[] {
    const rows = this.#db
      .prepare('SELECT document FROM attempts WHERE user_id = ? ORDER BY started_at DESC LIMIT ?')
      .all(userId, limit) as { document: string }[];
    return rows.map((r) => JSON.parse(r.document) as Attempt);
  }

  close(): void {
    this.#db.close();
  }
}
