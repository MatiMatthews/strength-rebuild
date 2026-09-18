import { BackupService } from '../../../src/application/export/backup-service';
import { DatabaseSync } from 'node:sqlite';
import { migrateDatabase, type MigrationDatabase } from '../../../src/data/migrations';
import type { RepositoryDatabase, SqlValue } from '../../../src/data/repositories';
import { ProgramService } from '../../../src/application/programs/program-service';
import { WorkoutService } from '../../../src/application/workouts/workout-service';
import { WeeklyReviewService } from '../../../src/application/progression/weekly-review';

async function fixture({reps=6,max=8,requirement='PATTERN', failure='none',sets=1}: {reps?:number;max?:number;requirement?:string;sets?:number;failure?:'none'|'missed'|'effort'|'repeated'|'omitted'} = {}) {
  const sqlite = new DatabaseSync(':memory:');
  const db = { exec: (s: string) => sqlite.exec(s), runAsync: async (s: string, ...p: SqlValue[]) => { const r = sqlite.prepare(s).run(...p); return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) }; }, getFirstAsync: async (s: string, ...p: SqlValue[]) => (sqlite.prepare(s).get(...p) ?? null) as never, getAllAsync: async (s: string, ...p: SqlValue[]) => sqlite.prepare(s).all(...p) as never, withTransactionAsync: async (task: () => Promise<void>) => { sqlite.exec('BEGIN IMMEDIATE'); try { await task(); sqlite.exec('COMMIT'); } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } } as RepositoryDatabase & MigrationDatabase;
  await migrateDatabase(db);
  const programs = new ProgramService(db);
  await programs.createPlan([{ id: 'targets', type: 'hypertrophy', weeks: 2 }]);
  // Accelerate only the synthetic prescription; finish all work through the real service.
  for (const row of await db.getAllAsync<{id: string; day_index: number}>('SELECT id, day_index FROM session_plan')) {
    const exercises = ['barbell-bench-press', 'seated-leg-curl'].map(exerciseId => ({ exerciseId, requirement, calculatedLoad: 40, target: { sets, reps: { min: reps, max }, rir: { min: 2, max: 3 }, loadPercent: null }, qualityStops: [] }));
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
      for(let set=0;set<sets;set++) {
      if(failure==='omitted' && day===2 && e===0 && set===1) {draft=workouts.skipSet(draft,e,set,'Synthetic missed work');continue;}
      draft = workouts.recordSet(draft, e, set, { load: '40', reps: String(e===0 && day===2 && failure==='missed' ? 1 : reps), rir: e===0 && (day===2 && failure==='effort' || day>=1 && failure==='repeated') ? '0' : '3', pain: 0, technique: 'Limpia' });
      draft = workouts.completeSet(draft, e, set);
      }
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

it.each(['successful','missed'] as const)('rolls back all target application and closure after an audit error; retries once, rejects duplicate taps (%s)',async(outcome)=>{
 const {db,sqlite,reviews,programs}=await fixture({failure:outcome==='missed'?'missed':'none'});
 const p=await reviews.propose({cycleId:'targets',weekIndex:1,nextWeekIndex:2,outcome});
 sqlite.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON decision_log WHEN NEW.decision_type='WEEKLY_PROGRESSION' BEGIN SELECT RAISE(ABORT,'audit failed'); END");
 await expect(reviews.decide(p.id,'ACCEPTED')).rejects.toThrow('audit failed');
 expect(await db.getAllAsync("SELECT * FROM decision_log WHERE decision_type='WEEKLY_TARGETS'")).toEqual([]);
 expect((await reviews.load('targets',1))?.id).toBe(p.id);
 sqlite.exec('DROP TRIGGER fail_audit');
 expect((await Promise.allSettled([reviews.decide(p.id,'ACCEPTED'),reviews.decide(p.id,'ACCEPTED')])).map(r=>r.status)).toEqual(['fulfilled','rejected']);
 expect((await programs.getToday())!.session.exercises[0]!.target.reps.min).toBe(outcome==='successful'?7:6);sqlite.close();
});

it('never promotes a historical weekly output into a target authorization',async()=>{
 const {db,sqlite,reviews,programs}=await fixture();
 const p=await reviews.propose({cycleId:'targets',weekIndex:1,nextWeekIndex:2,outcome:'successful'});
 await db.runAsync('UPDATE progression_proposal SET output_json=? WHERE id=?',JSON.stringify({nextTarget:{load:999,reps:99}}),p.id);
 expect((await reviews.load('targets',1))?.targets).toBeUndefined();
 await reviews.decide(p.id,'ACCEPTED');
 expect((await programs.getToday())!.session.exercises[0]!.target.reps.min).toBe(6);sqlite.close();
});

it('rejects malformed repair audits and avoids duplicating session progression',async()=>{
 const {db,sqlite,reviews,programs}=await fixture();
 const s=await db.getFirstAsync<{id:string;snapshot_json:string}>("SELECT s.* FROM session_plan s JOIN training_week w ON w.id=s.training_week_id WHERE w.week_index=2 ORDER BY s.day_index LIMIT 1");
 await db.runAsync("INSERT INTO decision_log (id,schema_version,created_at,updated_at,decision_type,policy_version,inputs_json,output_json,accepted) VALUES ('session',1,'now','now','SESSION_PROGRESSION','session-review-v1',?,'{}',1)",JSON.stringify({target:{id:s!.id}}));
 const p=await reviews.propose({cycleId:'targets',weekIndex:1,nextWeekIndex:2,outcome:'successful'});
 expect(p.targets?.targets.filter(t=>t.sessionId===s!.id).every(t=>t.reason.includes('duplicado'))).toBe(true);
 await db.runAsync("INSERT INTO decision_log (id,schema_version,created_at,updated_at,decision_type,policy_version,inputs_json,output_json,accepted) VALUES ('repair',1,'now','now','legacy-prescription-repair','legacy-prescription-repair-v1',?,'{}',1)",JSON.stringify({sessionPlanId:s!.id,originalExerciseId:'absent'}));
 await expect(reviews.decide(p.id,'ACCEPTED')).rejects.toThrow();
 // The recovery option remains reachable, with the exact immutable plan retained.
 await reviews.decide(p.id,'KEPT');
 await expect(programs.getToday()).rejects.toThrow('auditoría');sqlite.close();
});


it.each(['successful','missed'] as const)('restores encrypted target audits and rejects a contradictory envelope before replacing data (%s)',async(outcome)=>{
 const {db,sqlite,reviews,programs}=await fixture({failure:outcome==='missed'?'missed':'none'});
 const p=await reviews.propose({cycleId:'targets',weekIndex:1,nextWeekIndex:2,outcome});
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
 expect(JSON.parse(await service.export()).tables).toEqual(JSON.parse(original).tables);
 // A coordinated proposal/target edit still contradicts the immutable confirmation record.
 const proposalRow=malformed.tables.progression_proposal.find((r:{id:string})=>r.id===p.id);
 const forged=JSON.parse(proposalRow.output_json);forged.targets=output;proposalRow.output_json=JSON.stringify(forged);
 await expect(service.restore(JSON.stringify(malformed),true)).rejects.toMatchObject({code:'corrupt'});
 expect(JSON.parse(await service.export()).tables).toEqual(JSON.parse(original).tables);sqlite.close();
});

it.each(['successful','missed'] as const)('closes the final week without inventing a future week or cycle (%s)',async(outcome)=>{
 const {db,sqlite,reviews}=await fixture({failure:outcome==='missed'?'missed':'none'});
 await db.runAsync('DELETE FROM session_plan WHERE training_week_id IN (SELECT id FROM training_week WHERE week_index=2)');
 await db.runAsync('DELETE FROM training_week WHERE week_index=2');
 const before=await db.getAllAsync('SELECT * FROM cycle');
 const p=await reviews.propose({cycleId:'targets',weekIndex:1,nextWeekIndex:2,outcome});
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


it.each(['missed','effort','repeated','omitted'] as const)('reviews verified %s recovery per exercise without blanket changes',async failure=>{
 const {db,sqlite,reviews,programs,workouts}=await fixture({failure,sets:failure==='omitted'?2:1});
 const originals=await db.getAllAsync('SELECT * FROM session_plan');
 const history=await db.getAllAsync('SELECT * FROM workout_session');
 const p=await reviews.propose({cycleId:'targets',weekIndex:1,nextWeekIndex:2,outcome:failure==='effort'?'failed':failure==='omitted'?'missed':failure});
 expect(p.targets?.targets).toHaveLength(6);
 expect(p.targets?.targets.filter(t=>t.exerciseId==='barbell-bench-press').map(t=>t.after.calculatedLoad)).toEqual(failure==='repeated'?[40,40,40]:[38,38,38]);
 expect(p.targets?.targets.filter(t=>t.exerciseId==='seated-leg-curl').every(t=>JSON.stringify(t.before)===JSON.stringify(t.after))).toBe(true);
 expect(await new WeeklyReviewService(db).load('targets',1)).toEqual(p);
 await reviews.decide(p.id,'ACCEPTED');
 const next=(await new ProgramService(db).getToday())!;
 expect(next.weekIndex).toBe(2);
 expect(next.session.exercises.map(e=>e.calculatedLoad)).toEqual([failure==='repeated'?40:38,40]);
 expect(await db.getAllAsync('SELECT * FROM session_plan')).toEqual(originals);
 expect(await db.getAllAsync('SELECT * FROM workout_session')).toEqual(history);
 await workouts.applyReadiness(next,{pain:0,painTrend:'stable',region:'other',reproducedByBraceCoughOrSneeze:false});
 expect((await workouts.startOrResume(next)).exercises[0]!.sets[0]!.load).toBe(failure==='repeated'?'40':'38');
 const backup=new BackupService(db);await backup.restorePortable(await backup.exportEncrypted('synthetic recovery'),{secret:'synthetic recovery',replaceConfirmed:true});
 expect((await programs.getToday())!.session.exercises[0]!.calculatedLoad).toBe(failure==='repeated'?40:38);sqlite.close();
});

it.each(['KEPT','REJECTED'] as const)('keeps recovery prescriptions unchanged after %s',async choice=>{
 const {db,sqlite,reviews,programs}=await fixture({failure:'missed'});
 const p=await reviews.propose({cycleId:'targets',weekIndex:1,nextWeekIndex:2,outcome:'missed'});
 expect(p.targets!.targets[0]!.after.calculatedLoad).toBe(38);
 const before=await db.getAllAsync('SELECT * FROM session_plan');
 await new WeeklyReviewService(db).decide(p.id,choice);await expect(reviews.decide(p.id,choice)).rejects.toThrow();
 expect((await programs.getToday())!.session.exercises[0]!.calculatedLoad).toBe(40);
 expect(await db.getAllAsync('SELECT * FROM session_plan')).toEqual(before);sqlite.close();
});

it('requires a separate explicit preview for legacy recovery and preserves its original inputs and output',async()=>{
 const {db,sqlite,reviews,programs}=await fixture({failure:'missed'});
 const p=await reviews.propose({cycleId:'targets',weekIndex:1,nextWeekIndex:2,outcome:'missed'});
 await db.runAsync('UPDATE progression_proposal SET output_json=? WHERE id=?',JSON.stringify({action:'reduce',nextTarget:{load:999}}),p.id);
 const legacy=await db.getFirstAsync('SELECT inputs_json,output_json FROM progression_proposal WHERE id=?',p.id);
 expect((await reviews.load('targets',1))!.targets).toBeUndefined();
 const fresh=await reviews.propose(p,true);expect(fresh.id).not.toBe(p.id);
 expect((await new WeeklyReviewService(db).load('targets',1))!.id).toBe(fresh.id);
 expect((await reviews.propose(p,true)).id).toBe(fresh.id);
 await reviews.decide(fresh.id,'ACCEPTED');
 expect(await db.getFirstAsync('SELECT inputs_json,output_json FROM progression_proposal WHERE id=?',p.id)).toEqual(legacy);
 expect((await programs.getToday())!.session.exercises[0]!.calculatedLoad).toBe(38);sqlite.close();
});

it.each(['missing','corrected','unknown','safety','session','repaired','started','pending'] as const)('holds or rejects recovery with %s evidence without replacing originals',async change=>{
 const {db,sqlite,reviews,workouts,programs}=await fixture({failure:'missed'});
 const target=await db.getFirstAsync<{id:string}>("SELECT s.id FROM session_plan s JOIN training_week w ON w.id=s.training_week_id WHERE w.week_index=2 ORDER BY day_index LIMIT 1");
 if(change==='missing') await db.runAsync("DELETE FROM workout_session WHERE id='work-3'");
 if(change==='corrected') await workouts.correctHistory({workoutId:'work-3',exerciseId:'barbell-bench-press',setIndex:0,load:'20',reason:'Correct synthetic load'});
 if(change==='safety') await db.runAsync("INSERT INTO active_restriction (id,schema_version,created_at,updated_at,kind,details_json,active) VALUES ('restriction',1,'now','now','abdominal','{}',1)");
 if(change==='session'||change==='repaired') await db.runAsync("INSERT INTO decision_log (id,schema_version,created_at,updated_at,decision_type,policy_version,inputs_json,output_json,accepted) VALUES ('prior',1,'now','now',?,?,?,'{}',1)",change==='session'?'SESSION_PROGRESSION':'legacy-prescription-repair',change==='session'?'session-review-v1':'legacy-prescription-repair-v1',JSON.stringify(change==='session'?{target:{id:target!.id}}:{sessionPlanId:target!.id}));
 if(change==='unknown') for(const row of await db.getAllAsync<{id:string;snapshot_json:string}>('SELECT * FROM session_plan')) {const s=JSON.parse(row.snapshot_json);delete s.exercises[0].calculatedLoad;await db.runAsync('UPDATE session_plan SET snapshot_json=? WHERE id=?',JSON.stringify(s),row.id);}
 if(change==='pending'){const row=await db.getFirstAsync<{actual_snapshot_json:string}>("SELECT actual_snapshot_json FROM workout_session WHERE id='work-3'");const s=JSON.parse(row!.actual_snapshot_json);s.exercises[0].sets[0].disposition='PENDING';await db.runAsync("UPDATE workout_session SET actual_snapshot_json=? WHERE id='work-3'",JSON.stringify(s));}
 const p=await reviews.propose({cycleId:'targets',weekIndex:1,nextWeekIndex:2,outcome:'missed'});
 const before=await db.getAllAsync('SELECT snapshot_json FROM session_plan');
 if(change==='started') {await db.runAsync("UPDATE session_plan SET status='IN_PROGRESS' WHERE id=?",target!.id);await expect(reviews.decide(p.id,'ACCEPTED')).rejects.toThrow();await reviews.decide(p.id,'KEPT');}
 else if(change==='repaired'){expect(p.targets?.unavailable).toContain('reparadas');await expect(reviews.decide(p.id,'ACCEPTED')).rejects.toThrow();await reviews.decide(p.id,'KEPT');}
 else {expect(p.targets?.targets.filter(t=>t.exerciseId==='barbell-bench-press' && (change!=='session'||t.sessionId===target!.id)).every(t=>JSON.stringify(t.before)===JSON.stringify(t.after))).toBe(true);await reviews.decide(p.id,'ACCEPTED');}
 expect(await db.getAllAsync('SELECT snapshot_json FROM session_plan')).toEqual(before);
 if(change==='repaired') await expect(programs.getToday()).rejects.toThrow('auditoría');
 else if(change!=='unknown') expect((await programs.getToday())!.session.exercises[0]!.calculatedLoad).toBe(40);sqlite.close();
});

it.each(['missed','failed','repeated'] as const)('a reported %s outcome cannot fabricate failure or blanket reductions',async outcome=>{
 const {sqlite,reviews,programs}=await fixture();
 const p=await reviews.propose({cycleId:'targets',weekIndex:1,nextWeekIndex:2,outcome});
 expect(p.targets!.targets.every(t=>JSON.stringify(t.before)===JSON.stringify(t.after))).toBe(true);
 await reviews.decide(p.id,'ACCEPTED');expect((await programs.getToday())!.session.exercises.map(e=>e.calculatedLoad)).toEqual([40,40]);sqlite.close();
});

async function repairedFixture(failure: 'none' | 'missed' = 'none') {
 const f=await fixture({failure});
 const row=await f.db.getFirstAsync<{id:string;snapshot_json:string}>("SELECT s.id,s.snapshot_json FROM session_plan s JOIN training_week w ON w.id=s.training_week_id WHERE w.week_index=2 ORDER BY day_index LIMIT 1");
 const original=JSON.parse(row!.snapshot_json);
 original.exercises.push({...original.exercises[0],exerciseId:'unknown-legacy',calculatedLoad:999});
 await f.db.runAsync('UPDATE session_plan SET snapshot_json=? WHERE id=?',JSON.stringify(original),row!.id);
 await f.programs.applyLegacyRepair(await f.programs.prepareLegacyRepair(row!.id,'unknown-legacy','seated-dumbbell-press'));
 return {...f,sessionId:row!.id};
}

it.each(['none','missed'] as const)('composes repaired and ordinary weekly targets with unknown replacement load (%s)',async failure=>{
 const {db,sqlite,reviews,programs,workouts}=await repairedFixture(failure);
 const backup=new BackupService(db);
 const original=JSON.parse(await backup.export()).tables;
 const p=await reviews.propose({cycleId:'targets',weekIndex:1,nextWeekIndex:2,outcome:failure==='none'?'successful':'missed'});
 expect(p.targets?.unavailable).toBeNull();
 const replacement=p.targets!.targets.find(t=>t.exerciseId==='seated-dumbbell-press')!;
 expect(replacement.before.calculatedLoad).toBeUndefined();expect(replacement.after).toEqual(replacement.before);
 await reviews.decide(p.id,'ACCEPTED');
 const today=(await new ProgramService(db).getToday())!;
 expect(today.session.exercises[0]!.target.reps.min).toBe(failure==='none'?7:6);
 expect(today.session.exercises[0]!.calculatedLoad).toBe(failure==='none'?40:38);
 expect((await programs.listCycleSnapshots())[0]!.weeks[1]!.sessions[0]).toEqual(today.session);
 expect(today.session.exercises[2]!.exerciseId).toBe('seated-dumbbell-press');expect(today.session.exercises[2]!.calculatedLoad).toBeUndefined();
 const after=JSON.parse(await backup.export()).tables;
 expect(after.session_plan).toEqual(original.session_plan);expect(after.workout_session).toEqual(original.workout_session);
 expect(after.decision_log.filter((r:{policy_version:string})=>r.policy_version==='legacy-prescription-repair-v1')).toEqual(original.decision_log.filter((r:{policy_version:string})=>r.policy_version==='legacy-prescription-repair-v1'));
 await backup.restorePortable(await backup.exportEncrypted('synthetic composition'),{secret:'synthetic composition',replaceConfirmed:true});
 expect((await programs.getToday())!.session).toEqual(today.session);
 await workouts.applyReadiness(today,{pain:0,painTrend:'stable',region:'other',reproducedByBraceCoughOrSneeze:false});
 const draft=await workouts.startOrResume(today);expect(draft.exercises[0]!.sets[0]!.reps).toBe(failure==='none'?'7':'6');expect(draft.exercises[2]!.sets[0]!.load).not.toBe('999');
 sqlite.close();
});

it.each(['KEPT','REJECTED'] as const)('closes a repaired cohort with %s without changing either audit',async choice=>{
 const {db,sqlite,reviews,programs}=await repairedFixture();
 const p=await reviews.propose({cycleId:'targets',weekIndex:1,nextWeekIndex:2,outcome:'successful'});
 const before=await db.getAllAsync('SELECT * FROM decision_log');
 await reviews.decide(p.id,choice);await expect(reviews.decide(p.id,choice)).rejects.toThrow();
 expect((await programs.getToday())!.session.exercises[0]!.target.reps.min).toBe(6);
 expect(await db.getAllAsync("SELECT * FROM decision_log WHERE policy_version='legacy-prescription-repair-v1'")).toEqual(before.filter((r:any)=>r.policy_version==='legacy-prescription-repair-v1'));sqlite.close();
});

it.each(['repair','workout','restriction','target'] as const)('rejects arriving %s after a composed preview without partial application',async change=>{
 const {db,sqlite,reviews,sessionId}=await repairedFixture();
 const p=await reviews.propose({cycleId:'targets',weekIndex:1,nextWeekIndex:2,outcome:'successful'});
 if(change==='repair') await db.runAsync("UPDATE decision_log SET updated_at='changed',output_json='{}' WHERE policy_version='legacy-prescription-repair-v1'");
 if(change==='workout') await db.runAsync("INSERT INTO workout_session(id,schema_version,created_at,updated_at,session_plan_id,status,prescribed_snapshot_json) VALUES ('arrived',1,'now','now',?,'IN_PROGRESS','{}')",sessionId);
 if(change==='restriction') await db.runAsync("INSERT INTO active_restriction(id,schema_version,created_at,updated_at,kind,details_json,active) VALUES ('arrived',1,'now','now','abdominal','{}',1)");
 if(change==='target') await db.runAsync("UPDATE session_plan SET snapshot_json=json_set(snapshot_json,'$.exercises[0].calculatedLoad',99) WHERE id=?",sessionId);
 const before=JSON.parse(await new BackupService(db).export()).tables;
 await expect(reviews.decide(p.id,'ACCEPTED')).rejects.toThrow('cambió');
 expect(JSON.parse(await new BackupService(db).export()).tables).toEqual(before);
 await reviews.decide(p.id,'KEPT');sqlite.close();
});

it('rolls back a mixed repaired target batch, retries once and rejects a second confirmation',async()=>{
 const {db,sqlite,reviews}=await repairedFixture('missed');
 const p=await reviews.propose({cycleId:'targets',weekIndex:1,nextWeekIndex:2,outcome:'missed'});
 const before=JSON.parse(await new BackupService(db).export()).tables;
 sqlite.exec("CREATE TRIGGER fail_composed BEFORE INSERT ON decision_log WHEN NEW.decision_type='WEEKLY_PROGRESSION' BEGIN SELECT RAISE(ABORT,'audit failed'); END");
 await expect(reviews.decide(p.id,'ACCEPTED')).rejects.toThrow('audit failed');
 expect(JSON.parse(await new BackupService(db).export()).tables).toEqual(before);
 sqlite.exec('DROP TRIGGER fail_composed');
 const result=await Promise.allSettled([reviews.decide(p.id,'ACCEPTED'),reviews.decide(p.id,'ACCEPTED')]);
 expect(result.map(r=>r.status)).toEqual(['fulfilled','rejected']);
 expect(await db.getAllAsync("SELECT * FROM decision_log WHERE decision_type='WEEKLY_TARGETS'")).toHaveLength(1);sqlite.close();
});

it.each(['source','repair-output','repair-order','missing-repair','duplicate','effective','replacement-load','target-identity'] as const)('rejects a %s composition forgery before replacing the database',async fault=>{
 const {db,sqlite,reviews}=await repairedFixture();
 const p=await reviews.propose({cycleId:'targets',weekIndex:1,nextWeekIndex:2,outcome:'successful'});await reviews.decide(p.id,'ACCEPTED');
 const backup=new BackupService(db);const original=JSON.parse(await backup.export());const forged=JSON.parse(JSON.stringify(original));
 const repair=forged.tables.decision_log.find((r:any)=>r.policy_version==='legacy-prescription-repair-v1');
 const target=forged.tables.decision_log.find((r:any)=>r.decision_type==='WEEKLY_TARGETS');
 const output=JSON.parse(target.output_json);
 if(fault==='source') {const input=JSON.parse(repair.inputs_json);input.source='{}';repair.inputs_json=JSON.stringify(input);}
 if(fault==='repair-output') repair.output_json='{}';
 if(fault==='repair-order') repair.created_at='9999-01-01';
 if(fault==='missing-repair') forged.tables.decision_log=forged.tables.decision_log.filter((r:any)=>r.id!==repair.id);
 if(fault==='duplicate') forged.tables.decision_log.push({...target});
 if(fault==='effective') output.sessions[0].effective_snapshot_json=output.sessions[0].snapshot_json;
 if(fault==='replacement-load') {const t=output.targets.find((t:any)=>t.exerciseId==='seated-dumbbell-press');t.before.calculatedLoad=999;t.after.calculatedLoad=999;}
 if(fault==='target-identity') output.targets[0].exerciseId='seated-dumbbell-press';
 // Keep the three stored target copies consistent: source/audit validation must still reject.
 target.output_json=JSON.stringify(output);
 const proposal=forged.tables.progression_proposal.find((r:any)=>r.id===p.id);const stored=JSON.parse(proposal.output_json);stored.targets=output;proposal.output_json=JSON.stringify(stored);
 const review=forged.tables.decision_log.find((r:any)=>r.id===`decision-${p.id}`);const ri=JSON.parse(review.inputs_json);ri.originalOutput=proposal.output_json;review.inputs_json=JSON.stringify(ri);
 await expect(backup.restore(JSON.stringify(forged),true)).rejects.toMatchObject({code:'corrupt'});
 expect(JSON.parse(await backup.export()).tables).toEqual(original.tables);sqlite.close();
});
