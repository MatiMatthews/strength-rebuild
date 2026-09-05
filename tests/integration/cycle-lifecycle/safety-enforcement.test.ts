import { DatabaseSync } from 'node:sqlite';
import { ProgramService } from '../../../src/application/programs/program-service';
import { WorkoutService, type WorkoutDraft } from '../../../src/application/workouts/workout-service';
import { migrateDatabase, type MigrationDatabase } from '../../../src/data/migrations';
import type { RepositoryDatabase, SqlValue } from '../../../src/data/repositories';

async function fixture(sync = true) {
  const sqlite = new DatabaseSync(':memory:');
  const run = (sql: string, ...params: SqlValue[]) => { const result = sqlite.prepare(sql).run(...params); return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) }; };
  const db: RepositoryDatabase & MigrationDatabase = { exec: async sql => { sqlite.exec(sql); }, ...(sync ? { runSync: run } : {}), runAsync: async (sql, ...params) => run(sql, ...params), getFirstAsync: async (sql: string, ...params: SqlValue[]) => (sqlite.prepare(sql).get(...params) ?? null) as never, getAllAsync: async (sql: string, ...params: SqlValue[]) => sqlite.prepare(sql).all(...params) as never, withTransactionAsync: async task => { sqlite.exec('BEGIN IMMEDIATE'); try { await task(); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } };
  await migrateDatabase(db);
  const programs = new ProgramService(db); await programs.createPlan([{id:'personal',type:'hypertrophy',weeks:2}]); await programs.activateCycle('personal');
  const today = (await programs.getToday())!; const service = new WorkoutService(db);
  await service.applyReadiness(today, { pain: 0, painTrend: 'stable', region: 'other', reproducedByBraceCoughOrSneeze: false });
  let draft = await service.startOrResume(today);
  draft = service.recordSet(draft, 0, 0, { notes: 'preserve my edit', load: '0' });
  draft = await service.completeSetAndSave(draft, 0, 0);
  const read = () => Object.fromEntries(['workout_session','set_log','session_plan','app_setting','active_restriction','decision_log'].map(table => [table, sqlite.prepare(`SELECT * FROM ${table}`).all()]));
  const restrict = (kind: string, active = 1, details = '{}') => run('INSERT INTO active_restriction (id,schema_version,created_at,updated_at,kind,details_json,active) VALUES (?,1,\'now\',\'now\',?,?,?)',kind,kind,details,active);
  return {sqlite,db,programs,today,service,draft,read,restrict};
}

it.each([true,false])('rejects a cached safe draft at every persistence boundary (sync=%s)', async sync => {
  const f = await fixture(sync);
  await f.service.applyReadiness(f.today, {pain:3,painTrend:'stable',persistsAfterModification:true,region:'lumbar',reproducedByBraceCoughOrSneeze:false});
  const before = f.read();
  const fresh = new WorkoutService(f.db);
  await expect(fresh.startOrResume(f.today)).rejects.toThrow('bloquea');
  await expect(fresh.completeSetAndSave(f.draft,0,1)).rejects.toThrow('cambió');
  const unsafe = fresh.completeSet(f.draft,0,1);
  await expect(fresh.saveDraftSnapshot(unsafe)).rejects.toThrow('cambió');
  if (sync) expect(() => fresh.saveDraftSnapshotBeforeProcessStop(unsafe)).toThrow('cambió');
  else expect(fresh.saveDraftSnapshotBeforeProcessStop(unsafe)).toBe(false);
  await expect(fresh.save(unsafe)).rejects.toThrow('cambió');
  const completed = unsafe.exercises.reduce((d,e,ei)=>e.sets.reduce((next,_s,si)=>fresh.completeSet(next,ei,si),d),unsafe);
  await expect(fresh.complete(completed)).rejects.toThrow('cambió');
  expect(f.read()).toEqual(before);
  f.sqlite.close();
});

it('preserves completed work and edits against stale, empty, failed and repeated snapshots', async () => {
  const f = await fixture(); const stale = JSON.parse(JSON.stringify(f.draft)) as WorkoutDraft;
  const next = f.service.recordSet(f.draft,0,1,{notes:'newer edit'});
  await f.service.saveDraftSnapshot(next); const before = f.read();
  await expect(new WorkoutService(f.db).saveDraftSnapshot(stale)).rejects.toThrow('cambió');
  await expect(f.service.saveDraftSnapshot({...next,exercises:[]})).rejects.toThrow('vacío');
  expect(f.read()).toEqual(before);
  f.sqlite.exec("CREATE TRIGGER fail_snapshot BEFORE UPDATE ON workout_session BEGIN SELECT RAISE(ABORT, 'failed write'); END");
  const revision = next.revision;
  await expect(f.service.save(next)).rejects.toThrow('failed write');
  expect(next.revision).toBe(revision); expect(f.read()).toEqual(before);
  f.sqlite.exec('DROP TRIGGER fail_snapshot');
  f.sqlite.exec("CREATE TRIGGER fail_log BEFORE INSERT ON set_log BEGIN SELECT RAISE(ABORT, 'log failed'); END");
  await expect(f.service.save(next)).rejects.toThrow('log failed');
  expect(next.revision).toBe(revision); expect(f.read()).toEqual(before);
  f.sqlite.exec('DROP TRIGGER fail_log');
  await f.service.save(next);
  await f.service.saveDraftSnapshot(next);
  const reopened = await new WorkoutService(f.db).startOrResume(f.today);
  expect(reopened.exercises).toEqual(next.exercises);
  expect(reopened.exercises[0]!.sets[0]).toMatchObject({notes:'preserve my edit',completed:true});
  expect(reopened.exercises[0]!.sets[1]!.notes).toBe('newer edit');
  f.sqlite.close();
});

it('revalidates new restrictions and never guesses legacy details or clearance', async () => {
  const f = await fixture(); f.restrict('legacy'); const before = f.read();
  await expect(f.service.startOrResume(f.today)).rejects.toThrow('requiere revisión');
  await expect(f.service.completeSetAndSave(f.draft,0,1)).rejects.toThrow('cambió');
  expect(() => f.service.saveDraftSnapshotBeforeProcessStop(f.draft)).toThrow('cambió');
  expect(f.read()).toEqual(before);
  f.sqlite.exec("UPDATE active_restriction SET active=0");
  expect((await f.programs.getTodayContext()).restrictionActive).toBe(false);
  await expect(f.service.startOrResume(f.today)).resolves.toMatchObject({id:f.draft.id});
  f.restrict('lumbar',1,'{"unrecognized":true}');
  await expect(f.service.startOrResume(f.today)).rejects.toThrow('requiere revisión');
  f.sqlite.close();
});

it('permits supported low-demand work and rejects power or unverifiable loading under abdominal policy', async () => {
  const f = await fixture();
  f.restrict('abdominal');
  // A synthetic persisted prescription limited to established unloaded catalogue work.
  const allowed = {...f.draft,exercises:[f.draft.exercises[0]!]};
  f.sqlite.prepare('UPDATE workout_session SET actual_snapshot_json=?').run(JSON.stringify(allowed));
  const resumed = await f.service.startOrResume(f.today);
  expect(resumed.restrictionSnapshot).toContain('abdominal');
  const completed = await f.service.completeSetAndSave(resumed,0,1);
  const before = f.read();
  await expect(f.service.saveDraftSnapshot(f.service.recordSet(completed,0,1,{load:'100'}))).rejects.toThrow('requiere revisión');
  await expect(f.service.saveDraftSnapshot(f.service.replaceExercise(completed,0,'low-volume-jump','boredom'))).rejects.toThrow('requiere revisión');
  expect(f.read()).toEqual(before);
  await f.service.save(completed);
  expect((await new WorkoutService(f.db).startOrResume(f.today)).exercises[0]!.sets[1]!.completed).toBe(true);
  expect(f.sqlite.prepare('SELECT active FROM active_restriction').get()!.active).toBe(1);
  f.sqlite.close();
});

it('rechecks canonical restrictions in the atomic SQL write even after earlier validation', async () => {
  const f = await fixture(false); const original = f.db.runAsync;
  let injected = false;
  f.db.runAsync = async (sql,...params) => {
    if (!injected && sql.startsWith('UPDATE workout_session')) { injected = true; f.restrict('legacy'); }
    return original(sql,...params);
  };
  const originalWorkout = f.read().workout_session;
  await expect(f.service.completeSetAndSave(f.draft,0,1)).rejects.toThrow('cambió');
  expect(f.read().workout_session).toEqual(originalWorkout);
  f.sqlite.close();
});


it('revalidates a permitted preparation change without losing the existing draft', async () => {
  const f = await fixture();
  await f.service.applyReadiness(f.today,{pain:1,painTrend:'stable',region:'lumbar',reproducedByBraceCoughOrSneeze:false});
  await expect(f.service.saveDraftSnapshot(f.draft)).rejects.toThrow('cambió');
  const reopened = await new WorkoutService(f.db).startOrResume(f.today);
  expect(reopened.exercises).toEqual(f.draft.exercises);
  expect(reopened.readiness!.input!.pain).toBe(1);
  await f.service.saveDraftSnapshot(reopened);
  expect((await new WorkoutService(f.db).startOrResume(f.today)).readiness).toEqual(reopened.readiness);
  f.sqlite.close();
});


it('does not reconstruct an empty legacy snapshot over recorded work', async () => {
  const f = await fixture(); await f.service.save(f.draft);
  f.sqlite.exec('UPDATE workout_session SET actual_snapshot_json=NULL');
  const before=f.read();
  await expect(new WorkoutService(f.db).startOrResume(f.today)).rejects.toThrow('copia verificable');
  expect(f.read()).toEqual(before);
  f.sqlite.close();
});

it('rejects a stale Today session at entry before creating or resuming work', async () => {
  const f = await fixture();
  f.sqlite.prepare("UPDATE session_plan SET status='COMPLETED' WHERE id=?").run(f.today.sessionPlanId!);
  const before = f.read();
  await expect(new WorkoutService(f.db).startOrResume(f.today)).rejects.toThrow('sesión cambió');
  expect(f.read()).toEqual(before);
  f.sqlite.close();
});
