import { validateLoadEntry } from './load-entry';
import type { WorkoutDraft, WorkoutSetDraft, WorkoutExerciseDraft } from './workout-service';
import type { TodayData } from '../programs/program-service';

type Unit = 'kg' | 'lb';
const poundsToKg = 0.45359237;
function unit(value: unknown): Unit | undefined {
  if (value === undefined) return undefined;
  if (value !== 'kg' && value !== 'lb') throw new Error('La unidad guardada no es verificable. El original se conserva.');
  return value;
}
function amount(value: unknown): number {
  if ((typeof value !== 'string' && typeof value !== 'number') || !/^\d+(?:[.,]\d+)?$/.test(String(value).trim())) throw new Error('La carga guardada no es verificable. El original se conserva.');
  const result = Number(String(value).trim().replace(',', '.'));
  if (!Number.isFinite(result)) throw new Error('La carga guardada no es finita.');
  return result;
}
// This is a projection, never a migration of original snapshot/event bytes.
// Only the generator's exact, arithmetically verified provenance is evidence.
// Edited legacy values and ambiguous/replaced exercises retain legacy kg semantics.
function prescriptionUnit(exercise: WorkoutExerciseDraft, set: WorkoutSetDraft, index: number, prescribed?: TodayData['session']): Unit | undefined {
  if (!prescribed || exercise.replacement || exercise.originalExerciseId !== exercise.exerciseId) return undefined;
  const entries = prescribed.blocks ? prescribed.blocks.filter(b => b.role !== 'finish-review').flatMap(b => b.exercises.map(e => ({ ...e, blockRole: b.role }))) : prescribed.exercises;
  const matches = entries.filter(e => e.exerciseId === exercise.exerciseId && (!prescribed.blocks || e.blockRole === exercise.blockRole));
  if (matches.length !== 1) return undefined;
  const source = matches[0]!;
  if (index >= source.target.sets || !('calculatedLoad' in source) || source.calculatedLoad !== amount(set.load)) return undefined;
  if ('loadUnit' in source && source.loadUnit !== undefined) return unit(source.loadUnit);
  const label = exercise.exerciseId === 'barbell-bench-press' ? 'bench press reference' : exercise.exerciseId === 'smith-box-squat' ? 'back squat reference' : undefined;
  if (!label || !('loadProvenance' in source) || typeof source.loadProvenance !== 'string') return undefined;
  const match = /^(bench press reference|back squat reference) (\d+(?:\.\d+)?) (kg|lb); training max reference; (\d+(?:\.\d+)?)%; rounded to (\d+(?:\.\d+)?)$/.exec(source.loadProvenance);
  if (!match || match[1] !== label) return undefined;
  const reference = Number(match[2]), percent = Number(match[4]), increment = Number(match[5]);
  if (![reference, percent, increment].every(Number.isFinite) || reference <= 0 || percent <= 0 || percent > 100 || increment <= 0) return undefined;
  if (Math.abs(Math.round(reference * percent / 100 / increment) * increment - Number(source.calculatedLoad)) > 1e-8) return undefined;
  return match[3] as Unit;
}
export function canonicalSet(set: WorkoutSetDraft, evidence?: Unit): WorkoutSetDraft {
  validateLoadEntry(set);
  const resolved = unit(set.loadUnit) ?? evidence ?? 'kg';
  if (set.load.trim() === '') return resolved === 'lb' ? { ...set, loadUnit: 'kg' } : { ...set };
  const value = amount(set.load);
  if (resolved === 'kg') return { ...set };
  return { ...set, load: String(Number((value * poundsToKg).toFixed(8))), loadUnit: 'kg' };
}
export function recoverWorkoutLoads(original: WorkoutDraft, prescribed?: TodayData['session']): WorkoutDraft {
  const result = JSON.parse(JSON.stringify(original)) as WorkoutDraft;
  result.exercises = result.exercises.map(exercise => ({ ...exercise, sets: exercise.sets.map((set, index) => canonicalSet(set,
    set.load.trim() && set.loadUnit === undefined && original.exercises.filter(e => e.exerciseId === exercise.exerciseId && (!prescribed?.blocks || e.blockRole === exercise.blockRole)).length === 1 ? prescriptionUnit(exercise, set, index, prescribed) : undefined)) }));
  // Undo must restore the same physical load as the visible/resumed draft.
  if (result.setDeletions) result.setDeletions = result.setDeletions.map(deletion => {
    const exercise = original.exercises[deletion.exerciseIndex];
    const evidence = exercise?.exerciseId === deletion.exerciseId && deletion.set.load.trim() && deletion.set.loadUnit === undefined
      && original.exercises.filter(e => e.exerciseId === exercise.exerciseId && (!prescribed?.blocks || e.blockRole === exercise.blockRole)).length === 1
      ? prescriptionUnit(exercise, deletion.set, deletion.setIndex, prescribed) : undefined;
    return { ...deletion, set: canonicalSet(deletion.set, evidence) };
  });
  return result;
}
