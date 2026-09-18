import { DatabaseSync } from 'node:sqlite';

import { ProgramService } from '../../../src/application/programs/program-service';
import { migrateDatabase, type MigrationDatabase } from '../../../src/data/migrations';
import { type RepositoryDatabase, type SqlValue } from '../../../src/data/repositories';

function open(path: string) {
  const sqlite = new DatabaseSync(path);
  const db = { exec: (sql: string) => sqlite.exec(sql), runAsync: async (sql: string, ...params: SqlValue[]) => { const result = sqlite.prepare(sql).run(...params); return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) }; }, getFirstAsync: async (sql: string, ...params: SqlValue[]) => (sqlite.prepare(sql).get(...params) ?? null) as never, getAllAsync: async (sql: string, ...params: SqlValue[]) => sqlite.prepare(sql).all(...params) as never, withTransactionAsync: async (task: () => Promise<void>) => { sqlite.exec('BEGIN IMMEDIATE'); try { await task(); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } } as RepositoryDatabase & MigrationDatabase;
  return { sqlite, db };
}

async function fixture() {
  const {db,sqlite} = open(':memory:');
  await migrateDatabase(db);
  const programs = new ProgramService(db);
  await programs.createPlan([{id:'a',type:'hypertrophy',weeks:1},{id:'b',type:'strength',weeks:1}]);
  await programs.activateCycle('a');
  await db.runAsync("UPDATE training_week SET status='COMPLETED' WHERE cycle_id='a'");
  await db.runAsync("UPDATE session_plan SET status='COMPLETED' WHERE training_week_id='a-week-1'");
  return {db,sqlite,programs};
}

describe('explicit atomic cycle confirmation', () => {
  it('keeps optional session recommendations optional at the cycle boundary', async () => {
    const {db,sqlite,programs}=await fixture();
    await db.runAsync("INSERT INTO progression_proposal (id,schema_version,created_at,updated_at,cycle_id,policy_version,inputs_json,output_json) VALUES ('optional',1,'now','now','a','progression-v1','{}','{}')");
    const preview=await programs.prepareCycleCompletion('a');
    expect(preview.reason).toBeNull();
    await programs.confirmCycleCompletion(preview);
    expect(await programs.getActiveCycleId()).toBe('a--to--b');
    expect(sqlite.prepare("SELECT decision FROM progression_proposal WHERE id='optional'").get()).toEqual({decision:null});
    sqlite.close();
  });
  it('is read only until confirmed, audits once and preserves originals through reopen', async () => {
    const {db,sqlite,programs}=await fixture();
    const originals=sqlite.prepare('SELECT * FROM session_plan').all();
    const preview=await programs.prepareCycleCompletion('a');
    expect(preview.reason).toBeNull();
    expect(preview.nextId).toBe('a--to--b');
    expect(await programs.getActiveCycleId()).toBe('a');
    expect(await new ProgramService(db).prepareCycleCompletion('a')).toEqual(preview);
    await programs.confirmCycleCompletion(preview);
    await new ProgramService(db).confirmCycleCompletion(preview);
    expect(await programs.getActiveCycleId()).toBe('a--to--b');
    expect(sqlite.prepare("SELECT * FROM decision_log WHERE policy_version='cycle-completion-v1'").all()).toHaveLength(1);
    expect(sqlite.prepare('SELECT * FROM session_plan').all()).toEqual(originals);
    expect((await programs.prepareCycleCompletion('a--to--b')).reason).toContain('descarga');
    sqlite.close();
  });
  it.each(['week','session','restriction','pending','next','template'])('rejects stale %s and preserves the current cycle', async kind => {
    const {db,sqlite,programs}=await fixture();
    const preview=await programs.prepareCycleCompletion('a');
    if(kind==='week') await db.runAsync("UPDATE training_week SET status='REVIEW' WHERE cycle_id='a'");
    if(kind==='session') await db.runAsync("UPDATE session_plan SET status='PLANNED' WHERE training_week_id='a-week-1'");
    if(kind==='restriction') await db.runAsync("INSERT INTO active_restriction (id,schema_version,created_at,updated_at,kind,details_json,active) VALUES ('safety',1,'now','now','pain','{}',1)");
    if(kind==='pending') await db.runAsync("INSERT INTO progression_proposal (id,schema_version,created_at,updated_at,cycle_id,policy_version,inputs_json,output_json) VALUES ('pending',1,'now','now','a','weekly-review-v1','{}','{}')");
    if(kind==='next') await db.runAsync("UPDATE cycle SET status='PAUSED' WHERE id='a--to--b'");
    if(kind==='template') await db.runAsync("UPDATE cycle SET program_template_id=NULL WHERE id='a--to--b'");
    await expect(programs.confirmCycleCompletion(preview)).rejects.toThrow();
    expect(await programs.getActiveCycleId()).toBe('a');
    expect(sqlite.prepare("SELECT * FROM decision_log WHERE policy_version='cycle-completion-v1'").all()).toHaveLength(0);
    sqlite.close();
  });
  it('rolls back both cycle writes if auditing fails and allows the same preview to retry',async()=>{
    const {sqlite,programs}=await fixture();
    const preview=await programs.prepareCycleCompletion('a');
    sqlite.exec("CREATE TRIGGER fail_completion BEFORE INSERT ON decision_log BEGIN SELECT RAISE(ABORT,'synthetic write failure'); END");
    await expect(programs.confirmCycleCompletion(preview)).rejects.toThrow('synthetic write failure');
    expect(await programs.getActiveCycleId()).toBe('a');
    expect(sqlite.prepare("SELECT status FROM cycle WHERE id='a--to--b'").get()).toEqual({status:'READY'});
    sqlite.exec('DROP TRIGGER fail_completion');
    await programs.confirmCycleCompletion(preview);
    expect(await programs.getActiveCycleId()).toBe('a--to--b');
    sqlite.close();
  });
  it('rejects an arbitrary adjacent loading cycle and simultaneous confirmation from another service',async()=>{
    const {db,sqlite,programs}=await fixture();
    await expect(programs.completeCycleAndActivateNext('a','b')).rejects.toThrow();
    const preview=await programs.prepareCycleCompletion('a');
    const outcomes=await Promise.allSettled([programs.confirmCycleCompletion(preview),new ProgramService(db).confirmCycleCompletion(preview)]);
    expect(outcomes.filter(result=>result.status==='fulfilled')).toHaveLength(1);
    expect(sqlite.prepare("SELECT * FROM decision_log WHERE policy_version='cycle-completion-v1'").all()).toHaveLength(1);
    sqlite.close();
  });
  it('rejects changed prescriptions even when lifecycle remains eligible',async()=>{
    const {db,sqlite,programs}=await fixture();
    const preview=await programs.prepareCycleCompletion('a');
    await db.runAsync("UPDATE session_plan SET snapshot_json=snapshot_json || ' ' WHERE training_week_id='a--to--b-week-1'");
    await expect(programs.confirmCycleCompletion(preview)).rejects.toThrow('cambió');
    expect(await programs.getActiveCycleId()).toBe('a');
    sqlite.close();
  });
});
