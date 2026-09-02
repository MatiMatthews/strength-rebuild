import { DatabaseSync } from 'node:sqlite';

import { LATEST_SCHEMA_VERSION, migrateDatabase, type MigrationDatabase } from '../../../src/data/migrations';

function database(): DatabaseSync & MigrationDatabase {
  return new DatabaseSync(':memory:') as DatabaseSync & MigrationDatabase;
}

describe('SQLite migrations', () => {
  it('migrates an empty database through the latest schema exactly once', async () => {
    const db = database();

    await migrateDatabase(db);
    await migrateDatabase(db);

    const version = db.prepare('PRAGMA user_version').get() as { user_version: number };
    const migrations = db.prepare('SELECT version FROM schema_migration ORDER BY version').all();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name);

    expect(version.user_version).toBe(LATEST_SCHEMA_VERSION);
    expect(migrations).toEqual([{ version: 1 }]);
    expect(tables).toEqual(
      expect.arrayContaining([
        'exercise', 'exercise_media', 'exercise_tag', 'exercise_alternative',
        'user_profile', 'equipment_profile', 'active_restriction', 'training_max',
        'program_template', 'cycle', 'training_week', 'session_plan', 'session_exercise',
        'workout_session', 'set_log', 'symptom_log', 'session_note', 'timer_state',
        'progression_proposal', 'substitution_decision', 'decision_log',
        'app_setting', 'schema_migration', 'legacy_import_journal', 'export_manifest',
      ]),
    );
    db.close();
  });

  it('enforces foreign keys and record metadata constraints', async () => {
    const db = database();
    await migrateDatabase(db);

    expect(() =>
      db.prepare("INSERT INTO exercise_media (id, exercise_id, schema_version, created_at, updated_at, uri) VALUES ('m', 'missing', 1, '2026-01-01', '2026-01-01', 'local')").run(),
    ).toThrow();
    expect(() =>
      db.prepare("INSERT INTO exercise (id, schema_version, created_at, updated_at, name, movement_pattern, equipment, skill_level, impact, brace_demand, lumbar_demand, instructions_json) VALUES ('e', 0, '2026-01-01', '2026-01-01', 'Squat', 'squat', 'rack', 'novice', 'low', 'high', 'high', '[]')").run(),
    ).toThrow();
    db.close();
  });

  it('rolls back the whole migration when a statement fails', async () => {
    const db = database();
    db.exec("CREATE TABLE exercise (id TEXT PRIMARY KEY); INSERT INTO exercise(id) VALUES ('keep');");

    await expect(migrateDatabase(db)).rejects.toThrow();

    expect(db.prepare('SELECT id FROM exercise').all()).toEqual([{ id: 'keep' }]);
    expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 0 });
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migration'").get()).toBeUndefined();
    db.close();
  });
});
