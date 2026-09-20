import { replaceExerciseDraft } from './exercise-replacement';
import type { WorkoutDraft } from './workout-service';

function draft(): WorkoutDraft {
  return { id: 'replacement-test', activeSetIndex: 1, safetyModifications: [], exercises: [{ exerciseId: 'barbell-bench-press', originalExerciseId: 'barbell-bench-press', requirement: 'EXACT', recording: 'load-reps', blockRole: 'primary', sets: Array.from({ length: 2 }, () => ({ load: '80', reps: '99', rir: '0', pain: 0, technique: 'Limpia', notes: 'Original pending draft', disposition: 'PENDING', completed: false, skipped: false })) }] };
}

it('rebuilds pending targets without transferring entered load, effort or notes between movements', () => {
  const original = draft();
  const replaced = replaceExerciseDraft(original, 0, 'incline-dumbbell-press', 'equipment-unavailable', { type: 'reentry' });
  expect(replaced.activeSetIndex).toBe(0);
  expect(replaced.exercises[0]).toMatchObject({ exerciseId: 'incline-dumbbell-press', originalExerciseId: 'barbell-bench-press', recording: 'load-reps', blockRole: 'primary', replacement: { fromExerciseId: 'barbell-bench-press', reason: 'equipment-unavailable' } });
  expect(replaced.exercises[0]!.sets).toHaveLength(2);
  expect(replaced.exercises[0]!.sets[0]).toMatchObject({ load: '', reps: '8', rir: '5', notes: '', completed: false, disposition: 'PENDING' });
  expect(original.exercises[0]!.sets[0]!.load).toBe('80');
});

it.each(['COMPLETED', 'SKIPPED'] as const)('never reattributes %s work', disposition => {
  const original = draft();
  original.exercises[0]!.sets[0] = { ...original.exercises[0]!.sets[0]!, disposition, completed: disposition === 'COMPLETED', skipped: disposition === 'SKIPPED' };
  const before = JSON.stringify(original);
  expect(() => replaceExerciseDraft(original, 0, 'incline-dumbbell-press', 'other')).toThrow('trabajo registrado');
  expect(JSON.stringify(original)).toBe(before);
});

it('clears the old measurement and initializes the actual replacement measurement', () => {
  const replaced = replaceExerciseDraft(draft(), 0, 'bodyweight-activation', 'other');
  expect(replaced.exercises[0]).toMatchObject({ recording: 'seconds', sets: [expect.objectContaining({ load: '', reps: '', seconds: '60' }), expect.anything()] });
});

it('cannot clear symptoms or bypass a deleted set by replacing the movement', () => {
  const original = draft();
  original.exercises[0]!.sets[0]!.pain = 5;
  expect(() => replaceExerciseDraft(original, 0, 'incline-dumbbell-press', 'discomfort')).toThrow('seguridad');
  original.exercises[0]!.sets[0]!.pain = 0;
  original.setDeletions = [{ id: 1, exerciseIndex: 0, exerciseId: 'barbell-bench-press', setIndex: 2, set: original.exercises[0]!.sets[0]! }];
  expect(() => replaceExerciseDraft(original, 0, 'incline-dumbbell-press', 'other')).toThrow('eliminadas');
});

it('uses only the replacement own known reference, not the displaced exercise load', () => {
  const replaced = replaceExerciseDraft(draft(), 0, 'smith-box-squat', 'other', { type: 'strength', profile: { backSquatReference: 100, units: 'kg', availableIncrement: 2.5 } });
  expect(replaced.exercises[0]!.sets[0]).toMatchObject({ load: '80', loadUnit: 'kg', reps: '5' });
  expect(replaced.exercises[0]!.loadProvenance).toContain('back squat reference');
  expect(() => replaceExerciseDraft(draft(), 0, 'not-in-the-catalog', 'other')).toThrow();
});
