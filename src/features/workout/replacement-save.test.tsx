import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ProgramService } from '@/application/programs/program-service';
import type { WorkoutDraft, WorkoutService } from '@/application/workouts/workout-service';
import { replaceExerciseDraft } from '@/application/workouts/exercise-replacement';
import { defaultSettings } from '@/features/settings/settings';
import { WorkoutReferenceScreen } from './WorkoutReferenceScreen';

it('keeps the original exercise on write failure and retries the same explicit replacement', async () => {
  const draft: WorkoutDraft = { id: 'save-replacement', activeExerciseIndex: 0, safetyModifications: [], exercises: [{ exerciseId: 'barbell-bench-press', originalExerciseId: 'barbell-bench-press', requirement: 'EXACT', sets: [{ load: '60', reps: '8', rir: '3', pain: 0, technique: 'Limpia', notes: 'Pending note', completed: false, skipped: false, disposition: 'PENDING' }] }] };
  let fail = true;
  const save = jest.fn(async (next: WorkoutDraft) => {
    if (fail && next.exercises[0]!.exerciseId === 'incline-dumbbell-press') { fail = false; throw new Error('Synthetic disk full'); }
  });
  const workouts = { startOrResume: jest.fn().mockResolvedValue(draft), listHistory: jest.fn().mockResolvedValue([]), replaceExercise: replaceExerciseDraft, saveDraftSnapshot: save, saveDraftSnapshotBeforeProcessStop: jest.fn().mockReturnValue(true), canComplete: () => false } as unknown as WorkoutService;
  const programs = { getToday: jest.fn().mockResolvedValue({ cycleType: 'reentry', session: {} }) } as unknown as ProgramService;
  const settingsStore = { load: jest.fn().mockResolvedValue({ ...defaultSettings, equipment: ['dumbbells', 'incline-bench'] }), save: jest.fn() };
  const view = await render(<WorkoutReferenceScreen workouts={workouts} programs={programs} settingsStore={settingsStore} onClose={jest.fn()} />);
  await view.findByLabelText('Reemplazar ejercicio');
  await fireEvent.press(view.getByLabelText('Reemplazar ejercicio'));
  await fireEvent.press(view.getByLabelText('Equipo no disponible'));
  await fireEvent.press(view.getByLabelText('Elegir Press inclinado con mancuernas'));
  await fireEvent.press(view.getByLabelText('Confirmar reemplazo'));
  await view.findByText('Synthetic disk full');
  expect(view.getByLabelText('Carga de la serie 1').props.value).toBe('60');
  expect(draft.exercises[0]!.exerciseId).toBe('barbell-bench-press');
  await fireEvent.press(view.getByLabelText('Confirmar reemplazo'));
  await waitFor(() => expect(view.getByLabelText('Carga de la serie 1').props.value).toBe(''));
  expect(view.getByLabelText('Ver instrucciones y guía del ejercicio Press inclinado con mancuernas')).toBeTruthy();
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ exercises: [expect.objectContaining({ originalExerciseId: 'barbell-bench-press', exerciseId: 'incline-dumbbell-press' })] }));
});
