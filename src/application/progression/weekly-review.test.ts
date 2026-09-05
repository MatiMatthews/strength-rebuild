import { DatabaseSync } from 'node:sqlite';
import { migrateDatabase, type MigrationDatabase } from '../../data/migrations';
import type { RepositoryDatabase, SqlValue } from '../../data/repositories';
import { ProgramService } from '../programs/program-service';
import { WeeklyReviewService } from './weekly-review';

it.each([['successful', 'progress'], ['missed', 'reduce'], ['failed', 'repeat'], ['restricted', 'hold'], ['repeated', 'repeat']] as const)('persists explained %s outcome without altering prescriptions', async (outcome, action) => {
  const sqlite = new DatabaseSync(':memory:');
  const db = { exec: (sql: string) => sqlite.exec(sql), runAsync: async (sql: string, ...p: SqlValue[]) => { const r = sqlite.prepare(sql).run(...p); return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) }; }, getFirstAsync: async (sql: string, ...p: SqlValue[]) => (sqlite.prepare(sql).get(...p) ?? null) as never, getAllAsync: async (sql: string, ...p: SqlValue[]) => sqlite.prepare(sql).all(...p) as never, withTransactionAsync: async (task: () => Promise<void>) => { sqlite.exec('BEGIN'); try { await task(); sqlite.exec('COMMIT'); } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } } as RepositoryDatabase & MigrationDatabase;
  await migrateDatabase(db);
  const programs = new ProgramService(db);
  await programs.createPlan([{ id: 'cycle', type: 'strength', weeks: 2 }]); await programs.activateCycle('cycle');
  const reviews = new WeeklyReviewService(db);
  expect(await reviews.isEligible('cycle', 1)).toBe(false);
  await expect(reviews.propose({ cycleId: 'cycle', weekIndex: 1, nextWeekIndex: 2, outcome })).rejects.toThrow();
  await db.runAsync("UPDATE session_plan SET status = 'COMPLETED' WHERE training_week_id IN (SELECT id FROM training_week WHERE week_index = 1)");
  await db.runAsync("UPDATE training_week SET status = 'REVIEW' WHERE week_index = 1");
  expect(await reviews.isEligible('cycle', 1)).toBe(true);
  const before = await db.getAllAsync('SELECT * FROM session_plan');
  const proposal = await reviews.propose({ cycleId: 'cycle', weekIndex: 1, nextWeekIndex: 2, outcome });
  expect(proposal.action).toBe(action); expect(proposal.explanation).toBeTruthy();
  expect(await new WeeklyReviewService(db).load('cycle', 1)).toEqual(proposal);
  await reviews.decide(proposal.id, true);
  expect(await db.getAllAsync('SELECT * FROM session_plan')).toEqual(before);
  expect(await db.getAllAsync('SELECT * FROM decision_log')).toHaveLength(1);
  sqlite.close();
});
