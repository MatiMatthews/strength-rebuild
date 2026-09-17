import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SettingsPanel } from './SettingsPanel';
import { defaultSettings } from './settings';

describe('SettingsPanel', () => {
  it('loads and persists offline settings', async () => {
    const store = { load: jest.fn().mockResolvedValue(defaultSettings), save: jest.fn().mockResolvedValue(undefined) };
    const view = await render(<SettingsPanel store={store} />);
    expect(view.getByTestId('settings-operational-tools')).toBeTruthy();
    expect(view.getByText('Configuración local')).toBeTruthy();
    await waitFor(() => expect(store.load).toHaveBeenCalled());
    await fireEvent.press(view.getByLabelText('Alternar equipo Mancuernas'));
    await fireEvent.press(view.getByLabelText('Guardar configuración local'));
    await waitFor(() => expect(store.save).toHaveBeenCalledWith(expect.objectContaining({ equipment: ['Barra', 'Banco'] }), defaultSettings));
  });
});


it('keeps an invalid requirement editable and only saves after explicit recovery', async () => {
  const saved = { ...defaultSettings, requirements: [{ kind: 'EXACT' as const, value: 'Sentadilla con barra' }] };
  const store = { load: jest.fn().mockResolvedValue(saved), save: jest.fn().mockResolvedValue(undefined) };
  const view = await render(<SettingsPanel store={store} />);
  await waitFor(() => expect(view.getByText('Valor guardado sin resolver: EXACT / Sentadilla con barra')).toBeTruthy());
  await fireEvent.press(view.getByLabelText('Guardar configuración local'));
  expect(store.save).not.toHaveBeenCalled();
  expect(view.getByText(/elige una opción del catálogo/)).toBeTruthy();
  expect(view.getByText('Valor guardado sin resolver: EXACT / Sentadilla con barra')).toBeTruthy();
  await fireEvent.press(view.getByLabelText('Elegir Press banca para requisito 1'));
  await fireEvent.press(view.getByLabelText('Guardar configuración local'));
  await waitFor(() => expect(store.save).toHaveBeenCalledWith(expect.objectContaining({ requirements: [{ kind: 'EXACT', value: 'barbell-bench-press' }] }), saved));
});


it('keeps decimal input intact and retries a failed atomic save', async () => {
  const store = { load: jest.fn().mockResolvedValue(defaultSettings), save: jest.fn().mockRejectedValueOnce(new Error('disk full')).mockResolvedValue(undefined) };
  const view = await render(<SettingsPanel store={store} />);
  await waitFor(() => expect(view.getByLabelText('Incremento 1').props.value).toBe('1.25'));
  await fireEvent.changeText(view.getByLabelText('Incremento 1'), '2,');
  expect(view.getByLabelText('Incremento 1').props.value).toBe('2,');
  await fireEvent.press(view.getByLabelText('Guardar configuración local'));
  expect(store.save).not.toHaveBeenCalled();
  await fireEvent.changeText(view.getByLabelText('Incremento 1'), '2,75');
  await fireEvent.press(view.getByLabelText('Guardar configuración local'));
  await waitFor(() => expect(view.getByText(/No se pudo guardar/)).toBeTruthy());
  expect(view.getByLabelText('Incremento 1').props.value).toBe('2,75');
  await fireEvent.press(view.getByLabelText('Guardar configuración local'));
  await waitFor(() => expect(view.getByText('Configuración guardada en este dispositivo.')).toBeTruthy());
  expect(store.save).toHaveBeenLastCalledWith(expect.objectContaining({ increments: [2.75, 2.5, 5] }), defaultSettings);
});

it('shows unsupported saved values until explicit recovery, with no writes on failure or abandonment', async () => {
  const saved = { ...defaultSettings, equipment: ['unknown-device'], requirements: [{ kind: 'UNKNOWN', value: 'power' }], restrictions: ['unknown-rule'] } as unknown as typeof defaultSettings;
  const store = { load: jest.fn().mockResolvedValue(saved), save: jest.fn().mockResolvedValue(undefined) };
  const view = await render(<SettingsPanel store={store} />);
  await waitFor(() => expect(view.getByText('Equipo guardado no compatible: unknown-device')).toBeTruthy());
  expect(view.getByText('Valor guardado sin resolver: UNKNOWN / power')).toBeTruthy();
  expect(view.getByText(/Restricción guardada no compatible: unknown-rule/)).toBeTruthy();
  await fireEvent.press(view.getByLabelText('Guardar configuración local'));
  expect(store.save).not.toHaveBeenCalled();
  await fireEvent.press(view.getByText('Quitar equipo guardado: unknown-device'));
  await fireEvent.press(view.getByLabelText('Usar solo peso corporal'));
  await fireEvent.press(view.getByLabelText('Tipo Ejercicio concreto para requisito 1'));
  await fireEvent.press(view.getByLabelText('Elegir Bird-dog para requisito 1'));
  await fireEvent.press(view.getByText('Quitar restricción guardada: unknown-rule'));
  expect(store.save).not.toHaveBeenCalled();
  await fireEvent.press(view.getByLabelText('Guardar configuración local'));
  await waitFor(() => expect(store.save).toHaveBeenCalledWith(expect.objectContaining({ equipment: ['bodyweight'], requirements: [{ kind: 'EXACT', value: 'bird-dog' }], restrictions: [] }), saved));
});
