export type ExerciseRecording = 'load-reps' | 'bodyweight-reps' | 'reps-per-side' | 'seconds';

export function recordingForExercise(exerciseId: string): ExerciseRecording {
  if (exerciseId === 'bodyweight-activation') return 'seconds';
  if (['dead-bug', 'bird-dog', 'pallof-press'].includes(exerciseId)) return 'reps-per-side';
  if (['strict-pull-up', 'low-volume-jump', 'thoracic-mobility', 'hip-mobility', 'shoulder-mobility', 'session-review'].includes(exerciseId)) return 'bodyweight-reps';
  return 'load-reps';
}

type MeasuredPrescription = {
  readonly recording?: ExerciseRecording;
  readonly target: { readonly sets: number; readonly reps: { readonly min: number; readonly max: number }; readonly seconds?: number };
};

export function prescriptionQuantity(exercise: MeasuredPrescription): string {
  const { target, recording } = exercise;
  if (recording === 'seconds') return `${target.sets} series · ${target.seconds ?? '?'} segundos`;
  return `${target.sets} series · ${target.reps.min}–${target.reps.max} repeticiones${recording === 'reps-per-side' ? ' por lado' : ''}`;
}

export function validRecordedQuantity(recording: ExerciseRecording | undefined, set: { reps: string; seconds?: string }): boolean {
  // Unversioned snapshots retain their original interpretation and validation.
  if (!recording) return true;
  const value = recording === 'seconds' ? set.seconds : set.reps;
  return typeof value === 'string' && /^\d+$/.test(value.trim()) && Number(value) > 0 && Number.isSafeInteger(Number(value));
}
