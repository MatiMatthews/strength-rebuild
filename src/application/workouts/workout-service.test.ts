import { DatabaseSync } from 'node:sqlite';

import { migrateDatabase } from '../../data/migrations';
import type { MigrationDatabase } from '../../data/migrations';
import type { RepositoryDatabase, SqlValue } from '../../data/repositories';
import { WorkoutService } from './workout-service';
import type { TodayData } from '../programs/program-service';
import { ProgramService } from '../programs/program-service';

describe('WorkoutService', () => {
  it('prefills, autosaves, and restores an active workout', async () => {
    const sqlite = new DatabaseSync(':memory:');
    const db = { exec: (sql: string) => sqlite.exec(sql), runAsync: async (sql: string, ...params: SqlValue[]) => { const result = sqlite.prepare(sql).run(...params); return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) }; }, getFirstAsync: async (sql: string, ...params: SqlValue[]) => (sqlite.prepare(sql).get(...params) ?? null) as never, getAllAsync: async (sql: string, ...params: SqlValue[]) => sqlite.prepare(sql).all(...params) as never, withTransactionAsync: async (task: () => Promise<void>) => { sqlite.exec('BEGIN'); try { await task(); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } } as RepositoryDatabase & MigrationDatabase;
    await migrateDatabase(db);
    const service = new WorkoutService(db);
    const prescription = { dayIndex: 1, exercises: [{ exerciseId: 'press', requirement: { kind: 'EXACT', value: 'press' }, qualityStops: [], target: { sets: 2, reps: { min: 8, max: 10 }, rir: { min: 2, max: 3 }, load: 20 } }] } as unknown as TodayData['session'];
    const started = await service.startOrResume(prescription);
    expect(started.exercises[0]?.sets).toHaveLength(2);
    expect(started.exercises[0]?.sets[0]).toMatchObject({ load: '20', reps: '8', rir: '2' });
    started.exercises[0]!.sets.push({ load: '22.5', reps: '9', rir: '1', technique: 'Regular', pain: 2, notes: 'estable', completed: false, skipped: false, disposition: 'PENDING' });
    await service.save(started);
    expect(await new WorkoutService(db).startOrResume(prescription)).toEqual(started);
    sqlite.close();
  });

  it('durably restores a text edit from the lightweight process-stop snapshot', async () => {
    const sqlite = new DatabaseSync(':memory:');
    const db = { exec: (sql: string) => sqlite.exec(sql), runAsync: async (sql: string, ...params: SqlValue[]) => { const result = sqlite.prepare(sql).run(...params); return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) }; }, getFirstAsync: async (sql: string, ...params: SqlValue[]) => (sqlite.prepare(sql).get(...params) ?? null) as never, getAllAsync: async (sql: string, ...params: SqlValue[]) => sqlite.prepare(sql).all(...params) as never, withTransactionAsync: async (task: () => Promise<void>) => { sqlite.exec('BEGIN'); try { await task(); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } } as RepositoryDatabase & MigrationDatabase;
    await migrateDatabase(db);
    const service = new WorkoutService(db);
    const prescription = { dayIndex: 1, exercises: [{ exerciseId: 'press', requirement: { kind: 'EXACT', value: 'press' }, qualityStops: [], target: { sets: 1, reps: { min: 8, max: 10 }, rir: { min: 2, max: 3 }, load: 20 } }] } as unknown as TodayData['session'];
    const started = await service.startOrResume(prescription);
    started.exercises[0]!.sets[0]!.load = '60';

    await service.saveDraftSnapshot(started);

    expect((await new WorkoutService(db).startOrResume(prescription)).exercises[0]!.sets[0]!.load).toBe('60');
    sqlite.close();
  });

  it('commits the latest text edit synchronously before an immediate process stop', async () => {
    const sqlite = new DatabaseSync(':memory:');
    const db = { exec: (sql: string) => sqlite.exec(sql), runSync: (sql: string, ...params: SqlValue[]) => { const result = sqlite.prepare(sql).run(...params); return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) }; }, runAsync: async (sql: string, ...params: SqlValue[]) => { const result = sqlite.prepare(sql).run(...params); return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) }; }, getFirstAsync: async (sql: string, ...params: SqlValue[]) => (sqlite.prepare(sql).get(...params) ?? null) as never, getAllAsync: async (sql: string, ...params: SqlValue[]) => sqlite.prepare(sql).all(...params) as never, withTransactionAsync: async (task: () => Promise<void>) => { sqlite.exec('BEGIN'); try { await task(); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } } as RepositoryDatabase & MigrationDatabase;
    await migrateDatabase(db);
    const service = new WorkoutService(db);
    const prescription = { dayIndex: 1, exercises: [{ exerciseId: 'press', requirement: { kind: 'EXACT', value: 'press' }, qualityStops: [], target: { sets: 1, reps: { min: 8, max: 10 }, rir: { min: 2, max: 3 }, load: 20 } }] } as unknown as TodayData['session'];
    const started = await service.startOrResume(prescription);
    started.exercises[0]!.sets[0]!.load = '60';

    expect(service.saveDraftSnapshotBeforeProcessStop(started)).toBe(true);
    expect((await new WorkoutService(db).startOrResume(prescription)).exercises[0]!.sets[0]!.load).toBe('60');
    sqlite.close();
  });

  it('builds the executable draft from ordered canonical blocks and their calculated loads', async () => {
    const sqlite = new DatabaseSync(':memory:');
    const db = { exec: (sql: string) => sqlite.exec(sql), runAsync: async (sql: string, ...params: SqlValue[]) => { const result = sqlite.prepare(sql).run(...params); return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) }; }, getFirstAsync: async (sql: string, ...params: SqlValue[]) => (sqlite.prepare(sql).get(...params) ?? null) as never, getAllAsync: async (sql: string, ...params: SqlValue[]) => sqlite.prepare(sql).all(...params) as never, withTransactionAsync: async (task: () => Promise<void>) => { sqlite.exec('BEGIN'); try { await task(); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } } as RepositoryDatabase & MigrationDatabase;
    await migrateDatabase(db);
    const service = new WorkoutService(db);
    const exercise = (exerciseId: string, calculatedLoad?: number) => ({ exerciseId, requirement: 'CAPABILITY', qualityStops: ['STOP_ON_TECHNIQUE_LOSS'], calculatedLoad, loadProvenance: 'fixture', target: { sets: 1, reps: { min: 5, max: 5 }, rir: { min: 2, max: 2 }, loadPercent: null } });
    const prescription = { dayIndex: 1, exercises: [exercise('legacy-flat')], blocks: [
      { role: 'activation', exercises: [exercise('activation')] },
      { role: 'primary', exercises: [exercise('primary', 72.5)] },
      { role: 'finish-review', exercises: [exercise('session-review')] },
    ] } as unknown as TodayData['session'];

    const started = await service.startOrResume(prescription);
    expect(started.exercises.map(({ exerciseId }) => exerciseId)).toEqual(['activation', 'primary']);
    expect(started.exercises[1]).toMatchObject({ blockRole: 'primary', sets: [{ load: '72.5' }] });
    sqlite.close();
  });

  it('keeps exercise identities isolated and requires every set to be completed or skipped', async () => {
    const sqlite = new DatabaseSync(':memory:');
    const db = { exec: (sql: string) => sqlite.exec(sql), runAsync: async (sql: string, ...params: SqlValue[]) => { const result = sqlite.prepare(sql).run(...params); return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) }; }, getFirstAsync: async (sql: string, ...params: SqlValue[]) => (sqlite.prepare(sql).get(...params) ?? null) as never, getAllAsync: async (sql: string, ...params: SqlValue[]) => sqlite.prepare(sql).all(...params) as never, withTransactionAsync: async (task: () => Promise<void>) => { sqlite.exec('BEGIN'); try { await task(); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } } as RepositoryDatabase & MigrationDatabase;
    await migrateDatabase(db);
    const service = new WorkoutService(db, undefined, () => '2026-08-18T20:00:00.000Z', () => 'workout-j02');
    const prescription = { dayIndex: 1, exercises: Array.from({ length: 6 }, (_, index) => ({ exerciseId: `exercise-${index + 1}`, requirement: { kind: 'PATTERN', value: 'press' }, qualityStops: [], target: { sets: 1, reps: { min: 8, max: 10 }, rir: { min: 2, max: 3 }, load: 20 } })) } as unknown as TodayData['session'];
    let draft = await service.startOrResume(prescription);

    draft = service.recordSet(draft, 3, 0, { load: '44' });
    draft = service.replaceExercise(draft, 3, 'replacement-4', 'boredom');
    expect(draft.exercises[0]).toMatchObject({ exerciseId: 'exercise-1', sets: [{ load: '20' }] });
    expect(draft.exercises[3]).toMatchObject({ exerciseId: 'replacement-4', sets: [{ load: '44' }] });
    expect(service.canComplete(draft)).toBe(false);

    for (let index = 0; index < 5; index += 1) draft = service.completeSet(draft, index, 0);
    draft = service.skipSet(draft, 5, 0, 'Molestia durante la serie');
    expect(service.canComplete(draft)).toBe(true);
    await service.complete(draft);
    sqlite.close();
  });

  it('restores process state and atomically consumes exactly one planned session', async () => {
    const sqlite = new DatabaseSync(':memory:');
    const db = { exec: (sql: string) => sqlite.exec(sql), runAsync: async (sql: string, ...params: SqlValue[]) => { const result = sqlite.prepare(sql).run(...params); return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) }; }, getFirstAsync: async (sql: string, ...params: SqlValue[]) => (sqlite.prepare(sql).get(...params) ?? null) as never, getAllAsync: async (sql: string, ...params: SqlValue[]) => sqlite.prepare(sql).all(...params) as never, withTransactionAsync: async (task: () => Promise<void>) => { sqlite.exec('BEGIN'); try { await task(); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } } as RepositoryDatabase & MigrationDatabase;
    await migrateDatabase(db);
    const programs = new ProgramService(db, () => '2026-08-18T20:00:00.000Z');
    await programs.createPlan([{ id: 'active', type: 'hypertrophy', weeks: 1 }]);
    await programs.activateCycle('active');
    const firstToday = (await programs.getToday())!;
    const service = new WorkoutService(db, undefined, () => '2026-08-18T20:01:00.000Z', () => 'workout-j03');
    await service.applyReadiness(firstToday, { pain: 1, painTrend: 'stable', region: 'other', reproducedByBraceCoughOrSneeze: false });
    let draft = await service.startOrResume(firstToday);
    draft = service.recordSet(draft, 1, 0, { notes: 'exact note', pain: 2 });
    draft = { ...draft, activeExerciseIndex: 1, timer: { durationSeconds: 90, remainingSeconds: 73, runningSince: 1_000 } };
    await service.save(draft);

    const restored = await new WorkoutService(db, undefined, () => '2026-08-18T20:02:00.000Z').startOrResume(firstToday);
    expect(restored).toMatchObject({ activeExerciseIndex: 1, timer: { remainingSeconds: 73, runningSince: null }, exercises: { 1: { sets: { 0: { notes: 'exact note', pain: 2 } } } } });
    const completed = restored.exercises.reduce((current, exercise, exerciseIndex) => exercise.sets.reduce((setsDraft, _set, setIndex) => service.completeSet(setsDraft, exerciseIndex, setIndex), current), restored);
    const firstCompletion = await service.complete(completed);
    expect((await programs.getToday())?.sessionPlanId).not.toBe(firstToday.sessionPlanId);
    await expect(service.complete(completed)).resolves.toEqual(firstCompletion);
    expect((await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM session_plan WHERE status = 'COMPLETED'"))?.count).toBe(1);
    sqlite.close();
  });
});
