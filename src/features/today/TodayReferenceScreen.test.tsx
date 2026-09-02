import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import type { TodayData } from '@/application/programs/program-service';
import { exerciseCatalog } from '@/data/seeds/exercises';

import { TodayReferenceScreen } from './TodayReferenceScreen';

const planned = {
  cycleId: 'strength-1', cycleType: 'strength', weekIndex: 1, dayIndex: 1,
  cycle: { schemaVersion: 1, policyVersion: 'cycle-prescription-v1', id: 'strength-1', type: 'strength', weeks: [{ index: 1, sessions: [] }] },
  session: { dayIndex: 1, exercises: [{ exerciseId: 'barbell-bench-press', requirement: 'EXACT', target: { sets: 3, reps: { min: 3, max: 6 }, rir: { min: 2, max: 3 }, loadPercent: { min: 75, max: 85 } }, qualityStops: [] }] },
} as TodayData;

describe('Today production states', () => {
  const settings = { onOpenSettings: jest.fn() };

  it('uses catalog names for warm-up and mobility instead of technical identifiers', async () => {
    const catalogEntries = exerciseCatalog.filter(({ pattern }) => pattern === 'activation' || pattern === 'mobility');
    const template = planned.session.exercises[0];
    if (!template) throw new Error('Expected a planned exercise');
    const data: TodayData = {
      ...planned,
      session: { ...planned.session, exercises: catalogEntries.map(({ id }) => ({ ...template, exerciseId: id })) },
    };
    const screen = await render(<TodayReferenceScreen {...settings} state={{ kind: 'planned', data }} onStartWorkout={jest.fn()} />);
    for (const [index, exercise] of catalogEntries.entries()) {
      expect(screen.getByText(exercise.name)).toBeOnTheScreen();
      expect(screen.getByLabelText(`Abrir ejercicio ${index + 1}: ${exercise.name}`)).toBeOnTheScreen();
      expect(screen.queryByText(exercise.id)).toBeNull();
    }
  });

  it('renders empty and no-workout states without a start action', async () => {
    const empty = await render(<TodayReferenceScreen {...settings} state={{ kind: 'empty' }} onStartWorkout={jest.fn()} />);
    expect(empty.getByText('Todavía no hay un plan activo')).toBeOnTheScreen();
    await empty.unmount();
    const rest = await render(<TodayReferenceScreen {...settings} state={{ kind: 'no-workout', nextSessionLabel: 'Miércoles' }} onStartWorkout={jest.fn()} />);
    expect(rest.getByText('Hoy no hay entrenamiento')).toBeOnTheScreen();
  });

  it('renders planned data and opens the readiness gate before starting', async () => {
    const onStart = jest.fn();
    const screen = await render(<TodayReferenceScreen {...settings} state={{ kind: 'planned', data: planned }} onStartWorkout={onStart} />);
    expect(screen.getByTestId('brand-masthead')).toBeOnTheScreen();
    expect(screen.getByTestId('cycle-progress-band')).toBeOnTheScreen();
    expect(screen.getByTestId('session-header')).toBeOnTheScreen();
    expect(screen.getByTestId('readiness-action-band')).toBeOnTheScreen();
    expect(screen.getByTestId('exercise-run-sheet')).toBeOnTheScreen();
    expect(StyleSheet.flatten(screen.getByTestId('brand-masthead').props.style).backgroundColor).toBe('#E7FF00');
    expect(screen.getAllByLabelText(/Abrir ejercicio/)).toHaveLength(1);
    expect(screen.getByText(/CICLO DE FUERZA/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Revisar preparación para entrenar'));
    expect(screen.getByText('Preparación de hoy')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Dolor de 0 a 2, estable'));
    await fireEvent.press(screen.getByLabelText('Confirmar preparación'));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ kind: 'resume', data: planned } as const, 'Continuar entrenamiento'],
    [{ kind: 'restriction', data: planned } as const, 'Restricción activa'],
    [{ kind: 'review-required' } as const, 'Revisión requerida antes de entrenar'],
  ])('renders the required %s state', async (state, expected) => {
    const screen = await render(<TodayReferenceScreen {...settings} state={state} onStartWorkout={jest.fn()} />);
    expect(screen.getByText(expected)).toBeOnTheScreen();
  });

  it.each([
    [{ kind: 'empty' } as const, 'Todavía no hay un plan activo'],
    [{ kind: 'no-workout', nextSessionLabel: 'Miércoles' } as const, 'Hoy no hay entrenamiento'],
    [{ kind: 'review-required' } as const, 'Revisión requerida antes de entrenar'],
  ])('keeps alternate state %s in the branded hierarchy', async (state, expected) => {
    const screen = await render(<TodayReferenceScreen {...settings} state={state} onStartWorkout={jest.fn()} />);
    expect(screen.getByTestId('brand-masthead')).toBeOnTheScreen();
    expect(screen.getByTestId('today-alternate-state').props.accessibilityLabel).toBe(expected);
  });

  it('wires the settings command instead of discarding it', async () => {
    const onOpenSettings = jest.fn();
    const screen = await render(<TodayReferenceScreen state={{ kind: 'empty' }} onOpenSettings={onOpenSettings} onStartWorkout={jest.fn()} />);
    await fireEvent.press(screen.getByLabelText('Abrir ajustes'));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});
