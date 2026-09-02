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
