import type { SQLiteDatabase } from 'expo-sqlite';

export const LATEST_SCHEMA_VERSION = 1;

type Row = Record<string, unknown>;

export interface MigrationDatabase {
  exec?(sql: string): void;
  execAsync?(sql: string): Promise<void>;
  prepare?(sql: string): { get(): Row | undefined };
  getFirstAsync?<T>(sql: string): Promise<T | null>;
}

const metadata = `
  id TEXT PRIMARY KEY NOT NULL,
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  created_at TEXT NOT NULL CHECK (length(created_at) > 0),
  updated_at TEXT NOT NULL CHECK (length(updated_at) > 0)
`;

const migrationV1 = `
CREATE TABLE schema_migration (
  version INTEGER PRIMARY KEY NOT NULL CHECK (version > 0),
  applied_at TEXT NOT NULL CHECK (length(applied_at) > 0)
);

CREATE TABLE exercise (${metadata}, name TEXT NOT NULL, movement_pattern TEXT NOT NULL,
  equipment TEXT NOT NULL, skill_level TEXT NOT NULL, impact TEXT NOT NULL,
  brace_demand TEXT NOT NULL, lumbar_demand TEXT NOT NULL, instructions_json TEXT NOT NULL);
CREATE TABLE exercise_media (${metadata}, exercise_id TEXT NOT NULL REFERENCES exercise(id) ON DELETE CASCADE,
  uri TEXT NOT NULL, media_type TEXT NOT NULL DEFAULT 'image', license_metadata_json TEXT);
CREATE TABLE exercise_tag (${metadata}, exercise_id TEXT NOT NULL REFERENCES exercise(id) ON DELETE CASCADE, tag TEXT NOT NULL,
  UNIQUE(exercise_id, tag));
CREATE TABLE exercise_alternative (${metadata}, exercise_id TEXT NOT NULL REFERENCES exercise(id) ON DELETE CASCADE,
  alternative_exercise_id TEXT NOT NULL REFERENCES exercise(id), rank INTEGER NOT NULL CHECK(rank >= 0), rationale TEXT NOT NULL,
  UNIQUE(exercise_id, alternative_exercise_id));

CREATE TABLE user_profile (${metadata}, display_name TEXT, preferences_json TEXT NOT NULL DEFAULT '{}');
CREATE TABLE equipment_profile (${metadata}, user_profile_id TEXT REFERENCES user_profile(id), equipment_json TEXT NOT NULL);
CREATE TABLE active_restriction (${metadata}, user_profile_id TEXT REFERENCES user_profile(id), kind TEXT NOT NULL,
  details_json TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)));
CREATE TABLE training_max (${metadata}, user_profile_id TEXT REFERENCES user_profile(id), exercise_id TEXT NOT NULL REFERENCES exercise(id),
  value REAL NOT NULL CHECK(value > 0), unit TEXT NOT NULL CHECK(unit IN ('kg','lb')));

CREATE TABLE program_template (${metadata}, name TEXT NOT NULL, version INTEGER NOT NULL CHECK(version > 0), snapshot_json TEXT NOT NULL);
CREATE TABLE cycle (${metadata}, program_template_id TEXT REFERENCES program_template(id), kind TEXT NOT NULL,
  status TEXT NOT NULL, policy_version TEXT NOT NULL, snapshot_json TEXT NOT NULL);
CREATE TABLE training_week (${metadata}, cycle_id TEXT NOT NULL REFERENCES cycle(id), week_index INTEGER NOT NULL CHECK(week_index > 0),
  status TEXT NOT NULL, snapshot_json TEXT NOT NULL, UNIQUE(cycle_id, week_index));
CREATE TABLE session_plan (${metadata}, training_week_id TEXT NOT NULL REFERENCES training_week(id), day_index INTEGER NOT NULL CHECK(day_index > 0),
  status TEXT NOT NULL, snapshot_json TEXT NOT NULL, UNIQUE(training_week_id, day_index));
CREATE TABLE session_exercise (${metadata}, session_plan_id TEXT NOT NULL REFERENCES session_plan(id), exercise_id TEXT NOT NULL REFERENCES exercise(id),
  position INTEGER NOT NULL CHECK(position >= 0), prescription_json TEXT NOT NULL, UNIQUE(session_plan_id, position));

CREATE TABLE workout_session (${metadata}, session_plan_id TEXT REFERENCES session_plan(id), status TEXT NOT NULL,
  prescribed_snapshot_json TEXT NOT NULL, actual_snapshot_json TEXT, completed_at TEXT);
CREATE TABLE set_log (${metadata}, workout_session_id TEXT NOT NULL REFERENCES workout_session(id), session_exercise_id TEXT REFERENCES session_exercise(id),
  set_index INTEGER NOT NULL CHECK(set_index > 0), load REAL CHECK(load >= 0), reps INTEGER CHECK(reps >= 0), rir REAL, rpe REAL,
  technique TEXT, pain INTEGER CHECK(pain BETWEEN 0 AND 10), notes TEXT, UNIQUE(workout_session_id, session_exercise_id, set_index));
CREATE TABLE symptom_log (${metadata}, workout_session_id TEXT NOT NULL REFERENCES workout_session(id), symptom TEXT NOT NULL,
  severity INTEGER NOT NULL CHECK(severity BETWEEN 0 AND 10), context_json TEXT NOT NULL);
CREATE TABLE session_note (${metadata}, workout_session_id TEXT NOT NULL REFERENCES workout_session(id), body TEXT NOT NULL);
CREATE TABLE timer_state (${metadata}, workout_session_id TEXT NOT NULL UNIQUE REFERENCES workout_session(id),
  started_at TEXT, duration_seconds INTEGER NOT NULL CHECK(duration_seconds >= 0), state TEXT NOT NULL);

CREATE TABLE progression_proposal (${metadata}, cycle_id TEXT NOT NULL REFERENCES cycle(id), policy_version TEXT NOT NULL,
  inputs_json TEXT NOT NULL, output_json TEXT NOT NULL, decision TEXT, decided_at TEXT);
CREATE TABLE substitution_decision (${metadata}, workout_session_id TEXT REFERENCES workout_session(id), original_exercise_id TEXT NOT NULL REFERENCES exercise(id),
  replacement_exercise_id TEXT NOT NULL REFERENCES exercise(id), policy_version TEXT NOT NULL, rationale TEXT NOT NULL);
CREATE TABLE decision_log (${metadata}, decision_type TEXT NOT NULL, policy_version TEXT NOT NULL,
  inputs_json TEXT NOT NULL, output_json TEXT NOT NULL, accepted INTEGER CHECK(accepted IN (0,1)), decided_at TEXT);

CREATE TABLE app_setting (${metadata}, key TEXT NOT NULL UNIQUE, value_json TEXT NOT NULL);
CREATE TABLE legacy_import_journal (${metadata}, source_version TEXT NOT NULL, payload_digest TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL, details_json TEXT NOT NULL);
CREATE TABLE export_manifest (${metadata}, export_version INTEGER NOT NULL CHECK(export_version > 0), payload_digest TEXT NOT NULL,
  exported_at TEXT NOT NULL, metadata_json TEXT NOT NULL);

INSERT INTO schema_migration(version, applied_at) VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
PRAGMA user_version = 1;
`;

async function exec(db: MigrationDatabase, sql: string) {
  if (db.execAsync) return db.execAsync(sql);
  if (db.exec) return db.exec(sql);
  throw new Error('Database does not support SQL execution');
}

async function userVersion(db: MigrationDatabase) {
  if (db.getFirstAsync) {
    const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    return row?.user_version ?? 0;
  }
  return (db.prepare?.('PRAGMA user_version').get() as { user_version?: number } | undefined)?.user_version ?? 0;
}

export async function migrateDatabase(db: MigrationDatabase | SQLiteDatabase) {
  await exec(db, 'PRAGMA foreign_keys = ON;');
  const current = await userVersion(db);
  if (current > LATEST_SCHEMA_VERSION) throw new Error(`Unsupported database version ${current}`);
  if (current === LATEST_SCHEMA_VERSION) return;

  await exec(db, `BEGIN IMMEDIATE;\n${migrationV1}\nCOMMIT;`).catch(async (error) => {
    try { await exec(db, 'ROLLBACK;'); } catch { /* SQLite already rolled back the failed batch. */ }
    throw error;
  });
}
