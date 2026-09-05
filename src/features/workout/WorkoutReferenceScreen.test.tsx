import { fireEvent, render } from '@testing-library/react-native';
import { readFileSync } from 'node:fs';

import type { ProgramService } from '@/application/programs/program-service';
import type { WorkoutDraft, WorkoutService } from '@/application/workouts/workout-service';

import { WorkoutReferenceScreen } from './WorkoutReferenceScreen';
import { playContractedHaptic } from '@/design-system/v2.2/haptics';

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(), notificationAsync: jest.fn(), NotificationFeedbackType: { Success: 'success' } }));
jest.mock('@/design-system/v2.2/haptics', () => ({ playContractedHaptic: jest.fn() }));

describe('Workout reference state', () => {
  it('identifies an unavailable exercise in a resumed draft without reassigning recorded work', async () => {
    const draft: WorkoutDraft = {
      id: 'legacy-active', safetyModifications: [],
      exercises: [{ exerciseId: 'missing-legacy', originalExerciseId: 'missing-legacy',
        requirement: 'EXACT', sets: [{ load: '80', reps: '8', rir: '2',
          technique: 'Limpia', pain: 0, notes: 'preserve', completed: true,
          skipped: false, disposition: 'COMPLETED' }] }],
    };
    const original = JSON.stringify(draft);
    const workouts = {
      startOrResume: jest.fn().mockResolvedValue(draft),
      saveDraftSnapshot: jest.fn().mockResolvedValue(undefined),
      canComplete: jest.fn().mockReturnValue(true),
      replaceExercise: jest.fn(),
    } as unknown as WorkoutService;
    const programs = { getToday: jest.fn().mockResolvedValue({ session: {} }) } as unknown as ProgramService;
    const screen = await render(<WorkoutReferenceScreen onClose={() => undefined} workouts={workouts} programs={programs} />);
    expect(await screen.findByText('Ejercicio no disponible en el catálogo')).toBeOnTheScreen();
    expect(screen.getByText(/No se puede sustituir una referencia desconocida en una sesión iniciada/)).toBeOnTheScreen();
    expect(screen.queryByLabelText('Reemplazar ejercicio')).toBeNull();
    expect(screen.getByLabelText('Carga de la serie 1').props.value).toBe('80');
    expect(JSON.stringify(draft)).toBe(original);
    expect(workouts.replaceExercise).not.toHaveBeenCalled();
  });

  it('keeps a failed omission draft editable and retries without changing the original', async () => {
    const draft: WorkoutDraft = { id: 'pending-omission', safetyModifications: [], exercises: [{
      exerciseId: 'barbell-bench-press', originalExerciseId: 'barbell-bench-press', requirement: 'EXACT', sets: [{ load: '60', reps: '8', rir: '2',
        technique: 'Limpia', pain: 0, notes: 'preserve', completed: false, skipped: false, disposition: 'PENDING' }],
    }] };
    const save = jest.fn().mockResolvedValue(undefined);
    const skipSet = jest.fn((current: WorkoutDraft, _exercise: number, _set: number, reason: string): WorkoutDraft => ({
      ...current, exercises: [{ ...current.exercises[0]!, sets: [{ ...current.exercises[0]!.sets[0]!,
        skipped: true, disposition: 'SKIPPED', skipReason: reason }] }],
    }));
    const workouts = { startOrResume: jest.fn().mockResolvedValue(draft), saveDraftSnapshot: save,
      canComplete: jest.fn().mockReturnValue(false), skipSet } as unknown as WorkoutService;
    const programs = { getToday: jest.fn().mockResolvedValue({ session: {} }) } as unknown as ProgramService;
    const screen = await render(<WorkoutReferenceScreen onClose={() => undefined} workouts={workouts} programs={programs} />);
    await screen.findByLabelText('Omitir serie 1');
    await fireEvent.press(screen.getByLabelText('Omitir serie 1'));
    await fireEvent.changeText(screen.getByLabelText('Motivo para omitir la serie 1'), 'Equipo ocupado');
    expect(skipSet).not.toHaveBeenCalled();
    save.mockRejectedValueOnce(new Error('disk full'));
    await fireEvent.press(screen.getByLabelText('Confirmar omisión de la serie 1'));
    expect(skipSet).toHaveBeenCalledTimes(1);
    expect(screen.getByText('No se pudo guardar la omisión. Inténtalo de nuevo.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Motivo para omitir la serie 1').props.value).toBe('Equipo ocupado');
    expect(screen.queryByText('OMITIDA')).toBeNull();
    save.mockResolvedValue(undefined);
    await fireEvent.press(screen.getByLabelText('Confirmar omisión de la serie 1'));
    expect(screen.getByText('OMITIDA')).toBeOnTheScreen();
    expect(draft.exercises[0]!.sets[0]!.disposition).toBe('PENDING');
  });

  it('keeps failed deletion available to cancel or retry and locks repeated confirmations', async () => {
    const set = { load: '60', reps: '8', rir: '2', technique: 'Limpia' as const, pain: 0,
      notes: 'Original', completed: true, skipped: false, disposition: 'COMPLETED' as const };
    const draft: WorkoutDraft = { id: 'delete', safetyModifications: [], exercises: [{ exerciseId: 'barbell-bench-press',
      originalExerciseId: 'barbell-bench-press', requirement: 'EXACT', sets: [{ ...set }, { ...set }] }] };
    const save = jest.fn().mockResolvedValue(undefined);
    const workouts = { startOrResume: jest.fn().mockResolvedValue(draft), saveDraftSnapshot: save,
      canComplete: jest.fn().mockReturnValue(true) } as unknown as WorkoutService;
    const programs = { getToday: jest.fn().mockResolvedValue({ session: {} }) } as unknown as ProgramService;
    const screen = await render(<WorkoutReferenceScreen onClose={() => undefined} programs={programs} workouts={workouts} />);
    await screen.findByLabelText('Quitar última serie');
    await fireEvent.press(screen.getByLabelText('Quitar última serie'));
    save.mockRejectedValueOnce(new Error('disk full'));
    await fireEvent.press(screen.getByLabelText('Confirmar eliminación'));
    expect(screen.getByRole('alert')).toHaveTextContent(/No se pudo guardar el cambio/);
    expect(draft.exercises[0]!.sets).toHaveLength(2);
    await fireEvent.press(screen.getByLabelText('Cancelar eliminación'));
    expect(screen.getByLabelText('Carga de la serie 2').props.value).toBe('60');
    await fireEvent.press(screen.getByLabelText('Quitar última serie'));
    await fireEvent.press(screen.getByLabelText('Confirmar eliminación'));
    expect(screen.queryByLabelText('Carga de la serie 2')).toBeNull();
    save.mockRejectedValueOnce(new Error('disk full'));
    await fireEvent.press(screen.getByLabelText('Deshacer eliminación'));
    expect(screen.queryByLabelText('Carga de la serie 2')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(/No se pudo guardar el cambio/);
    await fireEvent.press(screen.getByLabelText('Deshacer eliminación'));
    expect(screen.getByLabelText('Carga de la serie 2').props.value).toBe('60');
    expect(screen.queryByLabelText('Deshacer eliminación')).toBeNull();
  });

  it('keeps background autosave from overwriting an immediate text checkpoint', () => {
    const source = readFileSync(require.resolve('./WorkoutReferenceScreen'), 'utf8');
    expect(source).toContain('.saveDraftSnapshot(latestDraftRef.current ?? draft)');
    expect(source).toContain('AppState.addEventListener');
    expect(source).toContain('saveDraftSnapshotBeforeProcessStop(latestDraftRef.current)');
    expect(source).not.toContain('selectTextOnFocus');
  });

  it('exposes the focused exercise header and sequence rail as production structure', async () => {
    const screen = await render(<WorkoutReferenceScreen onClose={() => undefined} />);

    expect(screen.getByTestId('workout-sequence-rail')).toHaveAccessibilityValue({ min: 1, max: 1, now: 1 });
    expect(screen.getByTestId('workout-exercise-header')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Press banca' })).toBeOnTheScreen();
    expect(screen.queryByText('Ejercicio no disponible en el catálogo')).toBeNull();
  });

  it('keeps each active set value independently editable', async () => {
    const screen = await render(<WorkoutReferenceScreen onClose={() => undefined} />);
    const load = screen.getByLabelText('Carga de la serie 2');
    const reps = screen.getByLabelText('Repeticiones de la serie 2');

    await fireEvent.changeText(load, '22,5');
    await fireEvent.changeText(reps, '9');

    expect(screen.getByLabelText('Carga de la serie 2').props.value).toBe('22,5');
    expect(screen.getByLabelText('Repeticiones de la serie 2').props.value).toBe('9');
  });

  it('updates technique and optional discomfort without hiding the form', async () => {
    const screen = await render(<WorkoutReferenceScreen onClose={() => undefined} />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Regular, serie 1' }));
    expect(screen.getByRole('radio', { name: 'Regular, serie 1' }).props.accessibilityState).toEqual({ checked: true });

    await fireEvent.press(screen.getByLabelText('Aumentar molestia de la serie 1'));
    expect(screen.getByText('Molestia: 1/10')).toBeOnTheScreen();
    expect(screen.getByLabelText('Carga de la serie 2')).toBeOnTheScreen();
  });

  it('blocks completing a set at pain five and requires an explicit skip reason', async () => {
    const screen = await render(<WorkoutReferenceScreen onClose={() => undefined} />);
    for (let pain = 0; pain < 5; pain += 1) {
      await fireEvent.press(screen.getByLabelText('Aumentar molestia de la serie 1'));
    }

    expect(screen.getByLabelText('Completar serie 1').props.accessibilityState).toEqual({ disabled: true });
    await fireEvent.press(screen.getByLabelText('Omitir serie 1'));
    expect(screen.getByLabelText('Motivo para omitir la serie 1')).toBeOnTheScreen();
    expect(screen.getByLabelText('Confirmar omisión de la serie 1').props.accessibilityState).toEqual({ disabled: false });
  });

  it('adds and removes editable sets while remaining keyboard avoiding', async () => {
    const screen = await render(<WorkoutReferenceScreen onClose={() => undefined} />);
    await fireEvent.press(screen.getByLabelText('Añadir serie'));
    expect(screen.getByLabelText('Carga de la serie 4')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Quitar última serie'));
    await fireEvent.press(screen.getByLabelText('Confirmar eliminación'));
    expect(screen.queryByLabelText('Carga de la serie 4')).toBeNull();
    expect(screen.getByTestId('keyboard-avoiding-workout')).toBeOnTheScreen();
  });

  it('selects a replacement reason, explains compatible results, and confirms an anchor', async () => {
    const screen = await render(<WorkoutReferenceScreen onClose={() => undefined} />);

    await fireEvent.press(screen.getByLabelText('Reemplazar ejercicio'));
    expect(screen.getByText('¿Por qué necesitas un reemplazo?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('radio', { name: 'Equipo no disponible' }));

    expect(screen.getByText('Press inclinado con mancuernas')).toBeOnTheScreen();
    expect(screen.getByText('Mismo patrón: empuje horizontal')).toBeOnTheScreen();
    expect(screen.getAllByText('Instrucciones disponibles sin conexión').length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByLabelText('Elegir Press inclinado con mancuernas'));
    expect(screen.getByText('Confirma el cambio de ejercicio ancla')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Confirmar reemplazo'));

    expect(screen.getByRole('header', { name: 'Press inclinado con mancuernas' })).toBeOnTheScreen();
  });

  it('keeps the rest timer non-obscuring and requires finish confirmation', async () => {
    const screen = await render(<WorkoutReferenceScreen onClose={() => undefined} />);
    await fireEvent.press(screen.getByLabelText('Descanso 90 segundos'));
    expect(screen.getByLabelText(/Temporizador .* segundos/)).toBeOnTheScreen();
    expect(screen.getByLabelText('Carga de la serie 1')).toBeOnTheScreen();
    expect(screen.getByLabelText('Revisar y terminar entrenamiento').props.accessibilityState).toEqual({ disabled: true });
    await fireEvent.press(screen.getByLabelText('Completar serie 1'));
    await fireEvent.press(screen.getByLabelText('Completar serie 2'));
    await fireEvent.press(screen.getByLabelText('Omitir serie 3'));
    await fireEvent.changeText(screen.getByLabelText('Motivo para omitir la serie 3'), 'Molestia durante la serie');
    await fireEvent.press(screen.getByLabelText('Confirmar omisión de la serie 3'));
    await fireEvent.press(screen.getByLabelText('Revisar y terminar entrenamiento'));
    expect(screen.getByTestId('finish-review')).toBeOnTheScreen();
    expect(screen.getByLabelText('Confirmar fin de entrenamiento')).toBeOnTheScreen();
  });

  it('exposes stable set-entry and rest instruments without treating prefilled targets as complete', async () => {
    const screen = await render(<WorkoutReferenceScreen onClose={() => undefined} />);

    expect(screen.getByTestId('rest-dock')).toBeOnTheScreen();
    expect(screen.getAllByTestId('set-entry-row')).toHaveLength(3);
    expect(screen.getByLabelText('Revisar y terminar entrenamiento').props.accessibilityState).toEqual({ disabled: true });

    await fireEvent.press(screen.getByLabelText('Completar serie 1'));
    expect(playContractedHaptic).toHaveBeenCalledWith('setCompleted');
    expect(screen.getByText('COMPLETADA')).toBeOnTheScreen();
    expect(screen.getByLabelText('Revisar y terminar entrenamiento').props.accessibilityState).toEqual({ disabled: true });
  });
});
