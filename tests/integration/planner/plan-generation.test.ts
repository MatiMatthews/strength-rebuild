import { DatabaseSync } from 'node:sqlite';

import { ProgramService } from '../../../src/application/programs/program-service';
import { migrateDatabase, type MigrationDatabase } from '../../../src/data/migrations';
import type { RepositoryDatabase, SqlValue } from '../../../src/data/repositories';

function open(path: string) {
  const sqlite = new DatabaseSync(path);
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

describe('plan generation SQLite seam', () => {
  it('persists hypertrophy, transition, and strength snapshots and restores identical Today data', async () => {
    const path = `${process.env.TMPDIR ?? '/tmp'}/strength-plan-${process.pid}-${Date.now()}.sqlite`;
    const first = open(path);
    await migrateDatabase(first.db);
    const service = new ProgramService(first.db, () => '2026-08-17T12:00:00.000Z');

    await service.createPlan([
      { id: 'hypertrophy-1', type: 'hypertrophy', weeks: 1 },
      { id: 'strength-1', type: 'strength', weeks: 1 },
    ]);

    expect(await service.listCycleSnapshots()).toHaveLength(3);
    expect((await service.listCycleSnapshots()).map(({ type }) => type)).toEqual([
      'hypertrophy', 'transition', 'strength',
    ]);
    expect(await service.countSessionSnapshots()).toBe(9);
    expect(await first.db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM cycle WHERE status = 'ACTIVE'")).toEqual({ count: 0 });
    expect(await service.getToday()).toBeNull();
    await service.activateCycle('hypertrophy-1');
    expect(await first.db.getFirstAsync<{ id: string }>("SELECT id FROM cycle WHERE status = 'ACTIVE'")).toEqual({ id: 'hypertrophy-1' });
    const todayBeforeClose = await service.getToday();
    expect(await service.getTodayContext()).toEqual({
      activeSession: false,
      restrictionActive: false,
      reviewRequired: false,
      today: todayBeforeClose,
    });
    first.close();

    const reopened = open(path);
    await migrateDatabase(reopened.db);
    const restored = new ProgramService(reopened.db);
    expect(await restored.getToday()).toEqual(todayBeforeClose);
    expect(await restored.countSessionSnapshots()).toBe(9);
    reopened.close();
  });

  it('keeps repeated preview creation idempotent and Today scoped to the confirmed active cycle', async () => {
    const path = `${process.env.TMPDIR ?? '/tmp'}/strength-plan-repeat-${process.pid}-${Date.now()}.sqlite`;
    const opened = open(path);
    await migrateDatabase(opened.db);
    const service = new ProgramService(opened.db, () => '2026-08-18T12:00:00.000Z');
    const requests = [
      { id: 'preview-reentry', type: 'reentry' as const, weeks: 1 },
      { id: 'confirmed-strength', type: 'strength' as const, weeks: 1 },
    ];

    await service.createPlan(requests);
    await expect(service.createPlan(requests)).resolves.toHaveLength(2);
    expect(await opened.db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM program_template')).toEqual({ count: 1 });
    expect(await opened.db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM cycle')).toEqual({ count: 2 });
    expect(await service.getToday()).toBeNull();

    await service.activateCycle('confirmed-strength');
    expect((await service.getToday())?.cycleId).toBe('confirmed-strength');
    opened.close();
  });
});
