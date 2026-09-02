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
