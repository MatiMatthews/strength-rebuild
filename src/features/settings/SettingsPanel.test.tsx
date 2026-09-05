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
    await waitFor(() => expect(store.save).toHaveBeenCalledWith(expect.objectContaining({ equipment: ['Barra', 'Banco'] })));
  });
});


it('keeps an invalid requirement editable and only saves after explicit recovery', async () => {
  const saved = { ...defaultSettings, requirements: [{ kind: 'EXACT' as const, value: 'Sentadilla con barra' }] };
  const store = { load: jest.fn().mockResolvedValue(saved), save: jest.fn().mockResolvedValue(undefined) };
  const view = await render(<SettingsPanel store={store} />);
  await waitFor(() => expect(view.getByLabelText('Requisito EXACT').props.value).toBe('Sentadilla con barra'));
  await fireEvent.press(view.getByLabelText('Guardar configuración local'));
  expect(store.save).not.toHaveBeenCalled();
  expect(view.getByText(/Requisito 1/)).toBeTruthy();
  expect(view.getByLabelText('Requisito EXACT').props.value).toBe('Sentadilla con barra');
  await fireEvent.press(view.getByLabelText('Elegir Press banca para requisito 1'));
  await fireEvent.press(view.getByLabelText('Guardar configuración local'));
  await waitFor(() => expect(store.save).toHaveBeenCalledWith(expect.objectContaining({ requirements: [{ kind: 'EXACT', value: 'barbell-bench-press' }] })));
});
