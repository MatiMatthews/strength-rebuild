import type { WorkoutHistoryItem } from '@/application/workouts/workout-service';
import { previousRecordedSets } from './previous-performance';

const history = (id: string, completedAt: string, exerciseId: string, disposition: string, load: string) => ({
  id, completedAt, actual: { exercises: [{ exerciseId, originalExerciseId: 'barbell-bench-press', sets: [{ load, reps: '8', disposition }] }] },
}) as unknown as WorkoutHistoryItem;

it('uses the latest completed actual exercise, not its original identity or pending targets', () => {
  const older = history('older', '2026-01-01', 'barbell-bench-press', 'COMPLETED', '55');
  const newer = history('newer', '2026-01-02', 'barbell-bench-press', 'COMPLETED', '57.5');
  const replacement = history('replacement', '2026-01-03', 'incline-dumbbell-press', 'COMPLETED', '20');
  const pending = history('pending', '2026-01-04', 'barbell-bench-press', 'PENDING', '80');
  expect(previousRecordedSets([older, replacement, pending, newer], 'barbell-bench-press')).toEqual(newer.actual.exercises[0]!.sets);
  expect(previousRecordedSets([pending], 'barbell-bench-press')).toEqual([]);
  expect(previousRecordedSets([replacement], 'incline-dumbbell-press')).toEqual(replacement.actual.exercises[0]!.sets);
});

it('does not interpret legacy repetitions as seconds or per-side quantities', () => {
  const legacy = history('legacy', '2026-01-03', 'bodyweight-activation', 'COMPLETED', '0');
  const timed = history('timed', '2026-01-01', 'bodyweight-activation', 'COMPLETED', '');
  timed.actual.exercises[0]!.recording = 'seconds';
  timed.actual.exercises[0]!.sets[0]!.seconds = '40';
  expect(previousRecordedSets([legacy, timed], 'bodyweight-activation', 'seconds')).toEqual(timed.actual.exercises[0]!.sets);
  expect(previousRecordedSets([legacy], 'bodyweight-activation', 'reps-per-side')).toEqual([]);
});
