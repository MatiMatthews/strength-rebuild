import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { migrateDatabase, type MigrationDatabase } from '../../../src/data/migrations';
import { type RepositoryDatabase, type SqlValue } from '../../../src/data/repositories';
import { EXERCISE_CATALOG_VERSION, exerciseCatalog, seedExerciseCatalog } from '../../../src/data/seeds/exercises';

function database() {
  const sqlite = new DatabaseSync(':memory:');
  const db = {
    exec: (sql: string) => sqlite.exec(sql),
    runAsync: async (sql: string, ...params: SqlValue[]) => {
      const result = sqlite.prepare(sql).run(...params);
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
    getFirstAsync: async (sql: string, ...params: SqlValue[]) => (sqlite.prepare(sql).get(...params) ?? null) as never,
    getAllAsync: async (sql: string, ...params: SqlValue[]) => sqlite.prepare(sql).all(...params) as never,
    withTransactionAsync: async (task: () => Promise<void>) => {
      sqlite.exec('BEGIN IMMEDIATE');
      try { await task(); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  } as RepositoryDatabase & MigrationDatabase;
  return { db, sqlite };
}

describe('versioned exercise catalog seed', () => {
  it('contains complete deterministic exercise and offline-media metadata', () => {
    expect(EXERCISE_CATALOG_VERSION).toBe(1);
    expect(exerciseCatalog.length).toBeGreaterThanOrEqual(12);
    expect(new Set(exerciseCatalog.map(({ id }) => id)).size).toBe(exerciseCatalog.length);

    for (const exercise of exerciseCatalog) {
      expect(exercise.pattern).toBeTruthy();
      expect(exercise.equipment.length).toBeGreaterThan(0);
      expect(exercise.skill).toMatch(/^(beginner|intermediate|advanced)$/);
      expect(exercise.impact).toMatch(/^(none|low|moderate|high)$/);
      expect(exercise.braceDemand).toMatch(/^(low|moderate|high)$/);
      expect(exercise.lumbarDemand).toMatch(/^(low|moderate|high)$/);
      expect(exercise.instructions.length).toBeGreaterThanOrEqual(2);
      expect(exercise.media).toMatchObject({ type: 'image', license: { spdx: 'CC0-1.0' } });
      expect(exercise.media.uri).toMatch(/^assets\/exercises\/[a-z0-9-]+\.svg$/);
      expect(existsSync(resolve(process.cwd(), exercise.media.uri))).toBe(true);
      expect(exercise.media.license.source).toBeTruthy();
      expect(exercise.media.license.attribution).toBeTruthy();
    }
  });

  it('writes the approved catalog transactionally and idempotently', async () => {
    const { db, sqlite } = database();
    await migrateDatabase(db);

    await seedExerciseCatalog(db, '2026-08-17T22:00:00.000Z');
    await seedExerciseCatalog(db, '2026-08-18T22:00:00.000Z');

    expect(sqlite.prepare('SELECT count(*) AS count FROM exercise').get()).toEqual({ count: exerciseCatalog.length });
    expect(sqlite.prepare('SELECT count(*) AS count FROM exercise_media').get()).toEqual({ count: exerciseCatalog.length });
    expect(sqlite.prepare('SELECT count(*) AS count FROM exercise_tag').get()).toEqual({
      count: exerciseCatalog.reduce((count, exercise) => count + exercise.tags.length, 0),
    });
    expect(sqlite.prepare("SELECT value_json FROM app_setting WHERE key = 'exercise_catalog_version'").get()).toEqual({
      value_json: JSON.stringify(EXERCISE_CATALOG_VERSION),
    });
    sqlite.close();
  });
});
