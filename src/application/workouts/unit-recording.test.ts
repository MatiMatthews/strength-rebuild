import { buildHistoryAnalytics } from '../../domain/analytics/workout-history';
import { enteredLoad, displayLoad } from './load-entry';
import { BackupService } from '../export/backup-service';
import { generatePrescription } from '../../domain/prescriptions/generator';
import { DatabaseSync } from 'node:sqlite';
import { migrateDatabase, type MigrationDatabase } from '../../data/migrations';
import type { RepositoryDatabase, SqlValue } from '../../data/repositories';
import { WorkoutService } from './workout-service';
import type { TodayData } from '../programs/program-service';

async function fixture() {
 const sqlite = new DatabaseSync(':memory:');
 const db = { exec: (sql:string)=>sqlite.exec(sql), runAsync: async(sql:string,...params:SqlValue[])=>{const r=sqlite.prepare(sql).run(...params);return {changes:Number(r.changes),lastInsertRowId:Number(r.lastInsertRowid)};}, getFirstAsync:async(sql:string,...params:SqlValue[])=>(sqlite.prepare(sql).get(...params)??null) as never, getAllAsync:async(sql:string,...params:SqlValue[])=>sqlite.prepare(sql).all(...params) as never,withTransactionAsync:async(task:()=>Promise<void>)=>{sqlite.exec('BEGIN');try{await task();sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}}} as RepositoryDatabase & MigrationDatabase;
 await migrateDatabase(db);
 const service=new WorkoutService(db);
 const session={dayIndex:1,exercises:[{exerciseId:'barbell-bench-press',requirement:'EXACT',qualityStops:[],target:{sets:2,reps:{min:8,max:8},rir:{min:2,max:3},loadPercent:null}}]} as TodayData['session'];
 const draft=await service.startOrResume(session);
 return {sqlite,db,service,session,draft};
}
it.each(['-1','NaN','Infinity','1e309','bad'])('rejects invalid load %s before any snapshot or relational write',async load=>{
 const {sqlite,service,draft}=await fixture();
 const before=sqlite.prepare('SELECT * FROM workout_session').all();
 draft.exercises[0]!.sets[0]!.load=load;
 await expect(service.saveDraftSnapshot(draft)).rejects.toThrow();
 await expect(service.save(draft)).rejects.toThrow();
 expect(()=>service.saveDraftSnapshotBeforeProcessStop(draft)).toThrow();
 await expect(service.complete(draft)).rejects.toThrow();
 expect(sqlite.prepare('SELECT * FROM workout_session').all()).toEqual(before);
 expect(sqlite.prepare('SELECT * FROM set_log').all()).toEqual([]);sqlite.close();
});

it('records equivalent physical loads, preserves entered decimals and survives encrypted restore and corrections',async()=>{
 const {sqlite,db,service,session,draft}=await fixture();
 Object.assign(draft.exercises[0]!.sets[0]!,enteredLoad('45,359237','kg'));
 Object.assign(draft.exercises[0]!.sets[1]!,enteredLoad('100','lb'));
 await service.save(draft);
 let reopened=await new WorkoutService(db).startOrResume(session);
 for(let i=0;i<10;i++) {
   expect(displayLoad(reopened.exercises[0]!.sets[1]!,'kg')).toBe('45.359237');
   expect(displayLoad(reopened.exercises[0]!.sets[1]!,'lb')).toBe('100');
   reopened=await new WorkoutService(db).startOrResume(session);
 }
 expect(reopened.exercises[0]!.sets.map(s=>s.load)).toEqual(['45.359237','45.359237']);
 expect(sqlite.prepare('SELECT load FROM set_log').all().map(r=>r.load)).toEqual([45.359237,45.359237]);
 reopened=await service.completeSetAndSave(reopened,0,0);reopened=await service.completeSetAndSave(reopened,0,1);
 await service.complete(reopened);
 expect(buildHistoryAnalytics(await service.listHistory()).totalVolume).toBeCloseTo(45.359237*16,8);
 const original=sqlite.prepare('SELECT actual_snapshot_json FROM workout_session').get();
 await service.correctHistory({workoutId:draft.id,exerciseId:'barbell-bench-press',setIndex:1,load:'40',reason:'Checked plates'});
 expect((await service.listHistory())[0]!.actual.exercises[0]!.sets.map(s=>s.load)).toEqual(['45.359237','40']);
 expect(buildHistoryAnalytics(await service.listHistory()).totalVolume).toBeCloseTo((45.359237+40)*8,8);
 const backup=new BackupService(db);const encrypted=await backup.exportEncrypted('synthetic-passphrase');
 const before=await backup.export();
 const preview=await backup.previewPortable(encrypted,'synthetic-passphrase');
 await backup.restorePortable(encrypted,{replaceConfirmed:true,secret:'synthetic-passphrase'});
 expect(preview).toBeDefined();
 expect(JSON.parse(await backup.export()).tables).toEqual(JSON.parse(before).tables);
 expect(sqlite.prepare('SELECT actual_snapshot_json FROM workout_session').get()).toEqual(original);
 expect((await new WorkoutService(db).listHistory())[0]!.actual.exercises[0]!.sets[1]!.load).toBe('40');sqlite.close();
});
it('keeps incomplete decimal text, blank and zero distinct without converting display back into storage',()=>{
 const base={load:'',reps:'5',rir:'3',technique:'Limpia',pain:0,notes:'',completed:false,skipped:false,disposition:'PENDING'} as const;
 for(const value of ['','0','12,','12,5','0,125']) {
  const set={...base,...enteredLoad(value,'lb')};
  expect(displayLoad(set,'lb')).toBe(value);const original=JSON.stringify(set);
  for(let i=0;i<50;i++){displayLoad(set,'kg');displayLoad(set,'lb');}
  expect(JSON.stringify(set)).toBe(original);
 }
});
it('stores explicit unit and reference evidence on newly generated loads',()=>{
 const plan=generatePrescription({id:'units',type:'strength',weeks:1,profile:{units:'lb',benchPressReference:200,backSquatReference:200,deadliftReference:0,strictPullUpCapacity:0,availableIncrement:5}});
 const press=plan.weeks[0]!.sessions[0]!.exercises.find(e=>e.exerciseId==='barbell-bench-press')!;
 expect(press).toMatchObject({calculatedLoad:160,loadUnit:'lb',loadSource:{kind:'strength-reference',value:200,unit:'lb',percent:80,increment:5}});
});
it('rejects contradictory entered provenance and leaves the durable draft unchanged',async()=>{
 const {sqlite,service,draft}=await fixture();const before=sqlite.prepare('SELECT * FROM workout_session').all();
 Object.assign(draft.exercises[0]!.sets[0]!,enteredLoad('100','lb'),{load:'100'});
 await expect(service.saveDraftSnapshot(draft)).rejects.toThrow('no coinciden');
 expect(sqlite.prepare('SELECT * FROM workout_session').all()).toEqual(before);sqlite.close();
});

it('starts a prescribed pounds load in canonical kg and displays it in the selected input unit',async()=>{
 const {sqlite,db}=await fixture();
 sqlite.exec("DELETE FROM workout_session");
 const plan=generatePrescription({id:'unit-prescription',type:'strength',weeks:1,profile:{units:'lb',benchPressReference:200,backSquatReference:200,deadliftReference:0,strictPullUpCapacity:0,availableIncrement:5}});
 const service=new WorkoutService(db);const draft=await service.startOrResume(plan.weeks[0]!.sessions[0]!);
 const press=draft.exercises.find(e=>e.exerciseId==='barbell-bench-press')!;
 expect(press.sets[0]).toMatchObject({load:'72.5747792',loadUnit:'kg'});
 expect(displayLoad(press.sets[0]!,'lb')).toBe('160');
 expect(JSON.parse(String(sqlite.prepare('SELECT prescribed_snapshot_json FROM workout_session').get()!.prescribed_snapshot_json)).exercises.find((e:{exerciseId:string})=>e.exerciseId==='barbell-bench-press').loadUnit).toBe('lb');sqlite.close();
});
