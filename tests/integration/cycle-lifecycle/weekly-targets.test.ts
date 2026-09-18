import { BackupService } from '../../../src/application/export/backup-service';
import { DatabaseSync } from 'node:sqlite';
import { migrateDatabase, type MigrationDatabase } from '../../../src/data/migrations';
import type { RepositoryDatabase, SqlValue } from '../../../src/data/repositories';
import { ProgramService } from '../../../src/application/programs/program-service';
import { WorkoutService } from '../../../src/application/workouts/workout-service';
import { WeeklyReviewService } from '../../../src/application/progression/weekly-review';

async function fixture({reps=6,max=8,requirement='PATTERN'}: {reps?:number;max?:number;requirement?:string} = {}) {
  const sqlite = new DatabaseSync(':memory:');
  const db = { exec: (s: string) => sqlite.exec(s), runAsync: async (s: string, ...p: SqlValue[]) => { const r = sqlite.prepare(s).run(...p); return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) }; }, getFirstAsync: async (s: string, ...p: SqlValue[]) => (sqlite.prepare(s).get(...p) ?? null) as never, getAllAsync: async (s: string, ...p: SqlValue[]) => sqlite.prepare(s).all(...p) as never, withTransactionAsync: async (task: () => Promise<void>) => { sqlite.exec('BEGIN IMMEDIATE'); try { await task(); sqlite.exec('COMMIT'); } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } } as RepositoryDatabase & MigrationDatabase;
  await migrateDatabase(db);
  const programs = new ProgramService(db);
  await programs.createPlan([{ id: 'targets', type: 'hypertrophy', weeks: 2 }]);
  // Accelerate only the synthetic prescription; finish all work through the real service.
  for (const row of await db.getAllAsync<{id: string; day_index: number}>('SELECT id, day_index FROM session_plan')) {
    const exercises = ['barbell-bench-press', 'seated-leg-curl'].map(exerciseId => ({ exerciseId, requirement, calculatedLoad: 40, target: { sets: 1, reps: { min: reps, max }, rir: { min: 2, max: 3 }, loadPercent: null }, qualityStops: [] }));
    await db.runAsync('UPDATE session_plan SET snapshot_json = ? WHERE id = ?', JSON.stringify({dayIndex: row.day_index, exercises}), row.id);
  }
  await programs.activateCycle('targets');
  let id = 0;
  const workouts = new WorkoutService(db, undefined, undefined, () => `work-${++id}`);
  for (let day = 0; day < 3; day++) {
    const today = (await programs.getToday())!;
    await workouts.applyReadiness(today, { pain: 0, painTrend: 'stable', region: 'other', reproducedByBraceCoughOrSneeze: false });
    let draft = await workouts.startOrResume(today);
    for (let e = 0; e < draft.exercises.length; e++) {
      draft = workouts.recordSet(draft, e, 0, { load: '40', reps: String(reps), rir: '3', pain: 0, technique: 'Limpia' });
      draft = workouts.completeSet(draft, e, 0);
    }
    await workouts.complete(draft);
  }
  return {sqlite, db, programs, workouts, reviews: new WeeklyReviewService(db)};
}

it('applies every verified exercise to the next week without rewriting originals', async () => {
  const {sqlite, db, programs, reviews, workouts} = await fixture();
  const originals = await db.getAllAsync('SELECT * FROM session_plan');
  const history = await db.getAllAsync('SELECT * FROM workout_session');
  const proposal = await reviews.propose({cycleId:'targets', weekIndex:1, nextWeekIndex:2, outcome:'successful'});
  await reviews.decide(proposal.id, 'ACCEPTED');
  const next = (await programs.getToday())!;
  expect(next.weekIndex).toBe(2);
  expect(next.session.exercises.map(e => e.target.reps.min)).toEqual([7,7]);
  expect(await db.getAllAsync('SELECT * FROM session_plan')).toEqual(originals);
  expect(await db.getAllAsync('SELECT * FROM workout_session')).toEqual(history);
  await workouts.applyReadiness(next, {pain:0,painTrend:'stable',region:'other',reproducedByBraceCoughOrSneeze:false});
  expect((await workouts.startOrResume(next)).exercises.map(e=>e.sets[0]!.reps)).toEqual(['7','7']);
  sqlite.close();
});

it.each(['KEPT','REJECTED'] as const)('closes %s once with unchanged prescriptions across reopen',async choice=>{
 const {db,sqlite,reviews,programs}=await fixture();
 const before=await db.getAllAsync('SELECT * FROM session_plan');
 const p=await reviews.propose({cycleId:'targets',weekIndex:1,nextWeekIndex:2,outcome:'successful'});
 expect(p.targets?.targets.filter(t=>t.after.target.reps.min===7)).toHaveLength(6);
 expect(await new WeeklyReviewService(db).load('targets',1)).toEqual(p);
 await reviews.decide(p.id,choice);
 await expect(reviews.decide(p.id,choice)).rejects.toThrow();
 expect((await programs.getToday())!.session.exercises[0]!.target.reps.min).toBe(6);
 expect(await db.getAllAsync('SELECT * FROM session_plan')).toEqual(before);sqlite.close();
});

it.each(['correction','settings','started','safety'] as const)('rejects stale %s without partial decisions and still permits keeping the plan',async change=>{
 const {db,sqlite,reviews,workouts}=await fixture();
 const p=await reviews.propose({cycleId:'targets',weekIndex:1,nextWeekIndex:2,outcome:'successful'});
 if(change==='correction') await workouts.correctHistory({workoutId:'work-3',exerciseId:'barbell-bench-press',setIndex:0,load:'20',reason:'Verified the actual load'});
 if(change==='settings') await db.runAsync("INSERT INTO app_setting (id,schema_version,created_at,updated_at,key,value_json) VALUES ('settings',1,'now','now','training-settings',?)",JSON.stringify({units:'kg',increments:[5],restrictions:[]}));
 if(change==='started') await db.runAsync("UPDATE session_plan SET status='IN_PROGRESS' WHERE id=(SELECT s.id FROM session_plan s JOIN training_week w ON w.id=s.training_week_id WHERE w.week_index=2 LIMIT 1)");
 if(change==='safety') await db.runAsync("INSERT INTO active_restriction (id,schema_version,created_at,updated_at,kind,details_json,active) VALUES ('restriction',1,'now','now','abdominal','{}',1)");
 const before=await db.getAllAsync('SELECT * FROM session_plan');
 await expect(reviews.decide(p.id,'ACCEPTED')).rejects.toThrow('cambió');
 expect(await db.getAllAsync('SELECT * FROM session_plan')).toEqual(before);
 expect((await reviews.load('targets',1))?.id).toBe(p.id);
 expect(await db.getAllAsync("SELECT * FROM decision_log WHERE decision_type='WEEKLY_TARGETS'")).toEqual([]);
 await reviews.decide(p.id,'KEPT');sqlite.close();
});

it.each(['failed','unknown','corrected','restricted','power','missing'] as const)('self-reported success cannot override %s evidence',async condition=>{
 const {db,sqlite,reviews,workouts,programs}=await fixture();
 if(condition==='corrected') await workouts.correctHistory({workoutId:'work-3',exerciseId:'barbell-bench-press',setIndex:0,load:'20',reason:'Verified actual load'});
 if(condition==='failed') {
  const row=await db.getFirstAsync<{actual_snapshot_json:string}>("SELECT actual_snapshot_json FROM workout_session WHERE id='work-2'");
  const actual=JSON.parse(row!.actual_snapshot_json); actual.exercises[0].sets[0].reps='1';
  await db.runAsync("UPDATE workout_session SET actual_snapshot_json=? WHERE id='work-2'",JSON.stringify(actual));
 }
 if(condition==='missing') await db.runAsync("DELETE FROM workout_session WHERE id='work-2'");
 if(condition==='restricted') await db.runAsync("INSERT INTO active_restriction (id,schema_version,created_at,updated_at,kind,details_json,active) VALUES ('restriction',1,'now','now','abdominal','{}',1)");
 if(condition==='unknown'||condition==='power') for(const row of await db.getAllAsync<{id:string;snapshot_json:string}>('SELECT * FROM session_plan')) {
  const s=JSON.parse(row.snapshot_json);if(condition==='unknown') delete s.exercises[0].calculatedLoad;else s.exercises[0].power=true;
  await db.runAsync('UPDATE session_plan SET snapshot_json=? WHERE id=?',JSON.stringify(s),row.id);
 }
 const p=await reviews.propose({cycleId:'targets',weekIndex:1,nextWeekIndex:2,outcome:'successful'});
 expect(p.targets?.targets.filter(t=>t.exerciseId==='barbell-bench-press').every(t=>JSON.stringify(t.before)===JSON.stringify(t.after))).toBe(true);
 await reviews.decide(p.id,'ACCEPTED');
 expect((await programs.getToday())!.session.exercises[0]!.target.reps.min).toBe(6);sqlite.close();
});

it('rolls back all target application and closure after an audit error; retries once, rejects duplicate taps',async()=>{
 const {db,sqlite,reviews,programs}=await fixture();
 const p=await reviews.propose({cycleId:'targets',weekIndex:1,nextWeekIndex:2,outcome:'successful'});
 sqlite.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON decision_log WHEN NEW.decision_type='WEEKLY_PROGRESSION' BEGIN SELECT RAISE(ABORT,'audit failed'); END");
 await expect(reviews.decide(p.id,'ACCEPTED')).rejects.toThrow('audit failed');
 expect(await db.getAllAsync("SELECT * FROM decision_log WHERE decision_type='WEEKLY_TARGETS'")).toEqual([]);
 expect((await reviews.load('targets',1))?.id).toBe(p.id);
 sqlite.exec('DROP TRIGGER fail_audit');
 expect((await Promise.allSettled([reviews.decide(p.id,'ACCEPTED'),reviews.decide(p.id,'ACCEPTED')])).map(r=>r.status)).toEqual(['fulfilled','rejected']);
 expect((await programs.getToday())!.session.exercises[0]!.target.reps.min).toBe(7);sqlite.close();
});

it('never promotes a historical weekly output into a target authorization',async()=>{
 const {db,sqlite,reviews,programs}=await fixture();
 const p=await reviews.propose({cycleId:'targets',weekIndex:1,nextWeekIndex:2,outcome:'successful'});
 await db.runAsync('UPDATE progression_proposal SET output_json=? WHERE id=?',JSON.stringify({nextTarget:{load:999,reps:99}}),p.id);
 expect((await reviews.load('targets',1))?.targets).toBeUndefined();
 await reviews.decide(p.id,'ACCEPTED');
 expect((await programs.getToday())!.session.exercises[0]!.target.reps.min).toBe(6);sqlite.close();
});

it('keeps repaired cohorts unavailable and avoids duplicating session progression',async()=>{
 const {db,sqlite,reviews,programs}=await fixture();
 const s=await db.getFirstAsync<{id:string;snapshot_json:string}>("SELECT s.* FROM session_plan s JOIN training_week w ON w.id=s.training_week_id WHERE w.week_index=2 ORDER BY s.day_index LIMIT 1");
 await db.runAsync("INSERT INTO decision_log (id,schema_version,created_at,updated_at,decision_type,policy_version,inputs_json,output_json,accepted) VALUES ('session',1,'now','now','SESSION_PROGRESSION','session-review-v1',?,'{}',1)",JSON.stringify({target:{id:s!.id}}));
 const p=await reviews.propose({cycleId:'targets',weekIndex:1,nextWeekIndex:2,outcome:'successful'});
 expect(p.targets?.targets.filter(t=>t.sessionId===s!.id).every(t=>t.reason.includes('duplicado'))).toBe(true);
 await db.runAsync("INSERT INTO decision_log (id,schema_version,created_at,updated_at,decision_type,policy_version,inputs_json,output_json,accepted) VALUES ('repair',1,'now','now','legacy-prescription-repair','legacy-prescription-repair-v1',?,'{}',1)",JSON.stringify({sessionPlanId:s!.id,originalExerciseId:'absent'}));
 await expect(reviews.decide(p.id,'ACCEPTED')).rejects.toThrow();
 // The recovery option remains reachable, with the exact immutable plan retained.
 await reviews.decide(p.id,'KEPT');
 expect((await programs.getToday())!.session.exercises[0]!.target.reps.min).toBe(6);sqlite.close();
});


it('restores encrypted target audits and rejects a contradictory envelope before replacing data',async()=>{
 const {db,sqlite,reviews,programs}=await fixture();
 const p=await reviews.propose({cycleId:'targets',weekIndex:1,nextWeekIndex:2,outcome:'successful'});
 await reviews.decide(p.id,'ACCEPTED');
 const service=new BackupService(db);
 const before=(await programs.getToday())!.session;
 const encrypted=await service.exportEncrypted('synthetic weekly passphrase');
 await service.restorePortable(encrypted,{secret:'synthetic weekly passphrase',replaceConfirmed:true});
 expect((await new ProgramService(db).getToday())!.session).toEqual(before);
 const original=await service.export();const malformed=JSON.parse(original);
 const audit=malformed.tables.decision_log.find((r:{decision_type:string})=>r.decision_type==='WEEKLY_TARGETS');
 const output=JSON.parse(audit.output_json);output.targets[0].after.target.reps.min=99;audit.output_json=JSON.stringify(output);
 await expect(service.restore(JSON.stringify(malformed),true)).rejects.toMatchObject({code:'corrupt'});
 expect(JSON.parse(await service.export()).tables).toEqual(JSON.parse(original).tables);sqlite.close();
});

it('closes the final week without inventing a future week or cycle',async()=>{
 const {db,sqlite,reviews}=await fixture();
 await db.runAsync('DELETE FROM session_plan WHERE training_week_id IN (SELECT id FROM training_week WHERE week_index=2)');
 await db.runAsync('DELETE FROM training_week WHERE week_index=2');
 const before=await db.getAllAsync('SELECT * FROM cycle');
 const p=await reviews.propose({cycleId:'targets',weekIndex:1,nextWeekIndex:2,outcome:'successful'});
 expect(p.targets?.targets).toEqual([]);await reviews.decide(p.id,'ACCEPTED');
 expect(await db.getAllAsync('SELECT * FROM cycle')).toEqual(before);
 expect(await db.getAllAsync('SELECT * FROM training_week')).toHaveLength(1);sqlite.close();
});


it('holds a future session with persisted blocked readiness without clearing safety',async()=>{
 const {db,sqlite,reviews}=await fixture();
 const row=await db.getFirstAsync<{id:string}>("SELECT s.id FROM session_plan s JOIN training_week w ON w.id=s.training_week_id WHERE w.week_index=2 ORDER BY s.day_index LIMIT 1");
 await db.runAsync("INSERT INTO app_setting (id,schema_version,created_at,updated_at,key,value_json) VALUES ('blocked-ready',1,'now','now',?,?)",`session-readiness:${row!.id}`,JSON.stringify({sessionStatus:'PATTERN_STOPPED'}));
 const before=await db.getAllAsync('SELECT * FROM app_setting');
 const p=await reviews.propose({cycleId:'targets',weekIndex:1,nextWeekIndex:2,outcome:'successful'});
 expect(p.targets?.targets.filter(t=>t.sessionId===row!.id).every(t=>JSON.stringify(t.before)===JSON.stringify(t.after))).toBe(true);
 await reviews.decide(p.id,'ACCEPTED');expect(await db.getAllAsync('SELECT * FROM app_setting')).toEqual(before);sqlite.close();
});


it('uses verified main-lift exposures and the smallest allowed load increment at the rep ceiling',async()=>{
 const {db,sqlite,reviews,programs}=await fixture({reps:8,max:8,requirement:'EXACT'});
 const before=await db.getAllAsync('SELECT * FROM workout_session');
 const p=await reviews.propose({cycleId:'targets',weekIndex:1,nextWeekIndex:2,outcome:'successful'});
 expect(p.targets?.targets.every(t=>t.input?.consecutiveSuccessfulExposures===2 && t.after.calculatedLoad===41.25)).toBe(true);
 await reviews.decide(p.id,'ACCEPTED');
 expect((await programs.getToday())!.session.exercises.map(e=>e.calculatedLoad)).toEqual([41.25,41.25]);
 expect(await db.getAllAsync('SELECT * FROM workout_session')).toEqual(before);
 const service=new BackupService(db);await service.restorePortable(await service.exportEncrypted('synthetic load'),{secret:'synthetic load',replaceConfirmed:true});
 expect((await programs.getToday())!.session.exercises.map(e=>e.calculatedLoad)).toEqual([41.25,41.25]);sqlite.close();
});
