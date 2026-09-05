import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import * as appTheme from '@/design-system/use-app-theme';
import { darkTheme, lightTheme } from '@/design-system/tokens';
import { palette } from '@/design-system/v2.2/tokens';

import { generateCycleSequence, InsufficientWorkoutError } from '@/domain/prescriptions/generator';

import { PlanReferenceScreen, type PlanPrograms } from './PlanReferenceScreen';

describe('PlanReferenceScreen', () => {
  afterEach(() => jest.restoreAllMocks());

  it('explains insufficient work and retains preview inputs and the saved plan', async () => {
    const cycles = generateCycleSequence([{ id: 'existing', type: 'strength', weeks: 1 }]);
    const programs: PlanPrograms = {
      activateCycle: jest.fn(), createPlan: jest.fn().mockRejectedValue(new InsufficientWorkoutError(3)),
      listCycleSnapshots: jest.fn().mockResolvedValue(cycles),
      getActiveCycleId: jest.fn().mockResolvedValue(null),
    };
    const onOpenSettings = jest.fn();
    const view = await render(<PlanReferenceScreen programs={programs} onOpenSettings={onOpenSettings} />);
    await view.findByRole('button', { name: /Semana 1 de Fuerza/ });
    await fireEvent.changeText(view.getByLabelText('Semanas de hipertrofia'), '3');
    await fireEvent.press(view.getByRole('button', { name: 'Crear vista previa del ciclo' }));
    await view.findByText(new InsufficientWorkoutError(3).message);
    expect(view.getByLabelText('Semanas de hipertrofia').props.value).toBe('3');
    expect(view.getByRole('button', { name: /Semana 1 de Fuerza/ })).toBeTruthy();
    expect(programs.activateCycle).not.toHaveBeenCalled();
    await fireEvent.press(view.getByRole('button', { name: 'Abrir configuración del plan' }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it.each([lightTheme, darkTheme])('keeps program and transition rows readable when dark=$dark', async (theme) => {
    jest.spyOn(appTheme, 'useAppTheme').mockReturnValue(theme);
    const programs: PlanPrograms = {
      activateCycle: jest.fn(),
      createPlan: jest.fn(),
      getActiveCycleId: jest.fn().mockResolvedValue('strength'),
      listCycleSnapshots: jest.fn().mockResolvedValue([
        { id: 'strength', type: 'strength', weeks: [{ index: 1, sessions: [] }] },
        { id: 'transition', type: 'transition', weeks: [{ index: 1, sessions: [] }] },
      ]),
    };
    const view = await render(<PlanReferenceScreen programs={programs} />);
    const title = await view.findByText('Fuerza');
    const ordinal = view.getAllByText('01')[0];
    const transitionSummary = view.getAllByText('0 sesiones · toca para ver detalles')[1];
    if (!ordinal || !transitionSummary) throw new Error('Expected both program rows');
    expect(StyleSheet.flatten(title.props.style).color).toBe(theme.text);
    expect(StyleSheet.flatten(ordinal.props.style).color).toBe(theme.text);
    expect(StyleSheet.flatten(view.getByText('ACTIVO').props.style).color).toBe(theme.textMuted);
    expect(StyleSheet.flatten(view.getByText('Transición obligatoria').props.style).color).toBe(palette.ink);
    expect(StyleSheet.flatten(transitionSummary.props.style).color).toBe(palette.steel);
  });

  it('shows catalog names and persisted targets for all blocks before activation', async () => {
    const cycles = generateCycleSequence([{ id: 'preview', type: 'reentry', weeks: 1 }]);
    const programs: PlanPrograms = {
      activateCycle: jest.fn(), createPlan: jest.fn(),
      listCycleSnapshots: jest.fn().mockResolvedValue(cycles),
      getActiveCycleId: jest.fn().mockResolvedValue(null),
    };
    const view = await render(<PlanReferenceScreen programs={programs} />);
    await fireEvent.press(await view.findByRole('button', { name: /Semana 1 de Reentrada/ }));
    expect(view.getAllByText('Activación general').length).toBe(3);
    expect(view.getAllByText('Press banca').length).toBeGreaterThan(0);
    expect(view.getAllByText('2 series · 5–10 repeticiones · RIR 4–5').length).toBeGreaterThan(0);
    expect(view.getAllByText('Carga por definir').length).toBeGreaterThan(0);
    expect(view.queryByText('session-review')).toBeNull();
    expect(programs.activateCycle).not.toHaveBeenCalled();
  });

  it('keeps stored load units and exposes missing catalog entries without inventing names', async () => {
    const cycles = generateCycleSequence([{ id: 'preview', type: 'strength', weeks: 1,
      profile: { units: 'lb', benchPressReference: 100, backSquatReference: 100, deadliftReference: 100, strictPullUpCapacity: 5, availableIncrement: 5 },
    }]);
    const stored = JSON.parse(JSON.stringify(cycles));
    stored[0].weeks[0].sessions[0].blocks[0].exercises[0].exerciseId = 'missing-legacy-id';
    const programs: PlanPrograms = {
      activateCycle: jest.fn(), createPlan: jest.fn(),
      listCycleSnapshots: jest.fn().mockResolvedValue(stored),
      getActiveCycleId: jest.fn().mockResolvedValue(null),
    };
    const view = await render(<PlanReferenceScreen programs={programs} />);
    await fireEvent.press(await view.findByRole('button', { name: /Semana 1 de Fuerza/ }));
    expect(view.getAllByText('80 lb').length).toBeGreaterThan(0);
    expect(view.queryByText('80 kg')).toBeNull();
    expect(view.getByText('Ejercicio no disponible: missing-legacy-id')).toBeTruthy();
    expect(view.queryByText('Ejercicio guardado')).toBeNull();
  });

  it('previews an editable cycle with mandatory transition, expands sessions, and confirms activation', async () => {
    const programs: PlanPrograms = {
      activateCycle: jest.fn().mockResolvedValue(undefined),
      createPlan: jest.fn().mockResolvedValue([
        { id: 'hypertrophy-draft', type: 'hypertrophy', weeks: [{ index: 1, sessions: [{ dayIndex: 1, exercises: [{ exerciseId: 'barbell-bench-press' }] }] }] },
        { id: 'hypertrophy-draft--to--strength-draft', type: 'transition', weeks: [{ index: 1, sessions: [] }] },
        { id: 'strength-draft', type: 'strength', weeks: [{ index: 1, sessions: [] }] },
      ]),
      listCycleSnapshots: jest.fn().mockResolvedValue([]),
      getActiveCycleId: jest.fn().mockResolvedValue(null),
    };
    const view = await render(<PlanReferenceScreen programs={programs} />);

    await fireEvent.changeText(view.getByLabelText('Semanas de hipertrofia'), '3');
    await fireEvent.press(view.getByRole('button', { name: 'Crear vista previa del ciclo' }));
    await view.findByText('Transición obligatoria');
    expect(programs.createPlan).toHaveBeenCalledWith([
      { id: 'reentry-draft', type: 'reentry', weeks: 2 },
      { id: 'hypertrophy-draft', type: 'hypertrophy', weeks: 3 },
      { id: 'strength-draft', type: 'strength', weeks: 4 },
      { id: 'power-draft', type: 'power', weeks: 2 },
    ]);

    await fireEvent.press(view.getByRole('button', { name: /Semana 1 de Hipertrofia/ }));
    expect(view.getByTestId('program-rail')).toBeTruthy();
    expect(view.getByTestId('transition-block')).toBeTruthy();
    expect(view.getAllByText('BORRADOR').length).toBeGreaterThan(0);
    expect(view.getByText('Día 1 · 1 ejercicio')).toBeTruthy();
    expect(programs.activateCycle).not.toHaveBeenCalled();
    await fireEvent.press(view.getByRole('button', { name: 'Activar plan confirmado' }));
    await waitFor(() => expect(programs.activateCycle).toHaveBeenCalledWith('hypertrophy-draft'));
    expect(view.getByText('Plan activo')).toBeTruthy();
    expect(view.getAllByText('ACTIVO').length).toBeGreaterThan(0);
    expect(view.getByText('Próxima decisión: revisión semanal')).toBeTruthy();
  });
});
