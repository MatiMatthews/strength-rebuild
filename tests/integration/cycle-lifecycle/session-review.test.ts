import { proposeProgression } from '../../../src/domain/progression/propose-progression';
import { DatabaseSync } from 'node:sqlite';
import { ProgramService } from '../../../src/application/programs/program-service';
import { SessionReviewService } from '../../../src/application/progression/session-review';
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
  await programs.createPlan([{ id: 'personal', type: 'hypertrophy', weeks: 2 }]);
  await programs.activateCycle('personal');
  const today = (await programs.getToday())!;
  const workouts = new WorkoutService(db, undefined, () => '2026-09-05T10:00:00Z', () => 'monday');
  await workouts.applyReadiness(today, { pain: 0, painTrend: 'stable', region: 'other', reproducedByBraceCoughOrSneeze: false });
  let draft = await workouts.startOrResume(today);
  for (let e = 0; e < draft.exercises.length; e++) {
    for (let s = 0; s < draft.exercises[e]!.sets.length; s++) {
      draft = workouts.recordSet(draft, e, s, { load: '0', reps: '8', rir: '3', pain: 0, technique: 'Limpia' });
      draft = workouts.completeSet(draft, e, s);
    }
  }
  await workouts.complete(draft);
  return { sqlite, db, programs, reviews: new SessionReviewService(db) };
}

it.each(['ACCEPTED', 'KEPT', 'REJECTED'] as const)('persists %s once and preserves Monday while Wednesday remains reachable', async choice => {
  const { sqlite, db, programs, reviews } = await fixture();
  const original = await db.getAllAsync('SELECT * FROM workout_session');
  const plans = await db.getAllAsync('SELECT * FROM session_plan');
  const [proposal] = await reviews.listPending();
  expect(proposal).toBeDefined();
  expect((await programs.getTodayContext()).reviewRequired).toBe(false);
  await reviews.decide(proposal!, choice);
  expect(await reviews.listPending()).toEqual([]);
  await expect(reviews.decide(proposal!, choice)).rejects.toThrow();
  expect(await db.getAllAsync('SELECT * FROM workout_session')).toEqual(original);
  if (choice !== 'ACCEPTED') expect(await db.getAllAsync('SELECT * FROM session_plan')).toEqual(plans);
  expect(await db.getAllAsync("SELECT * FROM decision_log WHERE decision_type = 'SESSION_PROGRESSION'")).toHaveLength(1);
  expect((await new ProgramService(db).getToday())?.dayIndex).toBe(2);
  sqlite.close();
});

it('rejects stale acceptance, keeps a changed plan, and rolls back a failed audit', async () => {
  const { sqlite, db, reviews } = await fixture();
  const [proposal] = await reviews.listPending();
  expect(proposal!.target).not.toBeNull();
  const target = proposal!.target!;
  const changed = JSON.parse(target.snapshot_json); changed.testMarker = 'later-edit';
  await db.runAsync('UPDATE session_plan SET snapshot_json = ? WHERE id = ?', JSON.stringify(changed), target.id);
  await expect(reviews.decide(proposal!, 'ACCEPTED')).rejects.toThrow('cambió');
  expect(await reviews.listPending()).toHaveLength(1);
  const before = await db.getAllAsync('SELECT * FROM session_plan');
  sqlite.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON decision_log WHEN NEW.decision_type = 'SESSION_PROGRESSION' BEGIN SELECT RAISE(ABORT, 'audit failed'); END");
  const [fresh] = await reviews.listPending();
  await expect(reviews.decide(fresh!, 'ACCEPTED')).rejects.toThrow('audit failed');
  expect(await db.getAllAsync('SELECT * FROM session_plan')).toEqual(before);
  expect(await reviews.listPending()).toHaveLength(1);
  sqlite.exec('DROP TRIGGER fail_audit');
  await reviews.decide(proposal!, 'KEPT');
  expect(await db.getAllAsync('SELECT * FROM session_plan')).toEqual(before);
  sqlite.close();
});

it('recovers legacy context and invalid rows with an unchanged-plan exit', async () => {
  const { sqlite, db, reviews } = await fixture();
  const row = await db.getFirstAsync<{ inputs_json: string }>('SELECT inputs_json FROM progression_proposal');
  const legacy = JSON.parse(row!.inputs_json); delete legacy.sourceWorkoutId; delete legacy.sourceSessionPlanId;
  await db.runAsync('UPDATE progression_proposal SET inputs_json = ?', JSON.stringify(legacy));
  expect((await reviews.listPending())[0]!.target).not.toBeNull();
  await db.runAsync("UPDATE progression_proposal SET inputs_json = '{}' ");
  const [invalid] = await reviews.listPending();
  expect(invalid!.unavailable).toContain('verificables');
  await expect(reviews.decide(invalid!, 'ACCEPTED')).rejects.toThrow();
  await reviews.decide(invalid!, 'REJECTED');
  expect(await reviews.listPending()).toEqual([]);
  sqlite.close();
});

it('accepts changed targets into the actual future workout without touching completed work', async () => {
  const { sqlite, db, reviews, programs } = await fixture();
  const row = await db.getFirstAsync<{ inputs_json: string }>('SELECT inputs_json FROM progression_proposal');
  const input = JSON.parse(row!.inputs_json);
  input.role = 'accessory'; input.completed.sets = input.target.sets;
  input.completed.repsPerSet = Array(input.target.sets).fill(input.target.prescribedReps);
  input.completed.terminalRir = input.target.targetRir;
  const output = proposeProgression(input);
  expect(output.action).toBe('add_reps');
  await db.runAsync('UPDATE progression_proposal SET inputs_json = ?, output_json = ?', JSON.stringify(input), JSON.stringify(output));
  const [preview] = await reviews.listPending();
  const original = await db.getAllAsync('SELECT * FROM workout_session');
  await reviews.decide(preview!, 'ACCEPTED');
  const target = preview!.target!;
  // Move the consumer to the indicated future exposure, leaving all snapshots intact.
  await db.runAsync("UPDATE session_plan SET status = 'COMPLETED' WHERE day_index < ? AND training_week_id = (SELECT training_week_id FROM session_plan WHERE id = ?)", target.day_index, target.id);
  await db.runAsync("UPDATE training_week SET status = 'COMPLETED' WHERE cycle_id = 'personal' AND week_index < ?", target.week_index);
  const today = (await programs.getToday())!;
  expect(today.sessionPlanId).toBe(target.id);
  const workouts = new WorkoutService(db);
  await workouts.applyReadiness(today, { pain: 0, painTrend: 'stable', region: 'other', reproducedByBraceCoughOrSneeze: false });
  const draft = await workouts.startOrResume(today);
  expect(draft.exercises.find(e => e.exerciseId === input.exerciseId)?.sets[0]?.reps).toBe(String(output.nextTarget.reps));
  expect((await db.getAllAsync('SELECT * FROM workout_session WHERE id = ?', 'monday'))).toEqual(original);
  sqlite.close();
});

it('keeps weekly reviews and real readiness blocks enforced after a session choice', async () => {
  const { sqlite, db, reviews, programs } = await fixture();
  const [preview] = await reviews.listPending();
  await reviews.decide(preview!, 'KEPT');
  const today = (await programs.getToday())!;
  const workouts = new WorkoutService(db);
  await workouts.applyReadiness(today, { pain: 1, painTrend: 'stable', warningFlags: ['NEUROLOGICAL'], region: 'other', reproducedByBraceCoughOrSneeze: false });
  await expect(workouts.startOrResume(today)).rejects.toThrow('bloquea');
  await db.runAsync("UPDATE training_week SET status = 'REVIEW' WHERE week_index = 1");
  expect((await programs.getTodayContext()).reviewRequired).toBe(true);
  sqlite.close();
});
