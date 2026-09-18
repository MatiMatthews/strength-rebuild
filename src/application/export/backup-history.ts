import type { SqlValue } from '../../data/repositories';
import type { WorkoutDraft } from '../workouts/workout-service';
import { canonicalSet } from '../workouts/load-recovery';
import { projectHistoryRows, type HistoryCorrectionRow } from '../workouts/history-corrections';

type Row = Record<string, SqlValue>;
// Validate the exact saved evidence without normalizing or rewriting it. Legacy
// records without unit metadata retain the same interpretation as local history.
export function validateBackupHistory(tables: Record<string, Row[]>) {
 const workouts = new Map(tables.workout_session!.map(row => [row.id, row]));
 const sequences = new Set<number>();
 const rows: HistoryCorrectionRow[] = [];
 for (const row of tables.decision_log!) {
  if (row.decision_type !== 'HISTORY_CORRECTION') continue;
  const input = JSON.parse(String(row.inputs_json));
  const source = workouts.get(input.workoutId);
  if (!source || source.status !== 'COMPLETED' || source.actual_snapshot_json == null) throw new Error('Correction source is not completed');
  if (input.sequence !== undefined) {
   if (!Number.isSafeInteger(input.sequence) || input.sequence < 1 || sequences.has(input.sequence)) throw new Error('Invalid correction order');
   sequences.add(input.sequence);
  }
  if (row.accepted !== 0 && row.accepted !== 1) throw new Error('Invalid correction decision');
  // Rejected events do not contribute to the effective history.
  if (row.accepted === 1) rows.push({id:String(row.id),inputs_json:String(row.inputs_json),created_at:String(row.created_at),policy_version:String(row.policy_version)});
 }
 rows.sort((a,b)=>a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
 for (const row of workouts.values()) {
  if (row.actual_snapshot_json == null) continue;
  const original = JSON.parse(String(row.actual_snapshot_json)) as WorkoutDraft;
  const prescribed = row.prescribed_snapshot_json == null ? undefined : JSON.parse(String(row.prescribed_snapshot_json));
  const projected = projectHistoryRows(rows,String(row.id),original,prescribed);
  const events = rows.map(event=>JSON.parse(event.inputs_json)).filter(event=>event.workoutId===row.id).sort((a,b)=>(a.sequence??0)-(b.sequence??0));
  for (const [index,event] of events.entries()) {
   if (event.exerciseIndex !== undefined && (!Number.isInteger(event.exerciseIndex) || event.exerciseIndex < 0)) throw new Error('Invalid correction exercise');
   // Older editors stored untyped before values before load recovery existed.
   // Explicit-unit before evidence must agree with the canonical chain.
   if (event.before?.load !== undefined) {
    const before = canonicalSet({...event.before,load:String(event.before.load)});
    if (event.before.loadUnit !== undefined && Number(before.load.replace(',','.')) !== Number(projected.corrections[index]!.beforeLoad.replace(',','.'))) throw new Error('Contradictory correction chain');
   }
  }
 }
}
