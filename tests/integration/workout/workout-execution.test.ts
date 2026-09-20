import { deleteLastSet, undoSetDeletion } from '../../../src/application/workouts/set-deletion';
import { DatabaseSync } from 'node:sqlite';

import { migrateDatabase, type MigrationDatabase } from '../../../src/data/migrations';
import { WorkoutRepository, type RepositoryDatabase, type SqlValue } from '../../../src/data/repositories';
import { WorkoutService } from '../../../src/application/workouts/workout-service';
import type { TodayData } from '../../../src/application/programs/program-service';
import { buildHistoryAnalytics } from '../../../src/domain/analytics/workout-history';
import { generatePrescription } from '../../../src/domain/prescriptions/generator';

function openDatabase(path: string) {
  const sqlite = new DatabaseSync(path);
  const db = { exec: (sql: string) => sqlite.exec(sql), runAsync: async (sql: string, ...params: SqlValue[]) => { const result = sqlite.prepare(sql).run(...params); return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) }; }, getFirstAsync: async (sql: string, ...params: SqlValue[]) => (sqlite.prepare(sql).get(...params) ?? null) as never, getAllAsync: async (sql: string, ...params: SqlValue[]) => sqlite.prepare(sql).all(...params) as never, withTransactionAsync: async (task: () => Promise<void>) => { sqlite.exec('BEGIN'); try { await task(); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } } as RepositoryDatabase & MigrationDatabase;
  return { sqlite, db };
}

describe('explicit early completion', () => {
  it('requires confirmation and completed work, preserving every pending and skipped field through reopen', async () => {
    const { sqlite, db } = openDatabase(':memory:');
    await migrateDatabase(db);
    const session = { dayIndex: 1, exercises: [{ exerciseId: 'barbell-bench-press', requirement: 'EXACT',
      target: { sets: 4, reps: { min: 8, max: 10 }, rir: { min: 2, max: 3 } } }] } as unknown as TodayData['session'];
    const service = new WorkoutService(db, undefined, () => '2026-09-20T12:00:00Z', () => 'early-work');
    let draft = await service.startOrResume(session);
    await expect(service.complete(draft, { finishEarly: true })).rejects.toThrow();
    draft = service.recordSet(draft, 0, 0, { load: '60', reps: '8' });
    draft = service.completeSet(draft, 0, 0);
    draft = service.skipSet(draft, 0, 1, 'Equipment occupied');
    draft = service.recordSet(draft, 0, 2, { notes: 'Edited but not confirmed', load: '42.5' });
    const original = structuredClone(draft);
    await expect(service.complete(draft)).rejects.toThrow('Incomplete');
    sqlite.exec("CREATE TRIGGER fail_early BEFORE UPDATE OF status ON workout_session BEGIN SELECT RAISE(ABORT, 'synthetic write failure'); END");
    await expect(service.complete(draft, { finishEarly: true })).rejects.toThrow('synthetic write failure');
    expect(sqlite.prepare('SELECT status FROM workout_session').get()).toEqual({ status: 'IN_PROGRESS' });
    sqlite.exec('DROP TRIGGER fail_early');
    await service.complete(draft, { finishEarly: true });
    const history = await new WorkoutService(db).listHistory();
    expect(history).toHaveLength(1);
    expect(history[0]!.actual.exercises).toEqual(original.exercises);
    expect(history[0]!.actual.completionMode).toBe('early');
    expect(history[0]!.actual.exercises[0]!.sets.map(set => set.disposition)).toEqual(['COMPLETED', 'SKIPPED', 'PENDING', 'PENDING']);
    expect(buildHistoryAnalytics(history)).toMatchObject({ completedSetCount: 1, skippedSetCount: 1, pendingSetCount: 2, adherence: 0.25 });
    await service.complete(draft, { finishEarly: true });
    expect(await service.listHistory()).toHaveLength(1);
    sqlite.close();
  });
});

describe('explicit exercise measurements', () => {
  it('uses the replacement measurement without inventing a value in a different unit', async () => {
    const { sqlite, db } = openDatabase(':memory:');
    await migrateDatabase(db);
    const session = generatePrescription({ id: 'replacement-units', type: 'strength', weeks: 1 }).weeks[0]!.sessions[0]!;
    const service = new WorkoutService(db);
    const initial = await service.startOrResume(session);
    const replaced = service.replaceExercise(initial, 0, 'thoracic-mobility', 'other');
    expect(replaced.exercises[0]!.recording).toBe('bodyweight-reps');
    expect(replaced.exercises[0]!.sets).toEqual(initial.exercises[0]!.sets);
    expect(() => service.completeSet(replaced, 0, 0)).toThrow();
    const recorded = service.completeSet(service.recordSet(replaced, 0, 0, { reps: '5' }), 0, 0);
    await service.saveDraftSnapshot(recorded);
    const restored = await new WorkoutService(db).startOrResume(session);
    expect(restored.exercises[0]).toMatchObject({ recording: 'bodyweight-reps', sets: [expect.objectContaining({ reps: '5', seconds: '60', load: '' }), expect.anything(), expect.anything()] });
    sqlite.close();
  });

  it('persists seconds and per-side repetitions without reinterpreting a legacy workout', async () => {
    const { sqlite, db } = openDatabase(':memory:');
    await migrateDatabase(db);
    const session = generatePrescription({ id: 'measurements', type: 'strength', weeks: 1 }).weeks[0]!.sessions[0]!;
    const service = new WorkoutService(db, undefined, () => '2026-09-20T12:00:00Z', () => 'measured-work');
    let draft = await service.startOrResume(session);
    expect(draft.exercises[0]).toMatchObject({ recording: 'seconds', sets: [expect.objectContaining({ seconds: '60', reps: '', load: '' }), expect.anything(), expect.anything()] });
    const coreIndex = draft.exercises.findIndex(exercise => exercise.exerciseId === 'dead-bug');
    expect(draft.exercises[coreIndex]).toMatchObject({ recording: 'reps-per-side' });
    draft = service.recordSet(draft, 0, 0, { seconds: '45' });
    draft = service.completeSet(draft, 0, 0);
    await service.saveDraftSnapshot(draft);
    const restored = await new WorkoutService(db).startOrResume(session);
    expect(restored.exercises[0]!.sets[0]).toMatchObject({ seconds: '45', reps: '', completed: true });
    expect(() => service.completeSet(service.recordSet(restored, 0, 1, { seconds: '' }), 0, 1)).toThrow();
    expect(() => service.completeSet(service.recordSet(restored, 0, 1, { seconds: '-1' }), 0, 1)).toThrow();
    sqlite.close();

    const legacyDb = openDatabase(':memory:');
    await migrateDatabase(legacyDb.db);
    const legacySession = { dayIndex: 1, exercises: [{ exerciseId: 'bodyweight-activation', requirement: 'CAPABILITY',
      target: { sets: 1, reps: { min: 8, max: 10 }, rir: { min: 2, max: 3 }, load: 20 } }] } as unknown as TodayData['session'];
    const legacy = await new WorkoutService(legacyDb.db).startOrResume(legacySession);
    expect(legacy.exercises[0]!.recording).toBeUndefined();
    expect(legacy.exercises[0]!.sets[0]).toMatchObject({ load: '20', reps: '8' });
    expect(legacy.exercises[0]!.sets[0]!.seconds).toBeUndefined();
    legacyDb.sqlite.close();
  });
});

describe('workout execution seam', () => {
  it('runs Today through replacement, safety modification, process restore, completion, and immutable History data', async () => {
    const file = `/tmp/strength-rebuild-c7-${process.pid}.sqlite`;
    const first = openDatabase(file);
    await migrateDatabase(first.db);
    const today = { dayIndex: 1, exercises: [{ exerciseId: 'barbell-bench-press', requirement: { kind: 'EXACT', value: 'barbell-bench-press' }, qualityStops: [], target: { sets: 1, reps: { min: 8, max: 10 }, rir: { min: 2, max: 3 }, load: 20 } }] } as unknown as TodayData['session'];
    const service = new WorkoutService(first.db, undefined, () => '2026-08-18T01:00:00.000Z', () => 'workout-c7');

    let draft = await service.startOrResume(today);
    draft = service.recordSet(draft, 0, 0, { load: '22.5', reps: '8', pain: 3, technique: 'Regular' });
    draft = service.replaceExercise(draft, 0, 'incline-dumbbell-press', 'discomfort');
    await service.save(draft);
    first.sqlite.close();

    const reopened = openDatabase(file);
    const restoredService = new WorkoutService(reopened.db, undefined, () => '2026-08-18T01:00:00.000Z');
    let restored = await restoredService.startOrResume(today);
    expect(restored.exercises[0]).toMatchObject({ exerciseId: 'incline-dumbbell-press', replacement: { reason: 'discomfort' } });
    expect(restored.safetyModifications[0]).toMatchObject({ disposition: 'MODIFY_SET' });
    restored = restoredService.completeSet(restored, 0, 0);
    await restoredService.complete(restored);

    const history = await restoredService.listHistory();
    expect(history).toHaveLength(1);
    expect(history[0]?.actual.exercises[0]!.sets[0]).toMatchObject({ load: '22.5', reps: '8', pain: 3 });
    await expect(new WorkoutRepository(reopened.db).updateActualSnapshot('workout-c7', '{}')).rejects.toThrow('immutable');
    reopened.sqlite.close();
  });
});

describe('recoverable active set deletion', () => {
  it('preserves exact omitted/completed originals, later work, safety and immutable history', async () => {
    const { sqlite, db } = openDatabase(':memory:');
    await migrateDatabase(db);
    const session = { dayIndex: 1, exercises: [{ exerciseId: 'barbell-bench-press', requirement: { kind: 'EXACT' },
      target: { sets: 3, reps: { min: 8, max: 10 }, rir: { min: 2, max: 3 } } }] } as unknown as TodayData['session'];
    const service = new WorkoutService(db, undefined, () => '2026-09-05T00:00:00Z', () => 'delete-work');
    let draft = await service.startOrResume(session);
    draft = service.recordSet(draft, 0, 2, { load: '60', reps: '8', rir: '2', notes: 'Keep every field', technique: 'Regular', pain: 3 });
    draft = service.completeSet(draft, 0, 2);
    const original = draft.exercises[0]!.sets[2];
    const safety = structuredClone(draft.safetyModifications);
    draft = deleteLastSet(draft, 0);
    await service.saveDraftSnapshot(draft);
    let reopened = await new WorkoutService(db).startOrResume(session);
    expect(reopened.exercises[0]!.sets).toHaveLength(2);
    expect(reopened.setDeletions![0]!.set).toEqual(original);
    reopened = service.recordSet(reopened, 0, 0, { notes: 'Later work', load: '25' });
    reopened.exercises[0]!.sets.push({ ...reopened.exercises[0]!.sets[1]!, notes: 'Later added set' });
    const restored = undoSetDeletion(reopened, 1);
    expect(restored.exercises[0]!.sets[2]).toEqual(original);
    expect(restored.exercises[0]!.sets[3]!.notes).toBe('Later added set');
    expect(restored.exercises[0]!.sets[0]!.notes).toBe('Later work');
    expect(restored.safetyModifications).toEqual(safety);
    expect(undoSetDeletion(restored, 1)).toEqual(restored);
    let omitted = service.skipSet(restored, 0, 3, 'Equipment occupied');
    const omittedSet = omitted.exercises[0]!.sets[3];
    omitted = undoSetDeletion(deleteLastSet(omitted, 0), 2);
    expect(omitted.exercises[0]!.sets[3]).toEqual(omittedSet);
    const changedExercise = service.replaceExercise(deleteLastSet(omitted, 0), 0, 'goblet-squat', 'equipment-unavailable');
    expect(() => undoSetDeletion(changedExercise, 3)).toThrow('ejercicio original');
    let minimum = deleteLastSet(deleteLastSet(deleteLastSet(omitted, 0), 0), 0);
    expect(() => deleteLastSet(minimum, 0)).toThrow('al menos una');
    minimum = service.completeSet(minimum, 0, 0);
    await service.complete(minimum);
    const before = sqlite.prepare('SELECT * FROM workout_session').all();
    await expect(service.saveDraftSnapshot(undoSetDeletion(minimum, minimum.setDeletions!.at(-1)!.id))).rejects.toThrow('immutable');
    expect(sqlite.prepare('SELECT * FROM workout_session').all()).toEqual(before);
    sqlite.close();
  });
});
