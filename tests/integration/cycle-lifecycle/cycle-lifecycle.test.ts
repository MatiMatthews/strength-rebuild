import { DatabaseSync } from 'node:sqlite';

import { ProgramService } from '../../../src/application/programs/program-service';
import { WeeklyReviewService } from '../../../src/application/progression/weekly-review';
import { WorkoutService } from '../../../src/application/workouts/workout-service';
import { migrateDatabase, type MigrationDatabase } from '../../../src/data/migrations';
import { createRepositories, type RepositoryDatabase, type SqlValue } from '../../../src/data/repositories';
import { exerciseCatalog } from '../../../src/data/seeds/exercises';
import { rankSubstitutions } from '../../../src/domain/substitutions';
import type { TrainingSettings } from '../../../src/features/settings/settings';

function open(path: string) {
  const sqlite = new DatabaseSync(path);
  const db = { exec: (sql: string) => sqlite.exec(sql), runAsync: async (sql: string, ...params: SqlValue[]) => { const result = sqlite.prepare(sql).run(...params); return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) }; }, getFirstAsync: async (sql: string, ...params: SqlValue[]) => (sqlite.prepare(sql).get(...params) ?? null) as never, getAllAsync: async (sql: string, ...params: SqlValue[]) => sqlite.prepare(sql).all(...params) as never, withTransactionAsync: async (task: () => Promise<void>) => { sqlite.exec('BEGIN IMMEDIATE'); try { await task(); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } } as RepositoryDatabase & MigrationDatabase;
  return { sqlite, db };
}

describe('full persisted cycle lifecycle', () => {
  it('applies settings and preserves completed history while progressing hypertrophy through transition to strength', async () => {
    const file = `/tmp/strength-rebuild-d5-${process.pid}-${Date.now()}.sqlite`;
    const { sqlite, db } = open(file);
    await migrateDatabase(db);
    const repositories = createRepositories(db);
    const settings: TrainingSettings = { units: 'kg', increments: [2.5], equipment: ['dumbbells', 'incline-bench'], schedule: [2, 4, 6], requirements: [{ kind: 'PATTERN', value: 'horizontal-push' }], restrictions: ['low-brace'] };
    await repositories.settings.save({ id: 'training-settings', key: 'training-settings', value: settings });
    const persisted = (await repositories.settings.get<TrainingSettings>('training-settings'))!.value;
    const replacements = rankSubstitutions(exerciseCatalog, { originalExerciseId: 'barbell-bench-press', requirement: { type: persisted.requirements[0]!.kind, value: persisted.requirements[0]!.value }, reason: 'equipment-unavailable', availableEquipment: persisted.equipment, skillLevel: 'intermediate', restrictions: { maxImpact: 'low', maxBraceDemand: 'low', maxLumbarDemand: 'low' }, recentExerciseIds: [], preferredExerciseIds: [] });
    expect(replacements[0]?.exercise.id).toBe('incline-dumbbell-press');

    const programs = new ProgramService(db, () => '2026-08-18T02:00:00.000Z');
    const cycles = await programs.createPlan([{ id: 'hypertrophy', type: 'hypertrophy', weeks: 2 }, { id: 'strength', type: 'strength', weeks: 1 }]);
    expect(cycles.map(({ type }) => type)).toEqual(['hypertrophy', 'transition', 'strength']);
    await programs.activateCycle('hypertrophy');
    const today = (await programs.getToday())!;
    const workouts = new WorkoutService(db, repositories.workouts, () => '2026-08-18T02:15:00.000Z', () => 'hypertrophy-session');
    let draft = await workouts.startOrResume(today.session);
    draft = workouts.replaceExercise(draft, 0, replacements[0]!.exercise.id, 'equipment-unavailable');
    draft = draft.exercises.reduce((current, exercise, exerciseIndex) => exercise.sets.reduce((setsDraft, _set, setIndex) => workouts.completeSet(setsDraft, exerciseIndex, setIndex), current), draft);
    await workouts.complete(draft);
    const historyBefore = await workouts.listHistory();

    const reviews = new WeeklyReviewService(db, () => '2026-08-18T02:30:00.000Z', () => 'review-hypertrophy');
    await reviews.decide((await reviews.propose({ cycleId: 'hypertrophy', weekIndex: 1, nextWeekIndex: 2, outcome: 'successful' })).id, true);
    await programs.completeCycleAndActivateNext('hypertrophy', 'hypertrophy--to--strength');
    await programs.completeCycleAndActivateNext('hypertrophy--to--strength', 'strength');
    expect(await db.getFirstAsync<{ id: string }>("SELECT id FROM cycle WHERE status = 'ACTIVE'")).toEqual({ id: 'strength' });

    await db.runAsync("UPDATE session_plan SET snapshot_json = '{\"futureEdit\":true}' WHERE training_week_id LIKE 'strength-%'");
    expect(await workouts.listHistory()).toEqual(historyBefore);
    expect(JSON.parse(historyBefore[0]!.actual.exercises[0]!.replacement ? JSON.stringify(historyBefore[0]!.actual) : '{}').exercises[0].exerciseId).toBe('incline-dumbbell-press');
    sqlite.close();
  });
});
