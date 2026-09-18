import { DatabaseSync } from 'node:sqlite';
import { migrateDatabase, type MigrationDatabase } from '../../data/migrations';
import type { RepositoryDatabase, SqlValue } from '../../data/repositories';
import { BackupService } from './backup-service';
import { encryptBackupEnvelope } from './backup-envelope';
import { WorkoutService } from '../workouts/workout-service';

function database() {
 const sqlite = new DatabaseSync(':memory:');
 const db = { exec: (sql:string)=>sqlite.exec(sql), runAsync: async(sql:string,...params:SqlValue[])=>{const r=sqlite.prepare(sql).run(...params);return {changes:Number(r.changes),lastInsertRowId:Number(r.lastInsertRowid)};}, getFirstAsync:async(sql:string,...params:SqlValue[])=>(sqlite.prepare(sql).get(...params)??null) as never, getAllAsync:async(sql:string,...params:SqlValue[])=>sqlite.prepare(sql).all(...params) as never,withTransactionAsync:async(task:()=>Promise<void>)=>{sqlite.exec('BEGIN');try{await task();sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}}} as RepositoryDatabase & MigrationDatabase;
 return {db,sqlite};
}
const set={load:'100',reps:'8',rir:'2',technique:'Limpia',pain:0,notes:'',completed:true,skipped:false,disposition:'COMPLETED'};
async function fixture() {
 const source=database();await migrateDatabase(source.db);
 const original={id:'history',exercises:[{exerciseId:'barbell-bench-press',originalExerciseId:'barbell-bench-press',requirement:'EXACT',sets:[set,{...set,load:'80'},{...set,loadUnit:'kg'},{...set,load:'50',loadUnit:'lb'},{...set,load:''}]}],safetyModifications:[]};
 const prescribed={dayIndex:1,exercises:[{exerciseId:'barbell-bench-press',calculatedLoad:100,loadProvenance:'bench press reference 200 lb; training max reference; 50%; rounded to 5',target:{sets:5}}]};
 for(const [id,status] of [['history','COMPLETED'],['active','IN_PROGRESS']]) await source.db.runAsync('INSERT INTO workout_session(id,schema_version,created_at,updated_at,status,prescribed_snapshot_json,actual_snapshot_json) VALUES (?,1,?,?,?, ?,?)',id!,'a','a',status!,JSON.stringify(prescribed),JSON.stringify({...original,id}));
 for(const [id,before,after] of [['first','45.359237','40'],['second','40','35']])await source.db.runAsync("INSERT INTO decision_log(id,schema_version,created_at,updated_at,decision_type,policy_version,inputs_json,output_json,accepted) VALUES (?,1,'a','a','HISTORY_CORRECTION','history-correction-v2',?,'{}',1)",id!,JSON.stringify({workoutId:'history',exerciseId:'barbell-bench-press',exerciseIndex:0,setIndex:0,sequence:id==='first'?1:2,before:{load:before,loadUnit:'kg'},after:{load:after,loadUnit:'kg'},reason:'Checked plates'}));
 const raw=await new BackupService(source.db,()=> 'fixed').export();source.sqlite.close();return JSON.parse(raw);
}
const mutations: [string,(doc:Awaited<ReturnType<typeof fixture>>)=>void][]=[
 ['contradictory correction entry',d=>{const r=d.tables.decision_log[0];const v=JSON.parse(r.inputs_json);v.after.loadEntry={value:'100',unit:'lb'};r.inputs_json=JSON.stringify(v);}],
 ['negative correction',d=>{const r=d.tables.decision_log[0];const v=JSON.parse(r.inputs_json);v.after.load=-1;r.inputs_json=JSON.stringify(v);}],
 ['unknown unit',d=>{const r=d.tables.workout_session[0];const v=JSON.parse(r.actual_snapshot_json);v.exercises[0].sets[0].loadUnit='stone';r.actual_snapshot_json=JSON.stringify(v);}],
 ['missing workout',d=>{const r=d.tables.decision_log[0];const v=JSON.parse(r.inputs_json);v.workoutId='absent';r.inputs_json=JSON.stringify(v);}],
 ['wrong set',d=>{const r=d.tables.decision_log[0];const v=JSON.parse(r.inputs_json);v.setIndex=99;r.inputs_json=JSON.stringify(v);}],
 ['duplicate order',d=>{const r=d.tables.decision_log[1];const v=JSON.parse(r.inputs_json);v.sequence=1;r.inputs_json=JSON.stringify(v);}],
 ['malformed untyped before',d=>{const r=d.tables.decision_log[1];const v=JSON.parse(r.inputs_json);delete v.before.loadUnit;v.before.load=-1;r.inputs_json=JSON.stringify(v);}],
 ['contradictory before',d=>{const r=d.tables.decision_log[1];const v=JSON.parse(r.inputs_json);v.before.load='999';r.inputs_json=JSON.stringify(v);}],
];
it.each(mutations)('rejects authenticated %s before replacement and preview',async(_name,mutate)=>{
 const doc=await fixture();mutate(doc);const encrypted=await encryptBackupEnvelope(JSON.stringify(doc),'test secret');
 const target=database();await migrateDatabase(target.db);await target.db.runAsync("INSERT INTO app_setting(id,schema_version,created_at,updated_at,key,value_json) VALUES ('sentinel',1,'a','a','units','\"lb\"')");
 const service=new BackupService(target.db,()=> 'fixed');const before=await service.export();
 await expect(service.previewPortable(encrypted,'test secret')).rejects.toMatchObject({code:'corrupt'});
 await expect(service.restorePortable(encrypted,{secret:'test secret',replaceConfirmed:true})).rejects.toMatchObject({code:'corrupt'});
 expect(await service.export()).toBe(before);target.sqlite.close();
});
it('roundtrips mixed source units, ordered corrections and an active identity without rewriting originals',async()=>{
 const doc=await fixture();const target=database();await migrateDatabase(target.db);const service=new BackupService(target.db,()=> 'fixed');
 for(let round=0;round<2;round++){
 const raw=round?await service.export():JSON.stringify(doc);const encrypted=await encryptBackupEnvelope(raw,'test secret');
 await service.previewPortable(encrypted,'test secret');await service.restorePortable(encrypted,{secret:'test secret',replaceConfirmed:true});await migrateDatabase(target.db);
 expect(JSON.parse(await service.export()).tables).toEqual(doc.tables);
 const history=await new WorkoutService(target.db).listHistory();expect(history[0]!.actual.exercises[0]!.sets.map(s=>s.load)).toEqual(['35','80','100','22.6796185','']);
 expect(history[0]!.corrections!.map(c=>c.afterLoad)).toEqual(['40','35']);
 }
 target.sqlite.close();
});

it('preserves untyped legacy correction evidence and numeric legacy loads in events',async()=>{
 const doc=await fixture();
 for(const row of doc.tables.decision_log){const input=JSON.parse(row.inputs_json);delete input.sequence;delete input.before.loadUnit;delete input.after.loadUnit;input.after.load=Number(input.after.load);if(row.id==='first')input.before.load='100';row.inputs_json=JSON.stringify(input);}
 const target=database();await migrateDatabase(target.db);const service=new BackupService(target.db,()=> 'fixed');
 await service.restorePortable(JSON.stringify(doc),{legacyConfirmed:true,replaceConfirmed:true});
 expect(JSON.parse(await service.export()).tables).toEqual(doc.tables);
 expect((await new WorkoutService(target.db).listHistory())[0]!.actual.exercises[0]!.sets[0]!.load).toBe('35');target.sqlite.close();
});
