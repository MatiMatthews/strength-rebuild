import type { WorkoutHistoryItem, WorkoutSetDraft } from '@/application/workouts/workout-service';
import type { ExerciseRecording } from '@/domain/prescriptions/measurement';

export function previousRecordedSets(history: readonly WorkoutHistoryItem[], exerciseId: string, recording?: ExerciseRecording): readonly WorkoutSetDraft[] {
  for (const session of [...history].sort((a, b) => b.completedAt.localeCompare(a.completedAt))) {
    const sets = session.actual.exercises.filter(exercise => exercise.exerciseId === exerciseId
      && (exercise.recording ?? 'load-reps') === (recording ?? 'load-reps'))
      .flatMap(exercise => exercise.sets).filter(set => set.disposition === 'COMPLETED');
    if (sets.length) return sets;
  }
  return [];
}
