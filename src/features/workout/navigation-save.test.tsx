import { act, fireEvent, render } from '@testing-library/react-native';
import type { ProgramService } from '@/application/programs/program-service';
import type { WorkoutDraft, WorkoutService } from '@/application/workouts/workout-service';
import { WorkoutReferenceScreen } from './WorkoutReferenceScreen';

jest.mock('@/design-system/v2.2/haptics', () => ({ playContractedHaptic: jest.fn() }));

it('waits for the latest edited draft before closing, prevents repeat navigation, and keeps failed saves editable', async () => {
  const draft: WorkoutDraft = { id: 'navigation', safetyModifications: [], exercises: [{ exerciseId: 'barbell-bench-press', originalExerciseId: 'barbell-bench-press', requirement: 'EXACT', sets: [{ load: '60', reps: '8', rir: '2', technique: 'Limpia', pain: 0, notes: '', completed: false, skipped: false, disposition: 'PENDING' }] }] };
  let reject!: (error: Error) => void;
  let finish!: () => void;
  const save = jest.fn(() => new Promise<void>((resolve, fail) => { finish = resolve; reject = fail; }));
  const close = jest.fn();
  const workouts = { startOrResume: jest.fn().mockResolvedValue(draft), saveDraftSnapshot: save, saveDraftSnapshotBeforeProcessStop: () => true, canComplete: () => false } as unknown as WorkoutService;
  const programs = { getToday: jest.fn().mockResolvedValue({ session: {} }) } as unknown as ProgramService;
  const screen = await render(<WorkoutReferenceScreen onClose={close} programs={programs} workouts={workouts} />);
  await screen.findByLabelText('Mostrar notas de la serie 1');
  await fireEvent.press(screen.getByLabelText('Mostrar notas de la serie 1'));
  await fireEvent.changeText(screen.getByLabelText('Notas de la serie 1'), 'Unsaved navigation draft');
  await fireEvent.press(screen.getByLabelText('Cerrar entrenamiento'));
  expect(close).not.toHaveBeenCalled();
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ exercises: [expect.objectContaining({ sets: [expect.objectContaining({ notes: 'Unsaved navigation draft' })] })] }));
  const count = save.mock.calls.length;
  await fireEvent.press(screen.getByLabelText('Cerrar entrenamiento'));
  expect(save).toHaveBeenCalledTimes(count);
  await act(async () => reject(new Error('Synthetic unavailable storage')));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 300)); });
  expect(save).toHaveBeenCalledTimes(count);
  expect(screen.getByRole('alert')).toHaveTextContent(/No se pudo guardar antes de salir/);
  expect(screen.getByLabelText('Notas de la serie 1').props.value).toBe('Unsaved navigation draft');
  await fireEvent.press(screen.getByLabelText('Cerrar entrenamiento'));
  await act(async () => finish());
  expect(close).toHaveBeenCalledTimes(1);
  expect(draft.exercises[0]!.sets[0]!.notes).toBe('');
});
