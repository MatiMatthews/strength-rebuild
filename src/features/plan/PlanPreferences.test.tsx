import { fireEvent, render } from '@testing-library/react-native';
import { generateCycleSequence } from '@/domain/prescriptions/generator';
import { defaultSettings, type TrainingSettings } from '@/features/settings/settings';
import { PlanReferenceScreen, type PlanPrograms } from './PlanReferenceScreen';

function programs(): PlanPrograms {
  return { listCycleSnapshots: jest.fn().mockResolvedValue(generateCycleSequence([{ id: 'active', type: 'strength', weeks: 4 }])),
    getActiveCycleId: jest.fn().mockResolvedValue('active'), createPlan: jest.fn(), activateCycle: jest.fn() };
}

it('refreshes an active-plan preview from saved preferences without creating or activating plans', async () => {
  const service = programs();
  const store = { load: jest.fn().mockResolvedValue(defaultSettings), save: jest.fn() };
  const view = await render(<PlanReferenceScreen programs={service} settingsStore={store} focused />);
  await fireEvent.press(view.getByRole('button', { name: 'Ver vista previa de preferencias' }));
  expect(view.getByRole('button', { name: 'Lunes, vista previa de preferencias' })).toBeOnTheScreen();
  await view.rerender(<PlanReferenceScreen programs={service} settingsStore={store} focused={false} />);
  const changed: TrainingSettings = { ...defaultSettings, schedule: [2, 4, 6], referenceSources: { benchPressReference: 'user' }, profileUnit: 'kg', profile: { benchPressReference: 60.5 } };
  store.load.mockResolvedValue(changed);
  await view.rerender(<PlanReferenceScreen programs={service} settingsStore={store} focused />);
  expect(view.queryByRole('button', { name: 'Lunes, vista previa de preferencias' })).toBeNull();
  await fireEvent.press(view.getByRole('button', { name: 'Ver vista previa de preferencias' }));
  await fireEvent.press(view.getByRole('button', { name: 'Martes, vista previa de preferencias' }));
  expect(view.getAllByText('48.75 kg')[0]).toBeOnTheScreen();
  expect(service.createPlan).not.toHaveBeenCalled();
  expect(service.activateCycle).not.toHaveBeenCalled();
  expect(store.save).not.toHaveBeenCalled();
});

it('hides a stale preview when refreshed preferences cannot be loaded', async () => {
  const service = programs();
  const store = { load: jest.fn().mockResolvedValue(defaultSettings), save: jest.fn() };
  const view = await render(<PlanReferenceScreen programs={service} settingsStore={store} focused />);
  await fireEvent.press(view.getByRole('button', { name: 'Ver vista previa de preferencias' }));
  await view.rerender(<PlanReferenceScreen programs={service} settingsStore={store} focused={false} />);
  store.load.mockRejectedValue(new Error('Synthetic load failure'));
  await view.rerender(<PlanReferenceScreen programs={service} settingsStore={store} focused />);
  expect(view.queryByRole('button', { name: 'Lunes, vista previa de preferencias' })).toBeNull();
  expect(view.getByRole('button', { name: 'Ver vista previa de preferencias' })).toBeDisabled();
  expect(view.getByText(/No se pudo cargar el plan/)).toBeOnTheScreen();
});
