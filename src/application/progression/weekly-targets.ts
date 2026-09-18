import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import type { RepositoryDatabase } from '../../data/repositories';
import { exerciseCatalog } from '../../data/seeds/exercises';
import { proposeProgression, type ProgressionInput } from '../../domain/progression/propose-progression';
import type { TodayData } from '../programs/program-service';
import { projectHistory } from '../workouts/history-corrections';
import type { WorkoutDraft } from '../workouts/workout-service';
import { resolveTrainingSettings, type TrainingSettings } from '../../features/settings/settings';

type Session = TodayData['session'];
type Exercise = Session['exercises'][number];
export const WEEKLY_TARGET_POLICY = 'weekly-targets-v1';
export type WeeklyTarget = { sessionId: string; day: number; exerciseId: string; blockRole?: string; name: string; before: Exercise; after: Exercise; reason: string; input: ProgressionInput | null };
export type TargetSession = { id: string; snapshot_json: string; status: string; started: number; day_index: number };
export type WeeklyTargets = { targets: WeeklyTarget[]; sessions: TargetSession[]; fingerprint: string; unavailable: string | null };
const entries = (s: Session): Exercise[] => s.blocks ? s.blocks.filter(b=>b.role !== 'finish-review').flatMap(b=>b.exercises.map(e=>({...e, blockRole:b.role as NonNullable<Exercise['blockRole']>}))) : [...s.exercises];
const same = (a: Exercise,b: Exercise) => a.exerciseId === b.exerciseId && a.blockRole === b.blockRole;
const number = (v: string) => /^\d+(?:[.,]\d+)?$/.test(v.trim()) ? Number(v.replace(',','.')) : NaN;
export const targetChanged = (t: WeeklyTarget) => JSON.stringify(t.before) !== JSON.stringify(t.after);
export function applyWeeklyTargets(session: Session, targets: WeeklyTarget[]): Session {
  const tune = (e: Exercise) => targets.find(t=>same(t.before,e))?.after ?? e;
  return {...session, exercises:session.exercises.map(tune), ...(session.blocks ? {blocks:session.blocks.map(b=>b.role === 'finish-review' ? b : {...b, exercises:b.exercises.map(e=> {
    const after = tune({...e,blockRole:b.role as NonNullable<Exercise['blockRole']>});
    // Keep the original block representation (the flattened list carries its role).
    const {blockRole: _role, ...rest} = after;
    return 'blockRole' in e ? after : rest;
  })})} : {})};
}

/** Reconstruct every exercise from immutable workouts plus audited corrections, not the one-exercise session proposal. */
export async function inspectWeeklyTargets(db: RepositoryDatabase, cycleId: string, weekIndex: number): Promise<WeeklyTargets> {
  const sessions = await db.getAllAsync<TargetSession>(`SELECT s.id, s.snapshot_json, s.status, s.day_index,
    (SELECT COUNT(*) FROM workout_session r WHERE r.session_plan_id=s.id) AS started
    FROM session_plan s JOIN training_week w ON w.id=s.training_week_id WHERE w.cycle_id=? AND w.week_index=? ORDER BY s.day_index,s.id`, cycleId, weekIndex+1);
  const weeks = await db.getAllAsync<{id:string;status:string}>(`SELECT s.id,s.status FROM session_plan s JOIN training_week w ON w.id=s.training_week_id WHERE w.cycle_id=? AND w.week_index=? ORDER BY s.id`,cycleId,weekIndex);
  const rows = await db.getAllAsync<{id:string;session_plan_id:string;prescribed_snapshot_json:string;actual_snapshot_json:string;week_index:number}>(`SELECT r.id,r.session_plan_id,r.prescribed_snapshot_json,r.actual_snapshot_json,w.week_index FROM workout_session r JOIN session_plan s ON s.id=r.session_plan_id JOIN training_week w ON w.id=s.training_week_id WHERE w.cycle_id=? AND w.week_index<=? AND r.status='COMPLETED' ORDER BY w.week_index DESC,s.day_index DESC,r.completed_at DESC,r.id DESC`,cycleId,weekIndex);
  const safety = await db.getAllAsync('SELECT * FROM active_restriction WHERE active=1 ORDER BY id');
  const readiness = await db.getAllAsync<{key:string;value_json:string}>("SELECT key,value_json FROM app_setting WHERE key LIKE 'session-readiness:%' ORDER BY key");
  const setting = await db.getFirstAsync<{value_json:string}>("SELECT value_json FROM app_setting WHERE key='training-settings'");
  const settings = resolveTrainingSettings(setting ? JSON.parse(setting.value_json) as TrainingSettings : null);
  const repairs = await db.getAllAsync<{inputs_json:string}>("SELECT inputs_json FROM decision_log WHERE policy_version='legacy-prescription-repair-v1' AND accepted=1 ORDER BY id");
  const sessionDecisions = await db.getAllAsync<{inputs_json:string}>("SELECT inputs_json FROM decision_log WHERE decision_type='SESSION_PROGRESSION' AND accepted=1 ORDER BY id");
  const history = await Promise.all(rows.map(async row=>({...row, prescribed:JSON.parse(row.prescribed_snapshot_json) as Session,
    ...(await projectHistory(db,row.id,JSON.parse(row.actual_snapshot_json) as WorkoutDraft,JSON.parse(row.prescribed_snapshot_json)))})));
  let unavailable: string | null = null;
  if (sessions.some(s=>s.status !== 'PLANNED' || s.started)) unavailable='La próxima semana ya tiene trabajo iniciado. Mantén o rechaza para conservarlo.';
  if (repairs.some(r=>sessions.some(s=>s.id === JSON.parse(r.inputs_json).sessionPlanId))) unavailable='La próxima semana contiene referencias reparadas. Su ajuste semanal aún no está disponible; mantén o rechaza para conservar su auditoría.';
  const wholeWeek = weeks.length > 0 && weeks.every(w=>w.status === 'COMPLETED' && rows.some(r=>r.session_plan_id === w.id));
  const targets: WeeklyTarget[] = [];
  for (const session of sessions) for (const before of entries(JSON.parse(session.snapshot_json))) {
    let reason='No hay evidencia completa y compatible. Se conserva la prescripción.';
    let input: ProgressionInput | null = null;
    let after=before;
    const exposures = history.flatMap(h=> {
      const ps=entries(h.prescribed).filter(e=>same(e,before));
      const actual=h.actual.exercises.filter(e=>e.exerciseId === before.exerciseId && e.blockRole === before.blockRole);
      if(ps.length !== 1 || actual.length !== 1) return [];
      return [{h, prescribed:ps[0]!, actual:actual[0]!}];
    });
    const latest=exposures[0];
    const compatible = (e: Exercise) => e.calculatedLoad === before.calculatedLoad && JSON.stringify(e.target) === JSON.stringify(before.target);
    const successful = (e: typeof exposures[number]) => compatible(e.prescribed) && !e.actual.replacement && !e.h.actual.safetyModifications.length
      && !e.h.actual.readiness?.reviewRequired && (!e.h.actual.readiness || e.h.actual.readiness.disposition === 'CONTINUE_CONSERVATIVELY')
      && e.actual.sets.length === before.target.sets && e.actual.sets.every(s=>s.disposition === 'COMPLETED' && !s.skipped
        && number(s.load) === before.calculatedLoad && number(s.reps)>=before.target.reps.min && number(s.rir)>=before.target.rir.min && s.pain<=2 && s.technique === 'Limpia');
    const sessionApplied = sessionDecisions.some(r=>JSON.parse(r.inputs_json).target?.id === session.id);
    const blockedReadiness = readiness.some(r=>r.key === `session-readiness:${session.id}` && JSON.parse(r.value_json).sessionStatus !== 'READY');
    if (unavailable) reason=unavailable;
    else if (blockedReadiness || safety.length || settings.restrictions.length || before.power || before.plyometric) reason='Restricción o ejercicio de potencia: se mantiene la prescripción y la preparación de seguridad.';
    else if (sessionApplied) reason='Esta sesión ya recibió una recomendación. Se conserva para evitar un avance duplicado.';
    else if (before.loadProvenance?.includes(' lb;')) reason='La referencia está en libras. Se conserva sin convertir ni aplicar incrementos ambiguos.';
    else if (before.calculatedLoad === undefined || !Number.isFinite(before.calculatedLoad) || before.calculatedLoad<0) reason='Carga desconocida: no se inventa una carga ni se autoriza un avance.';
    else if (wholeWeek && latest?.h.week_index === weekIndex && successful(latest)
      && exposures.filter(e=>e.h.week_index === weekIndex).every(successful)) {
      let previous=0;
      for (const e of exposures.slice(1)) { if(!successful(e)) break; previous++; }
      input={exerciseId:before.exerciseId,role:before.requirement === 'EXACT' ? 'main':'accessory',target:{sets:before.target.sets,prescribedReps:before.target.reps.min,reps:before.target.reps,load:before.calculatedLoad,targetRir:before.target.rir.min},completed:{sets:latest.actual.sets.length,repsPerSet:latest.actual.sets.map(s=>number(s.reps)),terminalRir:number(latest.actual.sets.at(-1)!.rir),technique:'good',pain:Math.max(...latest.actual.sets.map(s=>s.pain))},consecutiveSuccessfulExposures:previous,consecutiveFailedExposures:0,availableLoadIncrements:settings.increments.map(n=>settings.units==='lb'?n*0.45359237:n),safetyFlagActive:false};
      const result=proposeProgression(input);
      if(result.action==='add_reps' || result.action==='add_load') {
        after={...before,calculatedLoad:result.nextTarget.load,target:{...before.target,reps:{...before.target.reps,min:result.nextTarget.reps}},...(result.action==='add_load'?{loadProvenance:'weekly progression; kg'}:{})};
        reason=result.action==='add_reps'?'Trabajo verificado: añade una repetición dentro del rango.':'Trabajo verificado: aplica el menor incremento permitido, hasta un cinco por ciento.';
      } else reason='Los criterios de progresión aún no se cumplen. Se mantiene la prescripción.';
    }
    targets.push({sessionId:session.id,day:session.day_index,exerciseId:before.exerciseId,...(before.blockRole?{blockRole:before.blockRole}:{}),name:exerciseCatalog.find(e=>e.id===before.exerciseId)?.name??before.exerciseId,before,after,reason,input});
  }
  return {targets,sessions,unavailable,fingerprint:bytesToHex(sha256(JSON.stringify({sessions,weeks,history,safety,readiness,setting,repairs,sessionDecisions})))};
}

/** Read-only overlay. A source mismatch fails closed instead of overwriting another decision. */
export async function effectiveWeeklySession(db: RepositoryDatabase,id:string,original:Session):Promise<Session> {
  const rows=await db.getAllAsync<{inputs_json:string;output_json:string}>("SELECT inputs_json,output_json FROM decision_log WHERE policy_version=? AND accepted=1 ORDER BY created_at,id",WEEKLY_TARGET_POLICY);
  let result=original;
  for(const row of rows){
    const output=JSON.parse(row.output_json) as {targets:WeeklyTarget[];sessions:TargetSession[]};
    const source=output.sessions.find(s=>s.id===id);
    const targets=output.targets.filter(t=>t.sessionId===id && targetChanged(t));
    if(!source || !targets.length) continue;
    if(JSON.stringify(result)!==source.snapshot_json) throw new Error('La prescripción semanal cambió. Se conserva el original para revisión.');
    result=applyWeeklyTargets(result,targets);
  }
  return result;
}


/** Portable audit validation runs before any restore write. Originals and proposal remain the authority. */
export function validateWeeklyTargetsBackup(tables: Record<string, Record<string, unknown>[]>) {
  const invalid=()=>{throw new Error('Invalid weekly targets');};
  const seen=new Set<string>();
  for(const row of tables.decision_log ?? []) {
    if(row.policy_version !== WEEKLY_TARGET_POLICY && row.decision_type !== 'WEEKLY_TARGETS') continue;
    if(row.policy_version !== WEEKLY_TARGET_POLICY || row.decision_type !== 'WEEKLY_TARGETS' || row.accepted !== 1) invalid();
    const input=JSON.parse(String(row.inputs_json));
    const output=JSON.parse(String(row.output_json)) as WeeklyTargets;
    const proposal=tables.progression_proposal?.find(p=>p.id===input.proposalId);
    const stored=proposal && JSON.parse(String(proposal.output_json));
    const review=tables.decision_log?.find(d=>d.id===`decision-${input.proposalId}`);
    if(row.id !== `weekly-targets:${input.proposalId}` || seen.has(String(row.id)) || !proposal || proposal.policy_version !== 'weekly-review-v1'
      || proposal.decision !== 'ACCEPTED' || stored.targetPolicy !== WEEKLY_TARGET_POLICY || stored.outcome !== 'successful'
      || input.cycleId !== stored.cycleId || input.weekIndex !== stored.weekIndex || !review || review.accepted !== 1
      || JSON.stringify(stored.targets)!==JSON.stringify(output) || output.unavailable !== null
      || !output.targets.some(targetChanged) || !/^[a-f0-9]{64}$/.test(output.fingerprint)) invalid();
    seen.add(String(row.id));
    const keys=new Set<string>();
    for(const session of output.sessions) {
      if(keys.has(session.id)) invalid(); keys.add(session.id);
      const original=tables.session_plan?.find(s=>s.id===session.id);
      const week=tables.training_week?.find(w=>w.id===original?.training_week_id);
      if(!original || original.snapshot_json!==session.snapshot_json || week?.cycle_id!==input.cycleId || week?.week_index!==input.weekIndex+1 || session.started!==0 || session.status!=='PLANNED') invalid();
      const exercises=entries(JSON.parse(session.snapshot_json));
      const targets=output.targets.filter(t=>t.sessionId===session.id);
      if(targets.length!==exercises.length) invalid();
      for(let i=0;i<targets.length;i++) {
        const t=targets[i]!;
        if(JSON.stringify(t.before)!==JSON.stringify(exercises[i]) || t.exerciseId!==t.before.exerciseId || t.day!==session.day_index) invalid();
        if(!targetChanged(t)) continue;
        const p=t.input;
        if(!p || p.role !== (t.before.requirement === 'EXACT' ? 'main' : 'accessory') || p.exerciseId!==t.exerciseId || p.target.load!==t.before.calculatedLoad || p.target.sets!==t.before.target.sets
          || p.target.prescribedReps!==t.before.target.reps.min || JSON.stringify(p.target.reps)!==JSON.stringify(t.before.target.reps)
          || p.target.targetRir!==t.before.target.rir.min || p.safetyFlagActive || t.before.power || t.before.plyometric) invalid();
        const result=proposeProgression(p!);
        if(!['add_reps','add_load'].includes(result.action) || ![result.nextTarget.load,result.nextTarget.reps,result.nextTarget.sets].every(Number.isFinite)) invalid();
        const expected={...t.before,calculatedLoad:result.nextTarget.load,target:{...t.before.target,reps:{...t.before.target.reps,min:result.nextTarget.reps}},...(result.action==='add_load'?{loadProvenance:'weekly progression; kg'}:{})};
        if(JSON.stringify(expected)!==JSON.stringify(t.after)) invalid();
      }
    }
    if(output.targets.some(t=>!keys.has(t.sessionId))) invalid();
  }
}
