export type SqlValue = string | number | null | Uint8Array;

export interface RunResult {
  changes: number;
  lastInsertRowId: number;
}

export interface RepositoryDatabase {
  runSync?(sql: string, ...params: SqlValue[]): RunResult;
  runAsync(sql: string, ...params: SqlValue[]): Promise<RunResult>;
  getFirstAsync<T>(sql: string, ...params: SqlValue[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...params: SqlValue[]): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

interface MetadataRow {
  id: string;
  schema_version: number;
  created_at: string;
  updated_at: string;
}

export interface Setting<T = unknown> {
  id: string;
  key: string;
  value: T;
  schemaVersion?: number;
  createdAt?: string;
  updatedAt?: string;
}

type SettingRow = MetadataRow & { key: string; value_json: string };

export class SettingRepository {
  constructor(private readonly db: RepositoryDatabase, private readonly now = () => new Date().toISOString()) {}

  async save<T>(setting: Setting<T>) {
    const timestamp = this.now();
    await this.db.runAsync(
      `INSERT INTO app_setting (id, schema_version, created_at, updated_at, key, value_json)
       VALUES (?, 1, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
      setting.id, timestamp, timestamp, setting.key, JSON.stringify(setting.value),
    );
  }

  async get<T = unknown>(key: string): Promise<Setting<T> | null> {
    const row = await this.db.getFirstAsync<SettingRow>('SELECT * FROM app_setting WHERE key = ?', key);
    return row ? this.map<T>(row) : null;
  }

  async list<T = unknown>(): Promise<Setting<T>[]> {
    const rows = await this.db.getAllAsync<SettingRow>('SELECT * FROM app_setting ORDER BY key');
    return rows.map((row) => this.map<T>(row));
  }

  private map<T>(row: SettingRow): Setting<T> {
    return { id: row.id, key: row.key, value: JSON.parse(row.value_json) as T, schemaVersion: row.schema_version,
      createdAt: row.created_at, updatedAt: row.updated_at };
  }
}

export type WorkoutStatus = 'PLANNED' | 'READINESS_GATE' | 'IN_PROGRESS' | 'COMPLETED' | 'MODIFIED' | 'ABORTED';

export interface WorkoutSession {
  id: string;
  sessionPlanId?: string | null;
  status: WorkoutStatus;
  prescribedSnapshot: string;
  actualSnapshot: string | null;
  completedAt?: string | null;
}

type WorkoutRow = MetadataRow & {
  session_plan_id: string | null;
  status: WorkoutStatus;
  prescribed_snapshot_json: string;
  actual_snapshot_json: string | null;
  completed_at: string | null;
};

export class WorkoutRepository {
  constructor(private readonly db: RepositoryDatabase, private readonly now = () => new Date().toISOString()) {}

  async create(workout: WorkoutSession) {
    const timestamp = this.now();
    await this.db.runAsync(
      `INSERT INTO workout_session
       (id, schema_version, created_at, updated_at, session_plan_id, status, prescribed_snapshot_json, actual_snapshot_json, completed_at)
       VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?)`,
      workout.id, timestamp, timestamp, workout.sessionPlanId ?? null, workout.status, workout.prescribedSnapshot, workout.actualSnapshot,
      workout.completedAt ?? null,
    );
  }

  async get(id: string): Promise<WorkoutSession | null> {
    const row = await this.db.getFirstAsync<WorkoutRow>('SELECT * FROM workout_session WHERE id = ?', id);
    return row ? { id: row.id, sessionPlanId: row.session_plan_id, status: row.status, prescribedSnapshot: row.prescribed_snapshot_json,
      actualSnapshot: row.actual_snapshot_json, completedAt: row.completed_at } : null;
  }

  async updateActualSnapshot(id: string, snapshot: string) {
    const result = await this.db.runAsync(
      `UPDATE workout_session SET actual_snapshot_json = ?, updated_at = ?
       WHERE id = ? AND status <> 'COMPLETED'`, snapshot, this.now(), id,
    );
    await this.requireMutable(result, id);
  }

  updateActualSnapshotSync(id: string, snapshot: string) {
    if (!this.db.runSync) return false;
    const result = this.db.runSync(
      `UPDATE workout_session SET actual_snapshot_json = ?, updated_at = ?
       WHERE id = ? AND status <> 'COMPLETED'`, snapshot, this.now(), id,
    );
    if (result.changes === 0) throw new Error(`Workout ${id} is not mutable`);
    return true;
  }

  async complete(id: string, snapshot: string, completedAt: string) {
    const result = await this.db.runAsync(
      `UPDATE workout_session SET status = 'COMPLETED', actual_snapshot_json = ?, completed_at = ?, updated_at = ?
       WHERE id = ? AND status <> 'COMPLETED'`, snapshot, completedAt, this.now(), id,
    );
    await this.requireMutable(result, id);
  }

  private async requireMutable(result: RunResult, id: string) {
    if (result.changes > 0) return;
    const workout = await this.get(id);
    if (!workout) throw new Error(`Workout ${id} does not exist`);
    throw new Error(`Completed workout ${id} is immutable`);
  }
}

export interface Repositories {
  settings: SettingRepository;
  workouts: WorkoutRepository;
}

export function createRepositories(db: RepositoryDatabase): Repositories {
  return { settings: new SettingRepository(db), workouts: new WorkoutRepository(db) };
}
