import { DatabaseSync } from 'node:sqlite';

import { DemoModeService, initializeModeStore, seedDemoSettings } from './demo-mode';
import { migrateDatabase } from '../../data/migrations';
import { createRepositories, type RepositoryDatabase, type SqlValue } from '../../data/repositories';

function open() {
  const sqlite = new DatabaseSync(':memory:');
  const db = {
    execAsync: async (sql: string) => { sqlite.exec(sql); },
    runAsync: async (sql: string, ...params: SqlValue[]) => {
      const result = sqlite.prepare(sql).run(...params);
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
    getFirstAsync: async <T,>(sql: string, ...params: SqlValue[]) => (sqlite.prepare(sql).get(...params) ?? null) as T | null,
    getAllAsync: async <T,>(sql: string, ...params: SqlValue[]) => sqlite.prepare(sql).all(...params) as T[],
    withTransactionAsync: async (work: () => Promise<void>) => {
      sqlite.exec('BEGIN');
      try { await work(); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  } satisfies RepositoryDatabase & { execAsync(sql: string): Promise<void> };
  return { db, sqlite };
}

it('defaults to personal and persists explicit demo selection independently', async () => {
  const control = open(); const demo = open(); const personal = open();
  try {
    await initializeModeStore(control.db); await migrateDatabase(demo.db); await migrateDatabase(personal.db);
    const settings = createRepositories(personal.db).settings;
    await settings.save({ id: 'training-settings', key: 'training-settings', value: { demoProfileId: 'legacy', profile: { benchPressReference: 87 } } });
    await settings.save({ id: 'setup-draft', key: 'setup-draft', value: { step: 2 } });
    const before = await settings.list();
    const prepare = jest.fn(async () => { await seedDemoSettings(demo.db); });
    const service = new DemoModeService(control.db, prepare);
    expect(await service.load()).toBe('personal');
    await Promise.all([service.switchTo('demo'), service.switchTo('demo')]);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(await new DemoModeService(control.db, prepare).load()).toBe('demo');
    const demoSettings = createRepositories(demo.db).settings;
    const seeded = await demoSettings.get('training-settings');
    expect(seeded?.value).toMatchObject({ profile: { benchPressReference: 60 } });
    await demoSettings.save({ id: 'training-settings', key: 'training-settings', value: { units: 'lb', profile: { benchPressReference: 30 } } });
    await seedDemoSettings(demo.db);
    expect((await demoSettings.get('training-settings'))?.value).toMatchObject({ units: 'lb' });
    await service.switchTo('personal');
    expect(await service.load()).toBe('personal');
    expect(await settings.list()).toEqual(before);
  } finally { control.sqlite.close(); demo.sqlite.close(); personal.sqlite.close(); }
});

it('keeps the selected mode on preparation or control-write failure and permits retry', async () => {
  const { db, sqlite } = open();
  try {
    await initializeModeStore(db);
    const prepare = jest.fn().mockRejectedValueOnce(new Error('prepare failed')).mockResolvedValue(undefined);
    const service = new DemoModeService(db, prepare);
    await expect(service.switchTo('demo')).rejects.toThrow('prepare failed');
    expect(await service.load()).toBe('personal');
    sqlite.exec("CREATE TRIGGER reject_mode BEFORE UPDATE ON data_mode BEGIN SELECT RAISE(ABORT, 'write failed'); END");
    await expect(service.switchTo('demo')).rejects.toThrow('write failed');
    expect(await service.load()).toBe('personal');
    sqlite.exec('DROP TRIGGER reject_mode');
    await service.switchTo('demo');
    expect(await service.load()).toBe('demo');
  } finally { sqlite.close(); }
});

it('reconciles a committed write after acknowledgement loss and serializes opposing requests', async () => {
  const { db, sqlite } = open();
  try {
    await initializeModeStore(db);
    let release!: () => void;
    const prepared = new Promise<void>(resolve => { release = resolve; });
    const service = new DemoModeService({ ...db, runAsync: async (sql, ...params) => {
      await db.runAsync(sql, ...params);
      throw new Error('Acknowledgement lost');
    } }, () => prepared);
    const entering = service.switchTo('demo');
    await expect(service.switchTo('personal')).rejects.toThrow('Mode change in progress');
    release();
    await expect(entering).resolves.toBe('demo');
    expect(await service.load()).toBe('demo');
    await expect(service.switchTo('personal')).resolves.toBe('personal');
  } finally { sqlite.close(); }
});
