import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProgramService } from '../../../src/application/programs/program-service';
import { WorkoutService } from '../../../src/application/workouts/workout-service';
import { BackupService } from '../../../src/application/export/backup-service';
import { migrateDatabase, type MigrationDatabase } from '../../../src/data/migrations';
import { SettingRepository, type RepositoryDatabase, type SqlValue } from '../../../src/data/repositories';
import { defaultSettings } from '../../../src/features/settings/settings';

function open(path: string) {
  const sqlite = new DatabaseSync(path);
  const db = {
    exec: (sql) => sqlite.exec(sql),
    runAsync: async (sql: string, ...params: SqlValue[]) => {
      const result = sqlite.prepare(sql).run(...params);
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
    getFirstAsync: async (sql: string, ...params: SqlValue[]) => (sqlite.prepare(sql).get(...params) ?? null) as never,
    getAllAsync: async (sql: string, ...params: SqlValue[]) => sqlite.prepare(sql).all(...params) as never,
    withTransactionAsync: async (task) => {
      sqlite.exec('BEGIN IMMEDIATE');
      try { await task(); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  } as RepositoryDatabase & MigrationDatabase;
  return { db, close: () => sqlite.close() };
}


const id = 'legacy-week-1-day-1';
async function fixture(path = ':memory:') {
  const opened = open(path);
  await migrateDatabase(opened.db);
  const programs = new ProgramService(opened.db);
  await programs.createPlan([{ id: 'legacy', type: 'strength', weeks: 1 }, { id: 'unrelated', type: 'strength', weeks: 1 }]);
  const row = await opened.db.getFirstAsync<{ snapshot_json: string }>('SELECT snapshot_json FROM session_plan WHERE id = ?', id);
  const session = JSON.parse(row!.snapshot_json);
  session.exercises[0] = { ...session.exercises[0], exerciseId: 'unknown', calculatedLoad: 999 };
  session.blocks[0].exercises[0] = session.exercises[0];
  await opened.db.runAsync('UPDATE session_plan SET snapshot_json = ? WHERE id = ?', JSON.stringify(session), id);
  return { ...opened, programs };
}
const read = (db: RepositoryDatabase) => new BackupService(db, () => 'fixed').export();

it.each(['settings', 'active', 'completed', 'changed-source', 'closed-cycle', 'restriction'])('rejects %s changes after review without any further writes', async fault => {
  const f = await fixture();
  try {
    const proposal = await f.programs.prepareLegacyRepair(id, 'unknown', 'barbell-bench-press');
    if (fault === 'settings') await new SettingRepository(f.db).save({ id: 'training-settings', key: 'training-settings', value: { ...defaultSettings, equipment: ['bodyweight'] } });
    if (fault === 'active' || fault === 'completed') await f.db.runAsync(`INSERT INTO workout_session
      (id,schema_version,created_at,updated_at,session_plan_id,status,prescribed_snapshot_json,actual_snapshot_json)
      VALUES ('new-work',1,'now','now',?,?,'{}','{}')`, id, fault === 'completed' ? 'COMPLETED' : 'IN_PROGRESS');
    if (fault === 'changed-source') await f.db.runAsync("UPDATE session_plan SET snapshot_json = json_set(snapshot_json, '$.exercises[0].calculatedLoad', 888) WHERE id = ?", id);
    if (fault === 'closed-cycle') await f.db.runAsync("UPDATE cycle SET status = 'COMPLETED' WHERE id = 'legacy'");
    if (fault === 'restriction') await f.db.runAsync("INSERT INTO active_restriction (id,schema_version,created_at,updated_at,kind,details_json) VALUES ('safety',1,'now','now','pain','{}')");
    const before = await read(f.db);
    await expect(f.programs.applyLegacyRepair(proposal)).rejects.toThrow();
    expect(await read(f.db)).toBe(before);
  } finally { f.close(); }
});

it('rolls back a failed audit write and rejects a changed confirmed target', async () => {
  const f = await fixture();
  try {
    const proposal = await f.programs.prepareLegacyRepair(id, 'unknown', 'barbell-bench-press');
    const before = await read(f.db);
    await expect(f.programs.applyLegacyRepair({ ...proposal, replacement: { ...proposal.replacement, calculatedLoad: 999 } })).rejects.toThrow('cambió');
    await f.db.runAsync("CREATE TRIGGER reject_repair AFTER INSERT ON decision_log BEGIN SELECT RAISE(ABORT, 'injected storage failure'); END");
    await expect(f.programs.applyLegacyRepair(proposal)).rejects.toThrow('injected storage failure');
    expect(await read(f.db)).toBe(before);
  } finally { f.close(); }
});

it('cold reopens, keeps backups portable and idempotent, and starts the actual repaired workout with no inherited load', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'legacy-repair-'));
  const path = join(dir, 'plan.sqlite');
  const f = await fixture(path);
  try {
    const before = JSON.parse(await read(f.db)).tables;
    const proposal = await f.programs.prepareLegacyRepair(id, 'unknown', 'barbell-bench-press');
    await f.programs.applyLegacyRepair(proposal);
    await f.programs.applyLegacyRepair(proposal);
    const after = JSON.parse(await read(f.db)).tables;
    expect(after.decision_log).toHaveLength(1);
    expect({ ...after, decision_log: [] }).toEqual(before);
    const encrypted = await new BackupService(f.db).exportEncrypted('synthetic portable repair password');
    f.close();
    const reopened = open(path);
    try {
      await migrateDatabase(reopened.db);
      const programs = new ProgramService(reopened.db);
      expect(await programs.listInvalidSessionReferences()).toEqual([]);
      await programs.applyLegacyRepair(proposal);
      const restored = open(':memory:');
      try {
        await migrateDatabase(restored.db);
        const backups = new BackupService(restored.db);
        await backups.restorePortable(encrypted, { secret: 'synthetic portable repair password', replaceConfirmed: true });
        const firstRestore = await read(restored.db);
        await backups.restorePortable(encrypted, { secret: 'synthetic portable repair password', replaceConfirmed: true });
        expect(await read(restored.db)).toBe(firstRestore);
        expect(await new ProgramService(restored.db).listCycleSnapshots()).toEqual(await programs.listCycleSnapshots());
      } finally { restored.close(); }
      await programs.activateCycle('legacy');
      const today = (await programs.getToday())!;
      const workouts = new WorkoutService(reopened.db);
      await workouts.applyReadiness(today, { pain: 1, painTrend: 'stable', region: 'other', reproducedByBraceCoughOrSneeze: false });
      const workout = await workouts.startOrResume(today);
      expect(workout.exercises[0]!.exerciseId).toBe('barbell-bench-press');
      expect(workout.exercises[0]!.sets[0]!.load).not.toBe('999');
      expect((await programs.listCycleSnapshots())[0]!.weeks[0]!.sessions[0]).toEqual(today.session);
      expect(JSON.parse(await read(reopened.db)).tables.session_plan).toEqual(before.session_plan);
    } finally { reopened.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

it.each(['status', 'settings', 'work', 'source', 'kind', 'restriction'])('atomically rejects arriving %s without rolling back that independent write', async fault => {
  const f = await fixture();
  try {
    const proposal = await f.programs.prepareLegacyRepair(id, 'unknown', 'barbell-bench-press');
    let arrived = '';
    const interleaved = new ProgramService({ ...f.db, runAsync: async (sql, ...params) => {
      if (sql.includes('INTO decision_log')) {
        if (fault === 'status') await f.db.runAsync("UPDATE session_plan SET status = 'COMPLETED' WHERE id = ?", id);
        if (fault === 'settings') await new SettingRepository(f.db).save({ id: 'training-settings', key: 'training-settings', value: { ...defaultSettings, equipment: ['bodyweight'] } });
        if (fault === 'work') await f.db.runAsync("INSERT INTO workout_session (id,schema_version,created_at,updated_at,session_plan_id,status,prescribed_snapshot_json) VALUES ('arriving',1,'now','now','legacy-week-1-day-1','IN_PROGRESS','{}')");
        if (fault === 'source') await f.db.runAsync("UPDATE session_plan SET snapshot_json = json_set(snapshot_json, '$.exercises[0].calculatedLoad', 888) WHERE id = ?", id);
        if (fault === 'kind') await f.db.runAsync("UPDATE cycle SET kind = 'power' WHERE id = 'legacy'");
        if (fault === 'restriction') await f.db.runAsync("INSERT INTO active_restriction (id,schema_version,created_at,updated_at,kind,details_json) VALUES ('arriving',1,'now','now','pain','{}')");
        arrived = await read(f.db);
      }
      return f.db.runAsync(sql, ...params);
    } });
    await expect(interleaved.applyLegacyRepair(proposal)).rejects.toThrow();
    expect(await f.db.getAllAsync('SELECT * FROM decision_log')).toHaveLength(0);
    expect(await read(f.db)).toBe(arrived);
  } finally { f.close(); }
});


it.each(['READY', 'ACTIVE'])('repairs a future session beside completed and active work in %s without changing either', async status => {
  const f = await fixture();
  try {
    await f.db.runAsync("UPDATE cycle SET status = ? WHERE id = 'legacy'", status);
    for (const [day, state] of [[2, 'COMPLETED'], [3, 'IN_PROGRESS']] as const) {
      await f.db.runAsync(`INSERT INTO workout_session (id,schema_version,created_at,updated_at,session_plan_id,status,prescribed_snapshot_json,actual_snapshot_json)
        VALUES (?,1,'now','now',?,?,'{"original":true}','{"exercises":[{"exerciseId":"unknown-recorded","sets":[{"load":"60","reps":"8"}]}]}')`, `protected-${day}`, `legacy-week-1-day-${day}`, state);
    }
    const before = JSON.parse(await read(f.db)).tables;
    const proposal = await f.programs.prepareLegacyRepair(id, 'unknown', 'barbell-bench-press');
    await f.programs.applyLegacyRepair(proposal);
    await f.programs.applyLegacyRepair(proposal);
    const after = JSON.parse(await read(f.db)).tables;
    expect(after.decision_log).toHaveLength(1);
    expect({ ...after, decision_log: [] }).toEqual(before);
    const encrypted = await new BackupService(f.db).exportEncrypted('synthetic mixed repair password');
    const restored = await fixture();
    try {
      const backups = new BackupService(restored.db);
      await backups.restorePortable(encrypted, { secret: 'synthetic mixed repair password', replaceConfirmed: true });
      const once = await read(restored.db);
      await backups.restorePortable(encrypted, { secret: 'synthetic mixed repair password', replaceConfirmed: true });
      expect(await read(restored.db)).toBe(once);
      expect((await restored.programs.listCycleSnapshots())[0]!.weeks[0]!.sessions[0]!.exercises[0]!.exerciseId).toBe('barbell-bench-press');
      expect(JSON.parse(once).tables.workout_session).toEqual(before.workout_session);
    } finally { restored.close(); }
  } finally { f.close(); }
});

it('accepts another session arriving at commit while preserving that independent work', async () => {
  const f = await fixture();
  try {
    const proposal = await f.programs.prepareLegacyRepair(id, 'unknown', 'barbell-bench-press');
    let arrived = '';
    const interleaved = new ProgramService({ ...f.db, runAsync: async (sql, ...params) => {
      if (sql.includes('INTO decision_log')) {
        await f.db.runAsync("INSERT INTO workout_session (id,schema_version,created_at,updated_at,session_plan_id,status,prescribed_snapshot_json,actual_snapshot_json) VALUES ('arriving-other',1,'now','now','legacy-week-1-day-2','IN_PROGRESS','{}','{\"load\":60}')");
        arrived = await read(f.db);
      }
      return f.db.runAsync(sql, ...params);
    } });
    await interleaved.applyLegacyRepair(proposal);
    expect({ ...JSON.parse(await read(f.db)).tables, decision_log: [] }).toEqual(JSON.parse(arrived).tables);
  } finally { f.close(); }
});

it.each(['malformed', 'conflict', 'source', 'output', 'target'])('rejects %s repair backup before replacing existing data', async fault => {
  const f = await fixture();
  try {
    await f.programs.applyLegacyRepair(await f.programs.prepareLegacyRepair(id, 'unknown', 'barbell-bench-press'));
    const before = await read(f.db);
    const document = JSON.parse(before);
    const row = document.tables.decision_log[0];
    if (fault === 'malformed') row.inputs_json = '{}';
    if (fault === 'conflict') document.tables.decision_log.push({ ...row, id: 'conflicting-repair' });
    if (fault === 'output') row.output_json = '{}';
    if (fault === 'source') row.inputs_json = JSON.stringify({ ...JSON.parse(row.inputs_json), source: '{}' });
    if (fault === 'target') row.inputs_json = JSON.stringify({ ...JSON.parse(row.inputs_json), sessionPlanId: 'absent' });
    await expect(new BackupService(f.db).restore(JSON.stringify(document), true)).rejects.toThrow();
    expect(await read(f.db)).toBe(before);
  } finally { f.close(); }
});
