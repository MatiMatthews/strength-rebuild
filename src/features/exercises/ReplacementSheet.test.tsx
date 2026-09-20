import { fireEvent, render } from '@testing-library/react-native';
import { ReplacementSheet } from './ReplacementSheet';
import { defaultSettings } from '../settings/settings';

it('requires confirmation for non-anchor alternatives and cancellation makes no change', async () => {
  const confirm = jest.fn();
  const view = await render(<ReplacementSheet exerciseId="bird-dog" requirement="CAPABILITY" onCancel={jest.fn()} onConfirm={confirm} settings={{ ...defaultSettings, equipment: ['bodyweight'] }} />);
  await fireEvent.press(view.getByLabelText('Quiero variar'));
  await fireEvent.press(view.getByLabelText('Elegir Dead bug'));
  expect(confirm).not.toHaveBeenCalled();
  expect(view.getByLabelText('Confirmar reemplazo')).toBeTruthy();
  await fireEvent.press(view.getByText('Revisar alternativas'));
  expect(confirm).not.toHaveBeenCalled();
  await fireEvent.press(view.getByLabelText('Elegir Dead bug'));
  await fireEvent.press(view.getByLabelText('Confirmar reemplazo'));
  expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ id: 'dead-bug' }), 'boredom');
});

it('requires an explicit incline bench and refreshes compatible alternatives when settings change', async () => {
  const props = { exerciseId: 'barbell-bench-press', requirement: 'EXACT' as const, onCancel: jest.fn(), onConfirm: jest.fn() };
  const view = await render(<ReplacementSheet {...props} settings={defaultSettings} />);
  await fireEvent.press(view.getByLabelText('Equipo no disponible'));
  expect(view.getByText('No hay alternativas compatibles')).toBeTruthy();
  expect(view.queryByLabelText('Elegir Press inclinado con mancuernas')).toBeNull();
  await view.rerender(<ReplacementSheet {...props} settings={{ ...defaultSettings, equipment: ['dumbbells', 'incline-bench'], restrictions: ['abdominal', 'sin impacto'] }} />);
  expect(view.getByLabelText('Elegir Press inclinado con mancuernas')).toBeTruthy();
  expect(props.onConfirm).not.toHaveBeenCalled();
});

it('filters the same Spanish safety restrictions as planning and fails closed for unknown values', async () => {
  const props = { exerciseId: 'bird-dog', requirement: 'CAPABILITY' as const, onCancel: jest.fn(), onConfirm: jest.fn() };
  const settings = { ...defaultSettings, equipment: ['bodyweight', 'bands'], restrictions: [] as string[] };
  const view = await render(<ReplacementSheet {...props} settings={settings} />);
  await fireEvent.press(view.getByLabelText('Quiero variar'));
  expect(view.getByLabelText('Elegir Dead bug')).toBeTruthy();
  for (const restriction of ['abdominal', 'unknown-restriction']) {
    await view.rerender(<ReplacementSheet {...props} settings={{ ...settings, restrictions: [restriction] }} />);
    expect(view.getByText('No hay alternativas compatibles')).toBeTruthy();
    expect(view.queryByLabelText('Elegir Dead bug')).toBeNull();
  }
  expect(props.onConfirm).not.toHaveBeenCalled();
});
