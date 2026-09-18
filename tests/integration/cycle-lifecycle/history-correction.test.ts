import { BackupService } from '../../../src/application/export/backup-service';
import { displayLoad } from '../../../src/application/workouts/load-entry';
import { DatabaseSync } from 'node:sqlite';
import { WorkoutService } from '../../../src/application/workouts/workout-service';
import { buildHistoryAnalytics } from '../../../src/domain/analytics/workout-history';
import { migrateDatabase, type MigrationDatabase } from '../../../src/data/migrations';
import type { RepositoryDatabase, SqlValue } from '../../../src/data/repositories';
function open(path: string) {
  const sqlite = new DatabaseSync(path);
  const db = { exec: (sql: string) => sqlite.exec(sql), runAsync: async (sql: string, ...params: SqlValue[]) => { const result = sqlite.prepare(sql).run(...params); return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) }; }, getFirstAsync: async (sql: string, ...params: SqlValue[]) => (sqlite.prepare(sql).get(...params) ?? null) as never, getAllAsync: async (sql: string, ...params: SqlValue[]) => sqlite.prepare(sql).all(...params) as never, withTransactionAsync: async (task: () => Promise<void>) => { sqlite.exec('BEGIN IMMEDIATE'); try { await task(); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } } as RepositoryDatabase & MigrationDatabase;
  return { sqlite, db };
}



async function fixture() {
 const {db,sqlite}=open(':memory:'); await migrateDatabase(db);
 const set={load:'60',reps:'8',rir:'2',technique:'Limpia',pain:0,notes:'original',completed:true,skipped:false,disposition:'COMPLETED'};
 const actual={id:'recorded',exercises:[{exerciseId:'press',originalExerciseId:'press',requirement:'EXACT',sets:[set,{...set},{...set,completed:false,skipped:true,disposition:'SKIPPED',skipReason:'Rest'}]}],safetyModifications:[]};
 await db.runAsync("INSERT INTO workout_session (id,schema_version,created_at,updated_at,status,prescribed_snapshot_json,actual_snapshot_json,completed_at) VALUES ('recorded',1,'now','now','COMPLETED',?,?,'2026-09-05')",JSON.stringify({dayIndex:1,exercises:[]}),JSON.stringify(actual));
 const service=new WorkoutService(db,undefined,()=> '2026-09-05T10:00:00Z');
 return {db,sqlite,service,input:{workoutId:'recorded',exerciseId:'press',setIndex:0,load:'55',reason:'Plate count'}};
}
it('projects successive corrections into rows and metrics without rewriting originals',async()=>{
 const f=await fixture(); const original=await f.db.getAllAsync('SELECT * FROM workout_session');
 await f.service.correctHistory(f.input);
 let history=await new WorkoutService(f.db).listHistory();
 expect(history[0]!.actual.exercises[0]!.sets.map(s=>s.load)).toEqual(['55','60','60']);
 expect(buildHistoryAnalytics(history)).toMatchObject({totalVolume:920,exercises:[{bestE1rm:74.5}]});
 await f.service.correctHistory({...f.input,setIndex:1,load:'50'});
 await f.service.correctHistory({...f.input,load:'52',reason:'Rechecked'});
 history=await new WorkoutService(f.db).listHistory();
 expect(history[0]!.actual.exercises[0]!.sets.map(s=>s.load)).toEqual(['52','50','60']);
 expect(buildHistoryAnalytics(history)).toMatchObject({totalVolume:816,exercises:[{bestE1rm:64.6}]});
 const events=await f.db.getAllAsync<{inputs_json:string}>('SELECT inputs_json FROM decision_log ORDER BY rowid');
 expect(events.map(e=>JSON.parse(e.inputs_json).before.load)).toEqual(['60','60','55']);
 expect(buildHistoryAnalytics(history).corrections).toHaveLength(3);
 expect(await f.db.getAllAsync('SELECT * FROM workout_session')).toEqual(original);f.sqlite.close();
});
it.each([{load:''},{load:'-1'},{load:'Infinity'},{load:'0x10'},{reason:' '},{setIndex:2},{setIndex:8},{exerciseId:'missing'},{workoutId:'missing'}])('rejects invalid correction %j without writes',async patch=>{
 const f=await fixture();await expect(f.service.correctHistory({...f.input,...patch})).rejects.toThrow();expect(await f.db.getAllAsync('SELECT * FROM decision_log')).toEqual([]);f.sqlite.close();
});
it('does not duplicate a repeated submission, and rolls back an audit failure',async()=>{
 const f=await fixture();await f.service.correctHistory(f.input);await f.service.correctHistory(f.input);
 expect(await f.db.getAllAsync('SELECT * FROM decision_log')).toHaveLength(1);
 f.sqlite.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON decision_log BEGIN SELECT RAISE(ABORT, 'audit failed'); END");
 await expect(f.service.correctHistory({...f.input,load:'50'})).rejects.toThrow('audit failed');
 expect((await f.service.listHistory())[0]!.actual.exercises[0]!.sets[0]!.load).toBe('55');f.sqlite.close();
});

it('distinguishes equal-time exercises and repeated identities, rejects stale edits and preserves replay identity',async()=>{
 const f=await fixture();
 const row=await f.db.getFirstAsync<{actual_snapshot_json:string}>('SELECT actual_snapshot_json FROM workout_session');
 const actual=JSON.parse(row!.actual_snapshot_json);actual.exercises.push({...structuredClone(actual.exercises[0]),exerciseId:'row'});
 await f.db.runAsync('UPDATE workout_session SET actual_snapshot_json=?',JSON.stringify(actual));
 await f.service.correctHistory({...f.input,exerciseIndex:0,requestId:'first'});
 await f.service.correctHistory({...f.input,exerciseId:'row',exerciseIndex:1,load:'40'});
 await f.service.correctHistory({...f.input,exerciseIndex:0,load:'50',expectedLoad:'55',requestId:'second'});
 await f.service.correctHistory({...f.input,exerciseIndex:0,requestId:'first'});
 await expect(f.service.correctHistory({...f.input,load:'45',expectedLoad:'55'})).rejects.toThrow('cambió');
 const history=await new WorkoutService(f.db).listHistory();expect(history[0]!.actual.exercises.map(e=>e.sets[0]!.load)).toEqual(['50','40']);
 expect(await f.db.getAllAsync('SELECT * FROM decision_log')).toHaveLength(3);
 actual.exercises.push(structuredClone(actual.exercises[0]));await f.db.runAsync('UPDATE workout_session SET actual_snapshot_json=?',JSON.stringify(actual));
 await expect(f.service.correctHistory({...f.input,load:'45'})).rejects.toThrow();
 await f.service.correctHistory({...f.input,exerciseIndex:2,load:'45'});
 expect((await f.service.listHistory())[0]!.actual.exercises.map(e=>e.sets[0]!.load)).toEqual(['50','40','45']);f.sqlite.close();
});

it('reads legacy audit events deterministically and keeps new sequence order across a backwards clock',async()=>{
 const f=await fixture();const row=await f.db.getFirstAsync<{actual_snapshot_json:string}>('SELECT actual_snapshot_json FROM workout_session');const before=JSON.parse(row!.actual_snapshot_json).exercises[0].sets[0];
 await f.db.runAsync("INSERT INTO decision_log (id,schema_version,created_at,updated_at,decision_type,policy_version,inputs_json,output_json,accepted) VALUES ('legacy-a',1,'2030','2030','HISTORY_CORRECTION','history-correction-v2.1',?,'{}',1)",JSON.stringify({...f.input,before,after:{...before,load:'58'}}));
 await f.service.correctHistory(f.input);
 await new WorkoutService(f.db,undefined,()=> '2000').correctHistory({...f.input,load:'50'});
 const history=await f.service.listHistory();expect(history[0]!.actual.exercises[0]!.sets[0]!.load).toBe('50');
 expect(history[0]!.corrections!.map(e=>e.beforeLoad)).toEqual(['60','58','55']);
 expect((await f.db.getFirstAsync<{actual_snapshot_json:string}>('SELECT actual_snapshot_json FROM workout_session'))!.actual_snapshot_json).toBe(row!.actual_snapshot_json);f.sqlite.close();
});

it('preserves unrelated sessions and rejects pending work inside a completed snapshot',async()=>{
 const f=await fixture();const row=await f.db.getFirstAsync<{actual_snapshot_json:string}>('SELECT actual_snapshot_json FROM workout_session');
 const actual=JSON.parse(row!.actual_snapshot_json);actual.exercises[0].sets[2]={...actual.exercises[0].sets[2],disposition:'PENDING',completed:false,skipped:false};
 await f.db.runAsync('UPDATE workout_session SET actual_snapshot_json=?',JSON.stringify(actual));
 await f.db.runAsync("INSERT INTO workout_session (id,schema_version,created_at,updated_at,status,prescribed_snapshot_json,actual_snapshot_json,completed_at) SELECT 'unrelated',schema_version,created_at,updated_at,status,prescribed_snapshot_json,actual_snapshot_json,completed_at FROM workout_session WHERE id='recorded'");
 const before=await f.service.listHistory();await expect(f.service.correctHistory({...f.input,setIndex:2})).rejects.toThrow();
 await f.service.correctHistory(f.input);const after=await f.service.listHistory();
 expect(after.find(s=>s.id==='unrelated')).toEqual(before.find(s=>s.id==='unrelated'));expect(after.find(s=>s.id==='recorded')!.actual.exercises[0]!.sets[2]).toEqual(actual.exercises[0].sets[2]);f.sqlite.close();
});

it('converts a pounds correction once and retains exact entered provenance through replay and reopen',async()=>{
 const f=await fixture(); const original=await f.db.getAllAsync('SELECT * FROM workout_session');
 const input={...f.input,load:'121,2542442',unit:'lb',expectedLoad:'60',requestId:'pounds-edit'} as Parameters<WorkoutService['correctHistory']>[0];
 await f.service.correctHistory(input);
 const history=await new WorkoutService(f.db).listHistory();
 expect(Number(history[0]!.actual.exercises[0]!.sets[0]!.load)).toBeCloseTo(55,7);
 const event=JSON.parse((await f.db.getFirstAsync<{inputs_json:string}>('SELECT inputs_json FROM decision_log'))!.inputs_json);
 expect(event.after).toMatchObject({load:'55',loadUnit:'kg',loadEntry:{value:'121,2542442',unit:'lb'}});
 await f.service.correctHistory(input);
 expect(await f.db.getAllAsync('SELECT * FROM decision_log')).toHaveLength(1);
 expect(await f.db.getAllAsync('SELECT * FROM workout_session')).toEqual(original);
 f.sqlite.close();
});

it('keeps canonical corrections stable across units and encrypted backup with ordered entry metadata',async()=>{
 const f=await fixture();const original=await f.db.getAllAsync('SELECT * FROM workout_session');
 await f.service.correctHistory({...f.input,unit:'lb',load:'121,2542442',requestId:'lb'});
 let history=await f.service.listHistory();
 expect(buildHistoryAnalytics(history).totalVolume).toBe(920);
 expect(buildHistoryAnalytics(history,1,'lb').corrections[0]!.detail).toContain('entrada 121,2542442 lb');
 const set=history[0]!.actual.exercises[0]!.sets[0]!;
 for(let i=0;i<50;i++){expect(displayLoad(set,'kg')).toBe('55');expect(displayLoad(set,'lb')).toBe('121,2542442');}
 await f.service.correctHistory({...f.input,load:'52',unit:'kg',expectedLoad:'55',requestId:'kg'});
 await expect(f.service.correctHistory({...f.input,load:'52',unit:'kg',expectedLoad:'60'})).rejects.toThrow('cambió');
 await expect(f.service.correctHistory({...f.input,load:'121,2542442',unit:'kg',requestId:'lb'})).rejects.toThrow('cambió');
 const audit=await f.db.getAllAsync('SELECT * FROM decision_log');
 const backup=new BackupService(f.db);const encrypted=await backup.exportEncrypted('synthetic-history-units');
 await backup.restorePortable(encrypted,{replaceConfirmed:true,secret:'synthetic-history-units'});
 history=await new WorkoutService(f.db).listHistory();
 expect(history[0]!.corrections!.map(e=>[e.beforeLoad,e.afterLoad,e.enteredLoad?.unit])).toEqual([['60','55','lb'],['55','52','kg']]);
 expect(await f.db.getAllAsync('SELECT * FROM decision_log')).toEqual(audit);
 expect(await f.db.getAllAsync('SELECT * FROM workout_session')).toEqual(original);f.sqlite.close();
});
it.each(['-1','Infinity','NaN','1e309','','0x10'])('rejects invalid pounds correction %s without changing data',async load=>{
 const f=await fixture();const original=await f.db.getAllAsync('SELECT * FROM workout_session');
 await expect(f.service.correctHistory({...f.input,load,unit:'lb'})).rejects.toThrow();
 expect(await f.db.getAllAsync('SELECT * FROM decision_log')).toEqual([]);
 expect(await f.db.getAllAsync('SELECT * FROM workout_session')).toEqual(original);f.sqlite.close();
});
it('preserves unknown and zero loads and does not infer mixed legacy event units from preferences',async()=>{
 const f=await fixture();const row=await f.db.getFirstAsync<{actual_snapshot_json:string}>('SELECT actual_snapshot_json FROM workout_session');
 const actual=JSON.parse(row!.actual_snapshot_json);actual.exercises[0].sets[0].load='';actual.exercises[0].sets[1].load='0';
 await f.db.runAsync('UPDATE workout_session SET actual_snapshot_json=?',JSON.stringify(actual));
 let history=await f.service.listHistory();
 expect(displayLoad(history[0]!.actual.exercises[0]!.sets[0]!,'lb')).toBe('');
 expect(displayLoad(history[0]!.actual.exercises[0]!.sets[1]!,'lb')).toBe('0');
 await f.db.runAsync("INSERT INTO decision_log (id,schema_version,created_at,updated_at,decision_type,policy_version,inputs_json,output_json,accepted) VALUES ('legacy-lb',1,'now','now','HISTORY_CORRECTION','legacy',?,'{}',1)",JSON.stringify({...f.input,after:{load:'100',loadUnit:'lb'}}));
 history=await f.service.listHistory();expect(history[0]!.actual.exercises[0]!.sets[0]!.load).toBe('45.359237');
 await f.service.correctHistory({...f.input,load:'50',unit:'kg'});
 expect((await f.service.listHistory())[0]!.corrections!.map(e=>e.beforeLoad)).toEqual(['','45.359237']);f.sqlite.close();
});
