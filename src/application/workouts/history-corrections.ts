import { canonicalSet, recoverWorkoutLoads } from './load-recovery';
import type { TodayData } from '../programs/program-service';
import type { RepositoryDatabase } from '../../data/repositories';
import type { WorkoutDraft, WorkoutSetDraft } from './workout-service';

export interface SetCorrection {
  id: string; order: number; exerciseId: string; exerciseIndex: number; setIndex: number;
  originalLoad: string; beforeLoad: string; afterLoad: string; reason: string; decidedAt: string;
}
export const isRecordedSet = (set: WorkoutSetDraft) => !set.skipped && (set.disposition === 'COMPLETED' || (set.disposition === undefined && set.completed !== false));
export function correctionLoad(value: string): number {
  if (typeof value !== 'string' || !/^\d+(?:[.,]\d+)?$/.test(value.trim())) throw new Error('La carga corregida debe ser un número válido de 0 o más.');
  const load = Number(value.trim().replace(',', '.'));
  if (!Number.isFinite(load)) throw new Error('La carga corregida debe ser finita.');
  return load;
}
interface EventRow { id: string; inputs_json: string; created_at: string; policy_version: string }
export async function projectHistory(db: RepositoryDatabase, workoutId: string, original: WorkoutDraft, prescribed?: TodayData['session']) {
  const baseline = recoverWorkoutLoads(original, prescribed);
  const actual = JSON.parse(JSON.stringify(baseline)) as WorkoutDraft;
  const corrections: SetCorrection[] = [];
  const rows = await db.getAllAsync<EventRow>("SELECT id, inputs_json, created_at, policy_version FROM decision_log WHERE decision_type = 'HISTORY_CORRECTION' AND accepted = 1 ORDER BY created_at, id");
  const events = rows.map(row => ({row, input: JSON.parse(row.inputs_json)})).filter(e => e.input.workoutId === workoutId);
  // Legacy events have no sequence. Keep their stable timestamp/id order before
  // explicitly sequenced events, independent of clock changes or backup row order.
  events.sort((a,b) => (a.input.sequence ?? 0) - (b.input.sequence ?? 0));
  for (const {row,input} of events) {
    const matches = actual.exercises.map((e,i) => e.exerciseId === input.exerciseId ? i : -1).filter(i => i >= 0);
    const exerciseIndex = input.exerciseIndex ?? (matches.length === 1 ? matches[0] : -1);
    const exercise = actual.exercises[exerciseIndex];
    const set = exercise?.sets[input.setIndex];
    // Never let a malformed or ambiguous legacy event change another set.
    if (!set || exercise?.exerciseId !== input.exerciseId || !Number.isInteger(input.setIndex) || !isRecordedSet(set)) throw new Error('Una corrección guardada no identifica una serie completada. El original se conserva.');
    correctionLoad(String(input.after?.load ?? ''));
    // Legacy correction editors accepted kg. Do not inherit the prescription unit.
    const corrected = canonicalSet({ ...set, loadUnit: undefined, ...input.after, load: String(input.after.load) });
    const load = correctionLoad(corrected.load);
    if (typeof input.reason !== 'string' || !input.reason.trim()) throw new Error('Una corrección guardada no tiene un motivo verificable.');
    corrections.push({id:row.id, order:corrections.length+1, exerciseId:input.exerciseId, exerciseIndex, setIndex:input.setIndex,
      originalLoad:baseline.exercises[exerciseIndex]!.sets[input.setIndex]!.load, beforeLoad:set.load, afterLoad:String(load), reason:input.reason, decidedAt:row.created_at});
    set.load = String(load);
    set.loadUnit = 'kg';
  }
  return {actual, corrections};
}
