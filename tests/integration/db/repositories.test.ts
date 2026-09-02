import { DatabaseSync } from 'node:sqlite';

import { UnitOfWork } from '../../../src/application/transactions/unit-of-work';
import { migrateDatabase, type MigrationDatabase } from '../../../src/data/migrations';
import { createRepositories, type RepositoryDatabase, type SqlValue } from '../../../src/data/repositories';

function database() {
  const sqlite = new DatabaseSync(':memory:');
  const db = {
    exec: (sql) => sqlite.exec(sql),
    runAsync: async (sql: string, ...params: SqlValue[]) => {
      const result = sqlite.prepare(sql).run(...params);
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
    getFirstAsync: async (sql: string, ...params: SqlValue[]) => (sqlite.prepare(sql).get(...params) ?? null) as never,
    getAllAsync: async (sql: string, ...params: SqlValue[]) => sqlite.prepare(sql).all(...params) as never,
    withTransactionAsync: async (task) => {
      sqlite.exec('BEGIN IMMEDIATE');
      try { await task(); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  } as RepositoryDatabase & MigrationDatabase;
  return { db, close: () => sqlite.close() };
}

describe('typed SQLite repositories', () => {
  it('creates, reads, and updates settings with typed JSON values', async () => {
    const { db, close } = database();
    await migrateDatabase(db);
    const repositories = createRepositories(db);

    await repositories.settings.save({ id: 'theme', key: 'theme', value: { mode: 'dark' } });
    expect(await repositories.settings.get('theme')).toMatchObject({ key: 'theme', value: { mode: 'dark' }, schemaVersion: 1 });

    await repositories.settings.save({ id: 'theme', key: 'theme', value: { mode: 'system', contrast: 'high' } });
    expect((await repositories.settings.get('theme'))?.value).toEqual({ mode: 'system', contrast: 'high' });
    close();
  });

  it('allows active workout edits but preserves completed snapshots byte-for-byte', async () => {
    const { db, close } = database();
    await migrateDatabase(db);
    const { workouts } = createRepositories(db);
    await workouts.create({ id: 'workout', status: 'IN_PROGRESS', prescribedSnapshot: '{"sets":3}', actualSnapshot: null });

    await workouts.updateActualSnapshot('workout', '{"sets":2}');
    await workouts.complete('workout', '{"sets":3}', '2026-08-17T12:00:00.000Z');
    const completed = await workouts.get('workout');

    await expect(workouts.updateActualSnapshot('workout', '{"sets":99}')).rejects.toThrow('immutable');
    await expect(workouts.complete('workout', '{"sets":99}', '2026-08-18T12:00:00.000Z')).rejects.toThrow('immutable');
    expect(await workouts.get('workout')).toEqual(completed);
    close();
  });

  it('rolls back all repository writes when a unit of work fails', async () => {
    const { db, close } = database();
    await migrateDatabase(db);
    const repositories = createRepositories(db);
    const unitOfWork = new UnitOfWork(db, repositories);

    await expect(unitOfWork.run(async ({ settings }) => {
      await settings.save({ id: 'one', key: 'one', value: 1 });
      await settings.save({ id: 'two', key: 'two', value: 2 });
      throw new Error('reject transaction');
    })).rejects.toThrow('reject transaction');

    expect(await repositories.settings.list()).toEqual([]);
    close();
  });
});
