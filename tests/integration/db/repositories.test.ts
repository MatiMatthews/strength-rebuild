import { createSettingsStore } from '../../../src/features/settings/settings-store';
import { defaultSettings } from '../../../src/features/settings/settings';
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


describe('training settings transactions', () => {
  it('merges deliberate edits, preserves concurrent unrelated data and rejects conflicting changes', async () => {
    const { db, close } = database(); await migrateDatabase(db);
    const { settings } = createRepositories(db); const store = createSettingsStore(settings);
    await settings.save({ id: 'training-settings', key: 'training-settings', value: defaultSettings });
    const baseline = await store.load();
    const concurrent = { ...baseline, equipment: [...baseline.equipment, 'Bandas'], profile: { ...baseline.profile!, benchPressReference: 87 } };
    await settings.save({ id: 'training-settings', key: 'training-settings', value: concurrent });
    await store.save({ ...baseline, schedule: [2, 4, 6], increments: [2.75, 5] }, baseline);
    const saved = await store.load();
    expect(saved).toEqual({ ...concurrent, schedule: [2, 4, 6], increments: [2.75, 5] });
    await expect(store.save({ ...baseline, schedule: [3, 5, 7] }, baseline)).rejects.toThrow(/cambió/);
    expect(await store.load()).toEqual(saved);
    await settings.save({ id: 'training-settings', key: 'training-settings', value: { ...saved, units: 'lb' } });
    await expect(store.save({ ...saved, increments: [10] }, saved)).rejects.toThrow(/cambió/);
    expect(await store.load()).toEqual({ ...saved, units: 'lb' });
    close();
  });

  it('rejects invalid edits and a write racing the final conditional statement without partial writes', async () => {
    const { db, close } = database(); await migrateDatabase(db);
    const { settings } = createRepositories(db); const store = createSettingsStore(settings);
    await store.save(defaultSettings);
    const before = await settings.list();
    // The real SQLite trigger simulates a storage rejection of the atomic statement.
    await db.runAsync("CREATE TRIGGER reject_settings BEFORE UPDATE ON app_setting BEGIN SELECT RAISE(ABORT, 'storage failure'); END");
    await expect(store.save({ ...defaultSettings, schedule: [2, 4, 6] }, defaultSettings)).rejects.toThrow('storage failure');
    expect(await settings.list()).toEqual(before);
    await db.runAsync('DROP TRIGGER reject_settings');
    await expect(store.save({ ...defaultSettings, schedule: [1] }, defaultSettings)).rejects.toThrow(/tres/);
    expect(await settings.list()).toEqual(before);
    const concurrent = { ...defaultSettings, restrictions: ['concurrent'] };
    const compare = settings.compareAndSave.bind(settings);
    jest.spyOn(settings, 'compareAndSave').mockImplementationOnce(async (value, expected) => {
      await settings.save({ id: 'training-settings', key: 'training-settings', value: concurrent });
      return compare(value, expected);
    });
    await expect(store.save({ ...defaultSettings, schedule: [2, 4, 6] }, defaultSettings)).rejects.toThrow(/cambió/);
    expect(await store.load()).toEqual(concurrent);
    close();
  });
});
