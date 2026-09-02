import { DatabaseSync } from 'node:sqlite';

import representativeFixture from '../../fixtures/legacy/representative.json';

import { importLegacyState } from '../../../src/application/import/legacy-import';
import { migrateDatabase, type MigrationDatabase } from '../../../src/data/migrations';
import type { RepositoryDatabase, SqlValue } from '../../../src/data/repositories';

function database() {
  const sqlite = new DatabaseSync(':memory:');
  const db = {
    exec: (sql: string) => sqlite.exec(sql),
    runAsync: async (sql: string, ...params: SqlValue[]) => {
      const result = sqlite.prepare(sql).run(...params);
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
    getFirstAsync: async (sql: string, ...params: SqlValue[]) =>
      (sqlite.prepare(sql).get(...params) ?? null) as never,
    getAllAsync: async (sql: string, ...params: SqlValue[]) => sqlite.prepare(sql).all(...params) as never,
    withTransactionAsync: async (task: () => Promise<void>) => {
      sqlite.exec('BEGIN IMMEDIATE');
      try { await task(); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  } as RepositoryDatabase & MigrationDatabase;
  return { db, sqlite, close: () => sqlite.close() };
}

describe('legacy SQLite import seam', () => {
  it('imports the same native payload once without inventing source dates', async () => {
    const { db, sqlite, close } = database();
    await migrateDatabase(db);
    const raw = JSON.stringify(representativeFixture);
    const readLegacyState = jest.fn(() => ({ status: 'available' as const, payload: raw }));
    const options = { readLegacyState, digest: async () => 'representative-sha256', now: () => '2026-08-17T12:00:00.000Z' };

    await expect(importLegacyState(db, options)).resolves.toMatchObject({ status: 'imported' });
    await expect(importLegacyState(db, options)).resolves.toMatchObject({ status: 'already-imported' });

    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM legacy_import_journal').get()).toEqual({ count: 1 });
    const stored = sqlite.prepare("SELECT value_json FROM app_setting WHERE key = 'legacy.v1.state'").get() as { value_json: string };
    const imported = JSON.parse(stored.value_json) as Record<string, unknown>;
    expect(imported).not.toHaveProperty('createdAt');
    expect(imported).not.toHaveProperty('completedAt');
    expect(imported).toMatchObject({ stage: 'w2', view: 'lunes' });
    close();
  });

  it('leaves malformed native state recoverable and the database unchanged', async () => {
    const { db, sqlite, close } = database();
    await migrateDatabase(db);
    const raw = '{"stage":"w2","checks":';
    const readLegacyState = jest.fn(() => ({ status: 'available' as const, payload: raw }));

    await expect(importLegacyState(db, { readLegacyState, digest: async () => 'malformed' }))
      .resolves.toMatchObject({ status: 'invalid', error: { code: 'malformed' } });
    expect(readLegacyState).toHaveReturnedWith({ status: 'available', payload: raw });
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM legacy_import_journal').get()).toEqual({ count: 0 });
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM app_setting').get()).toEqual({ count: 0 });
    close();
  });
});
