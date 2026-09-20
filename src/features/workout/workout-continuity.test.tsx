import { act, fireEvent, render } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import type { ProgramService } from '@/application/programs/program-service';
import type { WorkoutDraft, WorkoutService } from '@/application/workouts/workout-service';
import { WorkoutReferenceScreen } from './WorkoutReferenceScreen';

it('offers opt-in rest and exposes pause, add and skip without completing another set', async () => {
  const view = await render(<WorkoutReferenceScreen onClose={jest.fn()} />);
  const toggle = view.getByRole('switch', { name: 'Descanso automático al completar una serie' });
  await fireEvent(toggle, 'valueChange', true);
  await fireEvent.press(view.getByLabelText('Completar serie 1'));
  expect(view.getByTestId('mini-rest-timer')).toBeOnTheScreen();
  await fireEvent.press(view.getByLabelText('Pausar descanso'));
  await fireEvent.press(view.getByLabelText('Añadir 30 segundos al descanso'));
  expect(view.getByTestId('mini-rest-timer')).toHaveTextContent('Descanso 02:00');
  await fireEvent.press(view.getByLabelText('Omitir descanso'));
  expect(view.queryByTestId('mini-rest-timer')).toBeNull();
  expect(view.getAllByText('COMPLETADA')).toHaveLength(1);
});

it('revalidates the persisted safety guard on foreground without navigating or losing the draft', async () => {
  let listener!: (state: AppStateStatus) => void;
  const subscription = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => { listener = handler; return { remove: jest.fn() }; });
  const draft: WorkoutDraft = { id: 'resume', activeExerciseIndex: 0, activeSetIndex: 1, safetyModifications: [], exercises: [{ exerciseId: 'barbell-bench-press', originalExerciseId: 'barbell-bench-press', requirement: 'EXACT', sets: Array.from({ length: 2 }, () => ({ load: '40', reps: '8', rir: '3', technique: 'Limpia', pain: 0, notes: 'Retained', completed: false, skipped: false, disposition: 'PENDING' })) }] };
  const save = jest.fn().mockResolvedValue(undefined);
  const workouts = { startOrResume: jest.fn().mockResolvedValue(draft), saveDraftSnapshot: save, saveDraftSnapshotBeforeProcessStop: jest.fn().mockReturnValue(true), canComplete: () => false } as unknown as WorkoutService;
  const programs = { getToday: jest.fn().mockResolvedValue({ session: {} }) } as unknown as ProgramService;
  const close = jest.fn();
  const view = await render(<WorkoutReferenceScreen workouts={workouts} programs={programs} onClose={close} />);
  await view.findByLabelText('RIR de la serie 2');
  await act(async () => { listener('background'); listener('active'); });
  expect(save).toHaveBeenCalledWith(draft);
  expect(close).not.toHaveBeenCalled();
  expect(view.getByLabelText('RIR de la serie 2')).toBeOnTheScreen();
  save.mockRejectedValue(new Error('La preparación guardada requiere revisión'));
  await act(async () => { listener('background'); listener('active'); });
  expect(view.getByText('La preparación guardada requiere revisión')).toBeOnTheScreen();
  expect(draft.exercises[0]!.sets[1]!.notes).toBe('Retained');
  await view.unmount();
  subscription.mockRestore();
});
