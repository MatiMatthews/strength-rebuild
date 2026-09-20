import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ProgramService } from '@/application/programs/program-service';
import type { WorkoutDraft, WorkoutService } from '@/application/workouts/workout-service';

import { WorkoutReferenceScreen } from './WorkoutReferenceScreen';

describe('compact workout logger', () => {
  it('keeps quantities reachable while expanding only one set and notes on demand', async () => {
    const view = await render(<WorkoutReferenceScreen onClose={jest.fn()} />);
    expect(view.getByLabelText('Carga de la serie 1')).toBeOnTheScreen();
    expect(view.getByLabelText('Carga de la serie 2')).toBeOnTheScreen();
    expect(view.getByLabelText('RIR de la serie 1')).toBeOnTheScreen();
    expect(view.queryByLabelText('RIR de la serie 2')).toBeNull();
    expect(view.queryByLabelText('Notas de la serie 1')).toBeNull();
    await fireEvent.press(view.getByLabelText('Editar serie 2'));
    expect(view.queryByLabelText('RIR de la serie 1')).toBeNull();
    expect(view.getByLabelText('RIR de la serie 2')).toBeOnTheScreen();
    await fireEvent.press(view.getByLabelText('Mostrar notas de la serie 2'));
    await fireEvent.changeText(view.getByLabelText('Notas de la serie 2'), 'A controlled set');
    await fireEvent.press(view.getByLabelText('Editar serie 1'));
    await fireEvent.press(view.getByLabelText('Editar serie 2'));
    expect(view.getByLabelText('Notas de la serie 2')).toHaveDisplayValue('A controlled set');
  });

  it('places the command dock outside scrolling content', async () => {
    const view = await render(<WorkoutReferenceScreen onClose={jest.fn()} />);
    const dock = view.getByTestId('workout-command-bar');
    let ancestor = dock.parent;
    while (ancestor) {
      expect(typeof ancestor.type === 'string' && ancestor.type.includes('ScrollView')).toBe(false);
      ancestor = ancestor.parent;
    }
  });

  it('reviews early completion without marking untouched sets omitted or completed', async () => {
    const onClose = jest.fn();
    const view = await render(<WorkoutReferenceScreen onClose={onClose} />);
    expect(view.getByLabelText('Revisar y terminar entrenamiento')).toBeDisabled();
    await fireEvent.press(view.getByLabelText('Completar serie 1'));
    expect(view.getByLabelText('Revisar y terminar entrenamiento')).toBeEnabled();
    await fireEvent.press(view.getByLabelText('Revisar y terminar entrenamiento'));
    expect(view.getByText(/1 completada.*0 omitidas.*2 pendientes/)).toBeOnTheScreen();
    expect(onClose).not.toHaveBeenCalled();
    await fireEvent.press(view.getByText('Seguir entrenando'));
    expect(view.getByLabelText('Carga de la serie 2')).toHaveDisplayValue('20');
    expect(view.queryByText('OMITIDA')).toBeNull();
  });

  it('undoes completion without clearing the recorded quantities or notes', async () => {
    const view = await render(<WorkoutReferenceScreen onClose={jest.fn()} />);
    await fireEvent.changeText(view.getByLabelText('Carga de la serie 1'), '62.5');
    await fireEvent.press(view.getByLabelText('Completar serie 1'));
    await fireEvent.press(view.getByLabelText('Deshacer completado de la serie 1'));
    expect(view.queryByText('COMPLETADA')).toBeNull();
    expect(view.getByLabelText('Carga de la serie 1')).toHaveDisplayValue('62.5');
    expect(view.getByLabelText('Revisar y terminar entrenamiento')).toBeDisabled();
  });

  it.each(['seconds', 'bodyweight-reps', 'reps-per-side'] as const)('shows %s fields from persisted measurement metadata', async recording => {
    const exerciseId = recording === 'seconds' ? 'bodyweight-activation' : recording === 'reps-per-side' ? 'dead-bug' : 'strict-pull-up';
    const draft: WorkoutDraft = { id: 'measurements', safetyModifications: [], exercises: [{ exerciseId, originalExerciseId: exerciseId, requirement: 'CAPABILITY', recording,
      sets: [{ load: '', reps: recording === 'seconds' ? '' : '6', ...(recording === 'seconds' ? { seconds: '45' } : {}), rir: '3', technique: 'Limpia', pain: 0, notes: '', completed: false, skipped: false, disposition: 'PENDING' }] }] };
    const workouts = { startOrResume: jest.fn().mockResolvedValue(draft), saveDraftSnapshot: jest.fn().mockResolvedValue(undefined), canComplete: () => false } as unknown as WorkoutService;
    const programs = { getToday: jest.fn().mockResolvedValue({ session: {} }) } as unknown as ProgramService;
    const view = await render(<WorkoutReferenceScreen onClose={jest.fn()} workouts={workouts} programs={programs} />);
    await view.findByLabelText(`${recording === 'seconds' ? 'Segundos' : 'Repeticiones'} de la serie 1`);
    expect(view.queryByLabelText('Carga de la serie 1')).toBeNull();
    if (recording === 'reps-per-side') expect(view.getByText('Reps / lado')).toBeOnTheScreen();
  });

  it('keeps the early-finish review open on write failure and prevents duplicate confirmation', async () => {
    const set = { load: '60', reps: '8', rir: '3', technique: 'Limpia' as const, pain: 0, notes: 'Retained', completed: true, skipped: false, disposition: 'COMPLETED' as const };
    const draft: WorkoutDraft = { id: 'early', safetyModifications: [], exercises: [{ exerciseId: 'barbell-bench-press', originalExerciseId: 'barbell-bench-press', requirement: 'EXACT', sets: [set, { ...set, completed: false, disposition: 'PENDING' }] }] };
    let reject!: (error: Error) => void;
    const complete = jest.fn().mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; })).mockResolvedValue({});
    const save = jest.fn().mockResolvedValue(undefined);
    const workouts = { startOrResume: jest.fn().mockResolvedValue(draft), saveDraftSnapshot: save, complete, canComplete: () => false, canFinishEarly: () => true } as unknown as WorkoutService;
    const programs = { getToday: jest.fn().mockResolvedValue({ session: {} }) } as unknown as ProgramService;
    const close = jest.fn();
    const view = await render(<WorkoutReferenceScreen onClose={close} workouts={workouts} programs={programs} />);
    await view.findByLabelText('Revisar y terminar entrenamiento');
    await fireEvent.press(view.getByLabelText('Revisar y terminar entrenamiento'));
    const confirmation = fireEvent.press(view.getByLabelText('Confirmar fin de entrenamiento'));
    await waitFor(() => expect(view.getByLabelText('Confirmar fin de entrenamiento')).toBeDisabled());
    await fireEvent.press(view.getByLabelText('Confirmar fin de entrenamiento'));
    expect(complete).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(draft);
    await act(async () => { reject(new Error('Storage unavailable')); await confirmation; });
    expect(close).not.toHaveBeenCalled();
    expect(view.getByRole('alert')).toHaveTextContent('No se pudo terminar la sesión. Tu registro sigue disponible; vuelve a intentar o sigue entrenando.');
    expect(draft.exercises[0]!.sets[1]!.disposition).toBe('PENDING');
    await fireEvent.press(view.getByLabelText('Confirmar fin de entrenamiento'));
    expect(complete).toHaveBeenLastCalledWith(draft, { finishEarly: true });
    expect(close).toHaveBeenCalledTimes(1);
  });
});
