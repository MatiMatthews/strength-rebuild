import { DatabaseSync } from 'node:sqlite';
import { migrateDatabase, type MigrationDatabase } from '../../../src/data/migrations';
import type { RepositoryDatabase, SqlValue } from '../../../src/data/repositories';
import { WorkoutService } from '../../../src/application/workouts/workout-service';
import { buildHistoryAnalytics } from '../../../src/domain/analytics/workout-history';

async function fixture() {
 const sqlite = new DatabaseSync(':memory:');
 const db = { exec: (sql:string)=>sqlite.exec(sql), runAsync:async(sql:string,...p:SqlValue[])=>sqlite.prepare(sql).run(...p), getFirstAsync:async(sql:string,...p:SqlValue[])=>(sqlite.prepare(sql).get(...p)??null), getAllAsync:async(sql:string,...p:SqlValue[])=>sqlite.prepare(sql).all(...p), withTransactionAsync:async(f:()=>Promise<void>)=>f() } as unknown as RepositoryDatabase & MigrationDatabase;
 await migrateDatabase(db);
 const set={load:'100',reps:'8',rir:'2',technique:'Limpia',pain:0,notes:'',completed:true,skipped:false,disposition:'COMPLETED'};
 const actual={id:'pounds',exercises:[{exerciseId:'barbell-bench-press',originalExerciseId:'barbell-bench-press',requirement:'EXACT',sets:[set]}],safetyModifications:[]};
 const prescribed={dayIndex:1,exercises:[{exerciseId:'barbell-bench-press',calculatedLoad:100,loadProvenance:'bench press reference 200 lb; training max reference; 50%; rounded to 5',target:{sets:1}}]};
 await db.runAsync("INSERT INTO workout_session (id,schema_version,created_at,updated_at,status,prescribed_snapshot_json,actual_snapshot_json,completed_at) VALUES ('pounds',1,'now','now','COMPLETED',?,?,'2026-09-05')",JSON.stringify(prescribed),JSON.stringify(actual));
 return {db,sqlite,prescribed,actual};
}
it('reopens an unchanged prescribed pound load as kilograms without rewriting source bytes', async () => {
 const {db,sqlite}=await fixture();
 const original=await db.getAllAsync('SELECT * FROM workout_session');
 for(let i=0;i<2;i++){
  await migrateDatabase(db);
  const history=await new WorkoutService(db).listHistory();
  expect(Number(history[0]!.actual.exercises[0]!.sets[0]!.load)).toBeCloseTo(45.359237,6);
  expect(buildHistoryAnalytics(history).totalVolume).toBeCloseTo(362.873896,6);
  expect(await db.getAllAsync('SELECT * FROM workout_session')).toEqual(original);
 }
 sqlite.close();
});

it('projects typed and legacy corrections in deterministic order, preserving event and original bytes',async()=>{
 const {db,sqlite}=await fixture();
 const original=await db.getAllAsync('SELECT * FROM workout_session');
 for(const [id,after] of [['a',{load:'80',loadUnit:'lb'}],['b',{load:35}]] as const){
  await db.runAsync("INSERT INTO decision_log (id,schema_version,created_at,updated_at,decision_type,policy_version,inputs_json,output_json,accepted) VALUES (?,1,'now','now','HISTORY_CORRECTION','history-correction-v2','{}','{}',1)",id);
  await db.runAsync('UPDATE decision_log SET inputs_json=? WHERE id=?',JSON.stringify({workoutId:'pounds',exerciseId:'barbell-bench-press',setIndex:0,reason:'Checked',after}),id);
 }
 const events=await db.getAllAsync('SELECT * FROM decision_log');
 for(let i=0;i<2;i++){
  const history=await new WorkoutService(db).listHistory();
  expect(history[0]!.actual.exercises[0]!.sets[0]!.load).toBe('35');
  expect(history[0]!.corrections!.map(c=>[c.beforeLoad,c.afterLoad])).toEqual([['45.359237','36.2873896'],['36.2873896','35']]);
  expect(await db.getAllAsync('SELECT * FROM workout_session')).toEqual(original);
  expect(await db.getAllAsync('SELECT * FROM decision_log')).toEqual(events);
 }
 await new WorkoutService(db).correctHistory({workoutId:'pounds',exerciseId:'barbell-bench-press',setIndex:0,load:'30',reason:'Checked kg'});
 expect((await new WorkoutService(db).listHistory())[0]!.actual.exercises[0]!.sets[0]!.load).toBe('30');
 expect(await db.getAllAsync('SELECT * FROM workout_session')).toEqual(original);sqlite.close();
});
it('reopens local active data without writing its normalized projection',async()=>{
 const {db,sqlite,prescribed}=await fixture();await db.runAsync("UPDATE workout_session SET status='IN_PROGRESS',completed_at=NULL");
 const before=await db.getAllAsync('SELECT * FROM workout_session');
 const service=new WorkoutService(db);const draft=await service.startOrResume(prescribed as never);
 expect(draft.exercises[0]!.sets[0]!.load).toBe('45.359237');
 await service.saveDraftSnapshot(draft);
 expect(await db.getAllAsync('SELECT * FROM workout_session')).toEqual(before);
 expect((await new WorkoutService(db).startOrResume(prescribed as never)).exercises[0]!.sets[0]!.load).toBe('45.359237');sqlite.close();
});
