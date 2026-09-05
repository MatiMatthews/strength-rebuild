import { WeeklyReviewService } from '../../../src/application/progression/weekly-review';
import { DatabaseSync } from 'node:sqlite';
import { ProgramService } from '../../../src/application/programs/program-service';
import { WorkoutService } from '../../../src/application/workouts/workout-service';
import { migrateDatabase, type MigrationDatabase } from '../../../src/data/migrations';
import type { RepositoryDatabase, SqlValue } from '../../../src/data/repositories';

function open(path: string) {
  const sqlite = new DatabaseSync(path);
  const db = { exec: (sql: string) => sqlite.exec(sql), runAsync: async (sql: string, ...params: SqlValue[]) => { const result = sqlite.prepare(sql).run(...params); return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) }; }, getFirstAsync: async (sql: string, ...params: SqlValue[]) => (sqlite.prepare(sql).get(...params) ?? null) as never, getAllAsync: async (sql: string, ...params: SqlValue[]) => sqlite.prepare(sql).all(...params) as never, withTransactionAsync: async (task: () => Promise<void>) => { sqlite.exec('BEGIN IMMEDIATE'); try { await task(); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } } as RepositoryDatabase & MigrationDatabase;
  return { sqlite, db };
}



async function fixture() {
  const { sqlite, db } = open(':memory:');
  await migrateDatabase(db);
  const programs = new ProgramService(db);
  await programs.createPlan([{ id: 'weekly', type: 'hypertrophy', weeks: 3 }]);
  await programs.activateCycle('weekly');
  let id = 0;
  const workouts = new WorkoutService(db, undefined, undefined, () => `work-${++id}`);
  // Complete two real weeks; the first review is an existing resolved predecessor.
  for (let week = 1; week <= 2; week++) {
    for (let day = 0; day < 3; day++) {
      const today = (await programs.getToday())!;
      await workouts.applyReadiness(today, { pain: 0, painTrend: 'stable', region: 'other', reproducedByBraceCoughOrSneeze: false });
      let draft = await workouts.startOrResume(today);
      for (let e = 0; e < draft.exercises.length; e++) for (let s = 0; s < draft.exercises[e]!.sets.length; s++) {
        draft = workouts.recordSet(draft, e, s, { load: '0', reps: '8', rir: '3', pain: 0, technique: 'Limpia' });
        draft = workouts.completeSet(draft, e, s);
      }
      await workouts.complete(draft);
    }
    if (week === 1) await db.runAsync("UPDATE training_week SET status = 'COMPLETED' WHERE week_index = 1");
  }
  return { sqlite, db, programs, reviews: new WeeklyReviewService(db) };
}

it.each(['ACCEPTED', 'KEPT', 'REJECTED'] as const)('recovers week two and persists %s once without changing prescriptions or history', async choice => {
  const { sqlite, db, programs, reviews } = await fixture();
  const before = await db.getAllAsync('SELECT * FROM session_plan');
  const history = await db.getAllAsync('SELECT * FROM workout_session');
  expect((await programs.getTodayContext()).reviewRequired).toBe(true);
  const input = { cycleId: 'weekly', weekIndex: 2, nextWeekIndex: 3, outcome: 'successful' as const };
  const proposal = await reviews.propose(input);
  expect(await new WeeklyReviewService(db).propose(input)).toEqual(proposal);
  const submits = await Promise.allSettled([reviews.decide(proposal.id, choice), reviews.decide(proposal.id, choice)]);
  expect(submits.map(result => result.status)).toEqual(['fulfilled', 'rejected']);
  expect((await programs.getTodayContext()).reviewRequired).toBe(false);
  expect((await programs.getToday())?.weekIndex).toBe(3);
  expect(await db.getAllAsync('SELECT * FROM session_plan')).toEqual(before);
  expect(await db.getAllAsync('SELECT * FROM workout_session')).toEqual(history);
  await expect(reviews.decide(proposal.id, choice)).rejects.toThrow();
  expect(await db.getAllAsync("SELECT * FROM decision_log WHERE decision_type = 'WEEKLY_PROGRESSION'")).toHaveLength(1);
  sqlite.close();
});

it('rejects ineligible and unrelated proposals and rolls back an audit failure', async () => {
  const { sqlite, db, reviews } = await fixture();
  await expect(reviews.propose({ cycleId: 'weekly', weekIndex: 3, nextWeekIndex: 4, outcome: 'successful' })).rejects.toThrow();
  const proposal = await reviews.propose({ cycleId: 'weekly', weekIndex: 2, nextWeekIndex: 3, outcome: 'successful' });
  const before = await db.getAllAsync('SELECT * FROM training_week');
  sqlite.exec("CREATE TRIGGER fail_weekly_audit BEFORE INSERT ON decision_log BEGIN SELECT RAISE(ABORT, 'audit failed'); END");
  await expect(reviews.decide(proposal.id, 'KEPT')).rejects.toThrow('audit failed');
  expect(await db.getAllAsync('SELECT * FROM training_week')).toEqual(before);
  expect((await db.getFirstAsync<{decision: string | null}>('SELECT decision FROM progression_proposal WHERE id = ?', proposal.id))?.decision).toBeNull();
  sqlite.exec('DROP TRIGGER fail_weekly_audit');
  const other = await db.getFirstAsync<{id: string}>("SELECT id FROM progression_proposal WHERE policy_version = 'progression-v1' LIMIT 1");
  await expect(reviews.decide(other!.id, true)).rejects.toThrow();
  expect(await db.getAllAsync('SELECT * FROM training_week')).toEqual(before);
  sqlite.close();
});

it('keeps safety records and prescriptions immutable, rejects stale decisions, and audits legacy duplicates', async () => {
  const { sqlite, db, reviews, programs } = await fixture();
  const proposal = await reviews.propose({ cycleId: 'weekly', weekIndex: 2, nextWeekIndex: 3, outcome: 'restricted' });
  // Inspect the future session as a synthetic checkpoint, then restore pending review.
  await db.runAsync("UPDATE training_week SET status = 'COMPLETED' WHERE week_index = 2");
  const today = (await programs.getToday())!;
  await new WorkoutService(db).applyReadiness(today, { pain: 1, painTrend: 'stable', region: 'other', reproducedByBraceCoughOrSneeze: false, warningFlags: ['NEUROLOGICAL'] });
  await db.runAsync("UPDATE training_week SET status = 'REVIEW' WHERE week_index = 2");
  await db.runAsync("INSERT INTO active_restriction (id, schema_version, created_at, updated_at, kind, details_json, active) VALUES ('safety-record', 1, '2026-01-01', '2026-01-01', 'abdominal', '{}', 1)");
  const safety = await db.getAllAsync('SELECT * FROM active_restriction');
  const readiness = await db.getAllAsync("SELECT * FROM app_setting WHERE key LIKE 'session-readiness:%'");
  expect(safety).toHaveLength(1); expect(readiness.length).toBeGreaterThan(0);
  const plans = await db.getAllAsync('SELECT * FROM session_plan');
  await db.runAsync("UPDATE training_week SET status = 'COMPLETED' WHERE week_index = 2");
  await expect(reviews.decide(proposal.id, 'ACCEPTED')).rejects.toThrow('cambió');
  await db.runAsync("UPDATE training_week SET status = 'REVIEW' WHERE week_index = 2");
  await db.runAsync(`INSERT INTO progression_proposal (id, schema_version, created_at, updated_at, cycle_id, policy_version, inputs_json, output_json)
    SELECT 'legacy-duplicate', schema_version, created_at, updated_at, cycle_id, policy_version, inputs_json, output_json FROM progression_proposal WHERE id = ?`, proposal.id);
  // A stored suggestion cannot smuggle a prescription write through weekly acceptance.
  await db.runAsync('UPDATE progression_proposal SET output_json = ? WHERE id = ?', JSON.stringify({ ...proposal, exerciseId: 'barbell-bench-press', nextTarget: { load: 999, sets: 9, reps: 99 } }), proposal.id);
  await reviews.decide(proposal.id, 'ACCEPTED');
  expect(await reviews.load('weekly', 2)).toBeNull();
  expect(await db.getAllAsync('SELECT * FROM session_plan')).toEqual(plans);
  expect(await db.getAllAsync('SELECT * FROM active_restriction')).toEqual(safety);
  expect(await db.getAllAsync("SELECT * FROM app_setting WHERE key LIKE 'session-readiness:%'")).toEqual(readiness);
  await expect(new WorkoutService(db).startOrResume(today)).rejects.toThrow('bloquea');
  const audit = await db.getFirstAsync<{output_json: string}>("SELECT output_json FROM decision_log WHERE decision_type = 'WEEKLY_PROGRESSION'");
  expect(JSON.parse(audit!.output_json).superseded).toEqual(['legacy-duplicate']);
  sqlite.close();
});


it('does not trap the active plan behind a review from a closed cycle', async () => {
  const { sqlite, db, programs, reviews } = await fixture();
  await db.runAsync("UPDATE cycle SET status = 'COMPLETED' WHERE id = 'weekly'");
  expect(await reviews.listPendingWeeks()).toEqual([]);
  expect((await programs.getTodayContext()).reviewRequired).toBe(false);
  sqlite.close();
});
