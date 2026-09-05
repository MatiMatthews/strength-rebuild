import type { WorkoutDraft, WorkoutSetDraft } from './workout-service';

export interface SetDeletion {
  id: number;
  exerciseIndex: number;
  exerciseId: string;
  setIndex: number;
  set: WorkoutSetDraft;
  restored?: boolean;
}

// Keep the removed original in the canonical draft, including after completion.
// Undo inserts only that set, never restores an obsolete whole-workout snapshot.
export function deleteLastSet(draft: WorkoutDraft, exerciseIndex: number): WorkoutDraft {
  const exercise = draft.exercises[exerciseIndex];
  if (!exercise || exercise.sets.length <= 1) throw new Error('Conserva al menos una serie. Puedes omitirla con un motivo.');
  const deletions = draft.setDeletions ?? [];
  const deletion: SetDeletion = {
    id: deletions.length + 1, exerciseIndex, exerciseId: exercise.exerciseId,
    setIndex: exercise.sets.length - 1, set: { ...exercise.sets.at(-1)! },
  };
  return { ...draft, setDeletions: [...deletions, deletion], exercises: draft.exercises.map((item, index) =>
    index === exerciseIndex ? { ...item, sets: item.sets.slice(0, -1) } : item) };
}

export function undoSetDeletion(draft: WorkoutDraft, id: number): WorkoutDraft {
  const deletion = draft.setDeletions?.find((item) => item.id === id);
  if (!deletion || deletion.restored) return draft;
  const latest = draft.setDeletions?.filter((item) => !item.restored).at(-1);
  if (latest?.id !== id) throw new Error('Deshaz primero la eliminación más reciente.');
  const exercise = draft.exercises[deletion.exerciseIndex];
  if (!exercise || exercise.exerciseId !== deletion.exerciseId) throw new Error('Vuelve al ejercicio original antes de restaurar esta serie.');
  const sets = [...exercise.sets];
  sets.splice(deletion.setIndex, 0, { ...deletion.set });
  return { ...draft, setDeletions: draft.setDeletions!.map((item) => item.id === id ? { ...item, restored: true } : item),
    exercises: draft.exercises.map((item, index) => index === deletion.exerciseIndex ? { ...item, sets } : item) };
}
