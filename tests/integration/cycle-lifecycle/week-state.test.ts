import { DatabaseSync } from 'node:sqlite';
import { ProgramService } from '../../../src/application/programs/program-service';
import { migrateDatabase, type MigrationDatabase } from '../../../src/data/migrations';
import type { RepositoryDatabase, SqlValue } from '../../../src/data/repositories';

function open(path: string) {
  const sqlite = new DatabaseSync(path);
  const db = { exec: (sql: string) => sqlite.exec(sql), runAsync: async (sql: string, ...params: SqlValue[]) => { const result = sqlite.prepare(sql).run(...params); return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) }; }, getFirstAsync: async (sql: string, ...params: SqlValue[]) => (sqlite.prepare(sql).get(...params) ?? null) as never, getAllAsync: async (sql: string, ...params: SqlValue[]) => sqlite.prepare(sql).all(...params) as never, withTransactionAsync: async (task: () => Promise<void>) => { sqlite.exec('BEGIN IMMEDIATE'); try { await task(); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } } as RepositoryDatabase & MigrationDatabase;
  return { sqlite, db };
}



it('reads week lifecycle without advancing time, prescriptions, or another cycle', async () => {
  const { sqlite, db } = open(':memory:');
  await migrateDatabase(db);
  const programs = new ProgramService(db);
  await programs.createPlan([{ id: 'lifecycle', type: 'hypertrophy', weeks: 3 }, { id: 'next', type: 'strength', weeks: 2 }]);
  await programs.activateCycle('lifecycle');
  await db.runAsync("UPDATE training_week SET status = 'COMPLETED' WHERE cycle_id = 'lifecycle' AND week_index = 1");
  await db.runAsync("UPDATE session_plan SET status = 'COMPLETED' WHERE id = 'lifecycle-week-2-day-1'");
  const originals = await db.getAllAsync('SELECT * FROM session_plan');
  const cycles = await db.getAllAsync('SELECT * FROM cycle');
  const current = (await programs.listCycleLifecycles()).find(cycle => cycle.id === 'lifecycle')!;
  expect(current.currentWeekIndex).toBe(2);
  expect(current.weeks.map(week => week.state)).toEqual(['completed', 'active', 'pending']);
  expect(current.weeks[1]?.completedSessions).toBe(1);
  expect((await programs.getTodayContext()).lifecycle).toEqual(current);
  expect((await new ProgramService(db, () => '2099-01-01T00:00:00Z').listCycleLifecycles())).toEqual(await programs.listCycleLifecycles());
  await db.runAsync("UPDATE training_week SET status = 'REVIEW' WHERE cycle_id = 'lifecycle' AND week_index = 2");
  expect((await programs.listCycleLifecycles())[0]?.weeks.map(week => week.state)).toEqual(['completed', 'review', 'pending']);
  expect(await programs.getToday()).toBeNull();
  await db.runAsync("UPDATE training_week SET status = 'COMPLETED' WHERE cycle_id = 'lifecycle'");
  const final = (await programs.listCycleLifecycles())[0]!;
  expect(final.currentWeekIndex).toBeNull();
  expect(final.awaitingConfirmation).toBe(true);
  expect(await programs.getToday()).toBeNull();
  expect((await programs.listCycleLifecycles()).filter(cycle => cycle.type === 'transition')[0]?.weeks[0]?.state).toBe('pending');
  expect(await db.getAllAsync('SELECT * FROM session_plan')).toEqual(originals);
  expect(await db.getAllAsync('SELECT * FROM cycle')).toEqual(cycles);
  sqlite.close();
});
