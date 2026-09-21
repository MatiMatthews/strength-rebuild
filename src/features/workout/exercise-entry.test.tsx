import { fireEvent, render } from '@testing-library/react-native';
import type { ProgramService } from '@/application/programs/program-service';
import type { WorkoutDraft, WorkoutService } from '@/application/workouts/workout-service';
import { WorkoutReferenceScreen } from './WorkoutReferenceScreen';

it('opens and persists the selected exercise only after the guarded start succeeds', async () => {
  const set = { load: '', reps: '8', rir: '3', technique: 'Limpia', pain: 0, notes: '', completed: false, skipped: false, disposition: 'PENDING' } as const;
  const draft: WorkoutDraft = { id: 'entry', safetyModifications: [], activeExerciseIndex: 0, exercises: ['barbell-bench-press', 'bird-dog', 'pallof-press'].map(exerciseId => ({ exerciseId, originalExerciseId: exerciseId, requirement: 'PATTERN', sets: [{ ...set }] })) };
  const programs = { getToday: jest.fn().mockResolvedValue({ sessionPlanId: 'entry', session: {} }) } as unknown as ProgramService;
  const save = jest.fn().mockResolvedValue(undefined);
  const workouts = { startOrResume: jest.fn().mockResolvedValue(draft), saveDraftSnapshot: save, canComplete: () => false } as unknown as WorkoutService;
  const screen = await render(<WorkoutReferenceScreen initialExerciseIndex={2} onClose={jest.fn()} programs={programs} workouts={workouts} requireReadiness />);
  expect(await screen.findByLabelText('Ver instrucciones y guía del ejercicio Press Pallof')).toBeTruthy();
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ activeExerciseIndex: 2, activeSetIndex: 0 }));
  expect(draft.activeExerciseIndex).toBe(0);
  await screen.rerender(<WorkoutReferenceScreen onClose={jest.fn()} programs={programs} workouts={workouts} requireReadiness />);
  expect(workouts.startOrResume).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Ver instrucciones y guía del ejercicio Press Pallof')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Ejercicio anterior'));
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ activeExerciseIndex: 1 }));
  expect(screen.getByLabelText('Ver instrucciones y guía del ejercicio Bird-dog')).toBeTruthy();
});
