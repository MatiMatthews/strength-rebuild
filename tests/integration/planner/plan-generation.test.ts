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
  it('persists resolved requirement IDs and rejects an unsatisfied request without changing the active plan', async () => {
    const path = `${process.env.TMPDIR ?? '/tmp'}/strength-catalog-${process.pid}-${Date.now()}.sqlite`;
    const first = open(path);
    await migrateDatabase(first.db);
    const service = new ProgramService(first.db);
    await service.createPlan([{ id: 'catalog', type: 'strength', weeks: 1,
      requirements: [{ kind: 'PATTERN', value: 'horizontal-push' }, { kind: 'CAPABILITY', value: 'power' }] }]);
    await service.activateCycle('catalog');
    const before = await first.db.getAllAsync('SELECT * FROM cycle');
    await expect(service.createPlan([{ id: 'invalid', type: 'strength', weeks: 1,
      equipment: ['bodyweight'], requirements: [{ kind: 'EXACT', value: 'barbell-bench-press' }] }])).rejects.toThrow('Requisito 1');
    expect(await first.db.getAllAsync('SELECT * FROM cycle')).toEqual(before);
    expect(await first.db.getFirstAsync('SELECT COUNT(*) AS count FROM program_template')).toEqual({ count: 1 });
    first.close();
    const reopened = open(path);
    const row = await reopened.db.getFirstAsync<{ snapshot_json: string; status: string }>('SELECT snapshot_json, status FROM cycle WHERE id = ?', 'catalog');
    expect(row?.status).toBe('ACTIVE');
    const snapshot = JSON.parse(row!.snapshot_json);
    const requested = snapshot.weeks[0].sessions[0].blocks.find((block: { role: string }) => block.role === 'core').exercises.slice(-2);
    expect(requested.map((exercise: { exerciseId: string }) => exercise.exerciseId)).toEqual(['barbell-bench-press', 'low-volume-jump']);
    expect(requested[0].target).toEqual({ sets: 3, reps: { min: 3, max: 6 }, rir: { min: 2, max: 3 }, loadPercent: { min: 75, max: 85 } });
    reopened.close();
  });

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
