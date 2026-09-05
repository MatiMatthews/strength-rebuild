import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import * as appTheme from '@/design-system/use-app-theme';
import { darkTheme, lightTheme } from '@/design-system/tokens';
import { palette } from '@/design-system/v2.2/tokens';

import { generateCycleSequence, InsufficientWorkoutError } from '@/domain/prescriptions/generator';

import { defaultSettings, type TrainingSettings } from '@/features/settings/settings';
import type { WeeklyReviewService } from '@/application/progression/weekly-review';

import { PlanReferenceScreen, type PlanPrograms } from './PlanReferenceScreen';

describe('PlanReferenceScreen', () => {
  afterEach(() => jest.restoreAllMocks());

  it('handles an inventory read failure without exposing write actions', async () => {
    const programs: PlanPrograms = {
      activateCycle: jest.fn(), createPlan: jest.fn(), previewLegacyReplacement: jest.fn(),
      listCycleSnapshots: jest.fn().mockResolvedValue([]), getActiveCycleId: jest.fn().mockResolvedValue(null),
      listInvalidSessionReferences: jest.fn().mockRejectedValue(new Error('synthetic inventory failure')),
    };
    const view = await render(<PlanReferenceScreen programs={programs} />);
    expect(view.getByText(/No se pudo cargar/)).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Crear vista previa del ciclo' }));
    expect(programs.createPlan).not.toHaveBeenCalled();
    expect(programs.activateCycle).not.toHaveBeenCalled();
  });

  it('refreshes weekly-review eligibility when returning to the same active cycle', async () => {
    const programs: PlanPrograms = {
      activateCycle: jest.fn(), createPlan: jest.fn(),
      listCycleSnapshots: jest.fn().mockResolvedValue(generateCycleSequence([{ id: 'active', type: 'strength', weeks: 2 }])),
      getActiveCycleId: jest.fn().mockResolvedValue('active'),
    };
    const reviews = { listPendingWeeks: jest.fn().mockResolvedValue([]) } as unknown as WeeklyReviewService;
    const view = await render(<PlanReferenceScreen programs={programs} reviews={reviews} onOpenReview={jest.fn()} focused />);
    expect(view.queryByRole('button', { name: 'Abrir revisión semanal' })).toBeNull();
    await view.rerender(<PlanReferenceScreen programs={programs} reviews={reviews} onOpenReview={jest.fn()} focused={false} />);
    jest.mocked(reviews.listPendingWeeks).mockResolvedValue([{ cycleId: 'active', weekIndex: 2 }]);
    await view.rerender(<PlanReferenceScreen programs={programs} reviews={reviews} onOpenReview={jest.fn()} focused />);
    expect(await view.findByRole('button', { name: 'Abrir revisión semanal' })).toBeTruthy();
    expect(reviews.listPendingWeeks).toHaveBeenLastCalledWith('active');
  });

  it('ignores a superseded focus read instead of restoring older settings', async () => {
    const pending = Promise.withResolvers<TrainingSettings>();
    const programs: PlanPrograms = {
      activateCycle: jest.fn(), createPlan: jest.fn().mockResolvedValue([]),
      listCycleSnapshots: jest.fn().mockResolvedValue([]), getActiveCycleId: jest.fn().mockResolvedValue(null),
    };
    const store = { load: jest.fn().mockReturnValue(pending.promise), save: jest.fn() };
    const view = await render(<PlanReferenceScreen programs={programs} settingsStore={store} focused />);
    await view.rerender(<PlanReferenceScreen programs={programs} settingsStore={store} focused={false} />);
    const latest = { ...defaultSettings, equipment: ['bodyweight'], restrictions: ['abdominal'] };
    store.load.mockResolvedValue(latest);
    await view.rerender(<PlanReferenceScreen programs={programs} settingsStore={store} focused />);
    await act(async () => { pending.resolve(defaultSettings); });
    await fireEvent.press(view.getByRole('button', { name: 'Crear vista previa del ciclo' }));
    expect(programs.createPlan).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ equipment: latest.equipment, restrictions: latest.restrictions }),
    ]));
  });

  it('waits for refreshed settings before allowing a new preview', async () => {
    const programs: PlanPrograms = {
      activateCycle: jest.fn(), createPlan: jest.fn().mockResolvedValue([]),
      listCycleSnapshots: jest.fn().mockResolvedValue([]), getActiveCycleId: jest.fn().mockResolvedValue(null),
    };
    const store = { load: jest.fn().mockResolvedValue(defaultSettings), save: jest.fn() };
    const view = await render(<PlanReferenceScreen programs={programs} settingsStore={store} focused />);
    await view.rerender(<PlanReferenceScreen programs={programs} settingsStore={store} focused={false} />);
    const refreshed = { ...defaultSettings, equipment: ['bodyweight'], restrictions: ['abdominal'],
      requirements: [{ kind: 'EXACT' as const, value: 'bird-dog' }] };
    const pending = Promise.withResolvers<TrainingSettings>();
    store.load.mockReturnValue(pending.promise);
    await view.rerender(<PlanReferenceScreen programs={programs} settingsStore={store} focused />);
    await fireEvent.press(view.getByRole('button', { name: 'Crear vista previa del ciclo' }));
    expect(programs.createPlan).not.toHaveBeenCalled();
    await act(async () => { pending.resolve(refreshed); });
    await fireEvent.press(view.getByRole('button', { name: 'Crear vista previa del ciclo' }));
    expect(programs.createPlan).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ equipment: ['bodyweight'], restrictions: ['abdominal'], requirements: refreshed.requirements }),
    ]));
  });

  it('does not reopen stale repair choices while the refreshed inventory is pending', async () => {
    const reference = { cycleId: 'legacy', sessionPlanId: 'future', weekIndex: 1, dayIndex: 1, invalidExerciseIds: ['missing'], unstarted: true };
    const inventory = jest.fn().mockResolvedValue([reference]);
    const programs: PlanPrograms = {
      activateCycle: jest.fn(), createPlan: jest.fn(), previewLegacyReplacement: jest.fn(),
      listCycleSnapshots: jest.fn().mockResolvedValue([]), getActiveCycleId: jest.fn().mockResolvedValue('legacy'),
      listInvalidSessionReferences: inventory,
    };
    const view = await render(<PlanReferenceScreen programs={programs} focused />);
    await fireEvent.press(await view.findByRole('button', { name: 'Revisar referencias de semana 1, sesión 1' }));
    await view.rerender(<PlanReferenceScreen programs={programs} focused={false} />);
    const pending = Promise.withResolvers<readonly typeof reference[]>();
    inventory.mockReturnValue(pending.promise);
    await view.rerender(<PlanReferenceScreen programs={programs} focused />);
    expect(view.queryByRole('button', { name: 'Revisar referencias de semana 1, sesión 1' })).toBeNull();
    expect(view.queryByLabelText('Buscar ejercicio compatible')).toBeNull();
    await act(async () => { pending.resolve([{ ...reference, unstarted: false }]); });
    expect(view.queryByRole('button', { name: 'Revisar referencias de semana 1, sesión 1' })).toBeNull();
    expect(programs.previewLegacyReplacement).not.toHaveBeenCalled();
  });

  it('fails closed after a settings read error and recovers on a later focus', async () => {
    const programs: PlanPrograms = {
      activateCycle: jest.fn(), createPlan: jest.fn().mockResolvedValue([]),
      listCycleSnapshots: jest.fn().mockResolvedValue([]), getActiveCycleId: jest.fn().mockResolvedValue(null),
    };
    const store = { load: jest.fn().mockRejectedValue(new Error('synthetic read failure')), save: jest.fn() };
    const view = await render(<PlanReferenceScreen programs={programs} settingsStore={store} focused />);
    await fireEvent.press(view.getByRole('button', { name: 'Crear vista previa del ciclo' }));
    expect(programs.createPlan).not.toHaveBeenCalled();
    expect(view.getByText(/No se pudo cargar/)).toBeTruthy();
    await view.rerender(<PlanReferenceScreen programs={programs} settingsStore={store} focused={false} />);
    store.load.mockResolvedValue(defaultSettings);
    await view.rerender(<PlanReferenceScreen programs={programs} settingsStore={store} focused />);
    await fireEvent.press(view.getByRole('button', { name: 'Crear vista previa del ciclo' }));
    expect(programs.createPlan).toHaveBeenCalledTimes(1);
    expect(view.queryByText(/No se pudo cargar/)).toBeNull();
  });

  it('keeps the newly reviewed preview selected across navigation instead of activating an older draft', async () => {
    const older = generateCycleSequence([{ id: 'older', type: 'strength', weeks: 1 }]);
    const latest = generateCycleSequence([{ id: 'latest', type: 'reentry', weeks: 1 }]);
    const inventory = jest.fn().mockResolvedValue(older);
    const programs: PlanPrograms = {
      activateCycle: jest.fn().mockResolvedValue(undefined), createPlan: jest.fn().mockResolvedValue(latest),
      listCycleSnapshots: inventory, getActiveCycleId: jest.fn().mockResolvedValue(null),
    };
    const view = await render(<PlanReferenceScreen programs={programs} focused />);
    await fireEvent.press(view.getByRole('button', { name: 'Crear vista previa del ciclo' }));
    await view.findByRole('button', { name: /Semana 1 de Reentrada/ });
    await view.rerender(<PlanReferenceScreen programs={programs} focused={false} />);
    inventory.mockResolvedValue([...older, ...latest]);
    await view.rerender(<PlanReferenceScreen programs={programs} focused />);
    await fireEvent.press(view.getByRole('button', { name: 'Activar plan confirmado' }));
    expect(programs.activateCycle).toHaveBeenCalledWith('latest');
  });

  it('refreshes recorded-session protection when returning to Plan', async () => {
    const reference = { cycleId: 'legacy', sessionPlanId: 'future', weekIndex: 1, dayIndex: 1, invalidExerciseIds: ['missing'], unstarted: true };
    const inventory = jest.fn().mockResolvedValue([reference]);
    const programs: PlanPrograms = {
      activateCycle: jest.fn(), createPlan: jest.fn(), previewLegacyReplacement: jest.fn(),
      listCycleSnapshots: jest.fn().mockResolvedValue([]), getActiveCycleId: jest.fn().mockResolvedValue('legacy'),
      listInvalidSessionReferences: inventory,
    };
    const view = await render(<PlanReferenceScreen programs={programs} focused />);
    await view.findByRole('button', { name: 'Revisar referencias de semana 1, sesión 1' });
    await view.rerender(<PlanReferenceScreen programs={programs} focused={false} />);
    inventory.mockResolvedValue([{ ...reference, unstarted: false }]);
    await view.rerender(<PlanReferenceScreen programs={programs} focused />);
    await view.findByText('Sesiones iniciadas o cerradas con referencias originales: 1. No se sustituye el trabajo registrado.');
    expect(view.queryByRole('button', { name: 'Revisar referencias de semana 1, sesión 1' })).toBeNull();
    expect(programs.createPlan).not.toHaveBeenCalled();
    expect(programs.activateCycle).not.toHaveBeenCalled();
    expect(programs.previewLegacyReplacement).not.toHaveBeenCalled();
  });

  it('reloads compatible choices after returning from settings without writing plans', async () => {
    const programs: PlanPrograms = {
      activateCycle: jest.fn(), createPlan: jest.fn(), previewLegacyReplacement: jest.fn(),
      listCycleSnapshots: jest.fn().mockResolvedValue([]), getActiveCycleId: jest.fn().mockResolvedValue('legacy'),
      listInvalidSessionReferences: jest.fn().mockResolvedValue([
        { cycleId: 'legacy', sessionPlanId: 'future', weekIndex: 1, dayIndex: 1, invalidExerciseIds: ['missing'], unstarted: true },
      ]),
    };
    const store = { load: jest.fn().mockResolvedValue(defaultSettings), save: jest.fn() };
    const view = await render(<PlanReferenceScreen programs={programs} settingsStore={store} focused />);
    await fireEvent.press(await view.findByRole('button', { name: 'Revisar referencias de semana 1, sesión 1' }));
    expect(view.queryByRole('button', { name: 'Ver propuesta Press Pallof para missing' })).toBeNull();
    await view.rerender(<PlanReferenceScreen programs={programs} settingsStore={store} focused={false} />);
    store.load.mockResolvedValue({ ...defaultSettings, equipment: [...defaultSettings.equipment, 'Bandas'] });
    await view.rerender(<PlanReferenceScreen programs={programs} settingsStore={store} focused />);
    await fireEvent.press(await view.findByRole('button', { name: 'Revisar referencias de semana 1, sesión 1' }));
    expect(await view.findByRole('button', { name: 'Ver propuesta Press Pallof para missing' })).toBeTruthy();
    expect(store.save).not.toHaveBeenCalled();
    expect(programs.createPlan).not.toHaveBeenCalled();
    expect(programs.activateCycle).not.toHaveBeenCalled();
  });

  it('warns about invalid sessions before expanding weeks and separates recorded work', async () => {
    const programs: PlanPrograms = {
      activateCycle: jest.fn(), createPlan: jest.fn(),
      previewLegacyReplacement: jest.fn().mockResolvedValue({ exerciseId: 'barbell-bench-press', target: { sets: 3, reps: { min: 3, max: 6 }, rir: { min: 2, max: 3 } } }),
      listCycleSnapshots: jest.fn().mockResolvedValue([]),
      getActiveCycleId: jest.fn().mockResolvedValue('legacy'),
      listInvalidSessionReferences: jest.fn().mockResolvedValue([
        { cycleId: 'legacy', sessionPlanId: 'future', weekIndex: 1, dayIndex: 1, invalidExerciseIds: ['missing'], unstarted: true },
        { cycleId: 'legacy', sessionPlanId: 'started', weekIndex: 1, dayIndex: 2, invalidExerciseIds: ['missing'], unstarted: false },
      ]),
    };
    const onOpenSettings = jest.fn();
    const view = await render(<PlanReferenceScreen programs={programs} onOpenSettings={onOpenSettings} />);
    await view.findByText('Hay ejercicios fuera del catálogo en tu plan guardado.');
    expect(view.getByText('Sesiones sin iniciar que necesitan revisión antes de entrenar: 1.')).toBeTruthy();
    expect(view.getByText('Sesiones iniciadas o cerradas con referencias originales: 1. No se sustituye el trabajo registrado.')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Revisar referencias de semana 1, sesión 1' }));
    expect(view.queryByRole('button', { name: 'Revisar referencias de semana 1, sesión 2' })).toBeNull();
    await fireEvent.changeText(view.getByLabelText('Buscar ejercicio compatible'), 'sin coincidencias');
    await fireEvent.press(view.getByRole('button', { name: 'Revisar equipo y restricciones' }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(programs.previewLegacyReplacement).not.toHaveBeenCalled();
    await fireEvent.changeText(view.getByLabelText('Buscar ejercicio compatible'), '');
    await fireEvent.press(view.getByRole('button', { name: 'Ver propuesta Press banca para missing' }));
    await view.findByText('Propuesta: Press banca');
    expect(view.getByText('3 series · 3–6 repeticiones · RIR 2–3')).toBeTruthy();
    expect(view.getByText('Instrucciones locales: Press banca')).toBeTruthy();
    expect(view.getByText('Apoya cabeza, espalda y pies.')).toBeTruthy();
    expect(view.getByText('Baja con control y empuja sin perder los apoyos.')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Elegir otra propuesta' }));
    expect(view.queryByText('Instrucciones locales: Press banca')).toBeNull();
    await fireEvent.press(view.getByRole('button', { name: 'Ver propuesta Press banca para missing' }));
    await view.findByText('Instrucciones locales: Press banca');
    expect(view.getByText('Carga por definir; no se transfiere la carga del ejercicio desconocido.')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Cancelar revisión de referencias' }));
    expect(view.queryByText('Propuesta: Press banca')).toBeNull();
    expect(programs.activateCycle).not.toHaveBeenCalled();
    expect(programs.createPlan).not.toHaveBeenCalled();
  });


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
