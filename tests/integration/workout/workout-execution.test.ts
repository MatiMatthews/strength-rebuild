import { deleteLastSet, undoSetDeletion } from '../../../src/application/workouts/set-deletion';
import { DatabaseSync } from 'node:sqlite';

import { migrateDatabase, type MigrationDatabase } from '../../../src/data/migrations';
import { WorkoutRepository, type RepositoryDatabase, type SqlValue } from '../../../src/data/repositories';
import { WorkoutService } from '../../../src/application/workouts/workout-service';
import type { TodayData } from '../../../src/application/programs/program-service';

function openDatabase(path: string) {
  const sqlite = new DatabaseSync(path);
  const db = { exec: (sql: string) => sqlite.exec(sql), runAsync: async (sql: string, ...params: SqlValue[]) => { const result = sqlite.prepare(sql).run(...params); return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) }; }, getFirstAsync: async (sql: string, ...params: SqlValue[]) => (sqlite.prepare(sql).get(...params) ?? null) as never, getAllAsync: async (sql: string, ...params: SqlValue[]) => sqlite.prepare(sql).all(...params) as never, withTransactionAsync: async (task: () => Promise<void>) => { sqlite.exec('BEGIN'); try { await task(); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } } as RepositoryDatabase & MigrationDatabase;
  return { sqlite, db };
}

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
