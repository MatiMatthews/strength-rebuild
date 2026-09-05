import { DatabaseSync } from 'node:sqlite';
import { ProgramService } from '../../../src/application/programs/program-service';
import { WorkoutService } from '../../../src/application/workouts/workout-service';
import { migrateDatabase, type MigrationDatabase } from '../../../src/data/migrations';
import type { RepositoryDatabase, SqlValue } from '../../../src/data/repositories';
function open(path: string) {
  const sqlite = new DatabaseSync(path);
  const db = { exec: (sql: string) => sqlite.exec(sql), runAsync: async (sql: string, ...params: SqlValue[]) => { const result = sqlite.prepare(sql).run(...params); return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) }; }, getFirstAsync: async (sql: string, ...params: SqlValue[]) => (sqlite.prepare(sql).get(...params) ?? null) as never, getAllAsync: async (sql: string, ...params: SqlValue[]) => sqlite.prepare(sql).all(...params) as never, withTransactionAsync: async (task: () => Promise<void>) => { sqlite.exec('BEGIN IMMEDIATE'); try { await task(); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } } as RepositoryDatabase & MigrationDatabase;
  return { sqlite, db };
}



it('recovers the exact stopped input and explanation and preserves the saved block', async () => {
 const {sqlite, db} = open(':memory:'); await migrateDatabase(db);
 const programs = new ProgramService(db); await programs.createPlan([{id:'personal',type:'hypertrophy',weeks:2}]); await programs.activateCycle('personal');
 const today = (await programs.getToday())!; const workouts = new WorkoutService(db);
 const input = {pain:3,painTrend:'stable' as const,persistsAfterModification:true,region:'lumbar' as const,reproducedByBraceCoughOrSneeze:false};
 const saved = await workouts.applyReadiness(today,input);
 expect(saved).toMatchObject({input, explanation:expect.stringContaining('persistió')});
 expect(await new WorkoutService(db).getReadiness(today.sessionPlanId!)).toEqual(saved);
 await expect(workouts.startOrResume(today)).rejects.toThrow('bloquea');
 await expect(workouts.applyReadiness(today,{pain:1,painTrend:'stable',region:'other',reproducedByBraceCoughOrSneeze:false})).rejects.toThrow();
 expect(await workouts.getReadiness(today.sessionPlanId!)).toEqual(saved);
 expect(await workouts.applyReadiness(today,input)).toEqual(saved);
 expect(await db.getAllAsync("SELECT * FROM decision_log WHERE decision_type = 'READINESS'")).toHaveLength(1);
 sqlite.close();
});

it('audits supported changes atomically, recovers legacy evidence, and rejects malformed and stale writes', async () => {
 const {sqlite,db}=open(':memory:'); await migrateDatabase(db); const programs=new ProgramService(db);
 await programs.createPlan([{id:'personal',type:'hypertrophy',weeks:2}]); await programs.activateCycle('personal'); const today=(await programs.getToday())!;
 const service=new WorkoutService(db); const input={pain:1,painTrend:'stable' as const,region:'other' as const,reproducedByBraceCoughOrSneeze:false};
 expect(await service.getReadiness(today.sessionPlanId!)).toBeNull();
 const saved=await service.applyReadiness(today,input);
 const before=await db.getAllAsync('SELECT * FROM app_setting'); const audit=await db.getAllAsync('SELECT * FROM decision_log');
 sqlite.exec("CREATE TRIGGER fail_readiness BEFORE UPDATE ON app_setting BEGIN SELECT RAISE(ABORT, 'write failed'); END");
 await expect(service.applyReadiness(today,{...input,pain:3})).rejects.toThrow('write failed');
 expect(await db.getAllAsync('SELECT * FROM app_setting')).toEqual(before); expect(await db.getAllAsync('SELECT * FROM decision_log')).toEqual(audit);
 sqlite.exec('DROP TRIGGER fail_readiness');
 await expect(service.applyReadiness(today,{...input,painTrend:'unknown' as 'stable'})).rejects.toThrow('no válida');
 expect(await service.getReadiness(today.sessionPlanId!)).toEqual(saved);
 const legacy={...saved}; delete legacy.input; delete legacy.result; delete legacy.explanation;
 await db.runAsync('UPDATE app_setting SET value_json = ? WHERE key = ?',JSON.stringify(legacy),`session-readiness:${today.sessionPlanId}`);
 expect(await service.getReadiness(today.sessionPlanId!)).toEqual(legacy);
 await service.applyReadiness(today,{...input,pain:3});
 const row=await db.getFirstAsync<{inputs_json:string}>("SELECT inputs_json FROM decision_log WHERE decision_type='READINESS' ORDER BY rowid DESC LIMIT 1");
 expect(JSON.parse(row!.inputs_json).previous).toEqual(legacy);
 await service.startOrResume(today);
 const snapshots=await db.getAllAsync('SELECT * FROM workout_session');
 await db.runAsync("UPDATE session_plan SET status='COMPLETED' WHERE id=?",today.sessionPlanId!);
 await expect(service.applyReadiness(today,input)).rejects.toThrow('cambió');
 expect(await db.getAllAsync('SELECT * FROM workout_session')).toEqual(snapshots);
 await db.runAsync('UPDATE app_setting SET value_json = ? WHERE key = ?', '{}', `session-readiness:${today.sessionPlanId}`);
 await expect(service.getReadiness(today.sessionPlanId!)).rejects.toThrow('verificar');
 expect((await db.getFirstAsync<{value_json:string}>('SELECT value_json FROM app_setting WHERE key = ?', `session-readiness:${today.sessionPlanId}`))?.value_json).toBe('{}');
 sqlite.close();
});
