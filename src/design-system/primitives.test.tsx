import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { ActionButton, AppSheet, FeedbackBanner, IconButton, TextField } from './primitives';
import { Settings } from 'lucide-react-native';

describe('design-system controls', () => {
  it('keeps command targets at least 48 dp tall', async () => {
    const primary = await render(<ActionButton onPress={() => undefined}>Comenzar</ActionButton>);
    const primaryStyle = StyleSheet.flatten(primary.getByRole('button').props.style);
    expect(primaryStyle.minHeight).toBeGreaterThanOrEqual(48);

    const icon = await render(
      <IconButton accessibilityLabel="Ajustes" icon={Settings} onPress={() => undefined} />,
    );
    const iconStyle = StyleSheet.flatten(icon.getByRole('button').props.style);
    expect(iconStyle.height).toBeGreaterThanOrEqual(48);
    expect(iconStyle.width).toBeGreaterThanOrEqual(48);
  });

  it('exposes labels and invokes commands', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <IconButton accessibilityLabel="Ajustes" icon={Settings} onPress={onPress} />,
    );
    await fireEvent.press(screen.getByLabelText('Ajustes'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('provides accessible fields, feedback, and modal sheets', async () => {
    const onChangeText = jest.fn();
    const onDismiss = jest.fn();
    const screen = await render(
      <>
        <TextField label="Carga" onChangeText={onChangeText} value="42.5" />
        <FeedbackBanner message="Guardado sin conexión" tone="success" />
        <AppSheet onDismiss={onDismiss} title="Elegir ejercicio" visible>
          <ActionButton onPress={() => undefined}>Seleccionar</ActionButton>
        </AppSheet>
      </>,
    );

    await fireEvent.changeText(screen.getByLabelText('Carga'), '45');
    expect(onChangeText).toHaveBeenCalledWith('45');
    expect(screen.getByRole('alert')).toHaveTextContent('Guardado sin conexión');
    expect(screen.getByRole('dialog', { name: 'Elegir ejercicio' })).toBeTruthy();
    expect(screen.getByLabelText('Cerrar Elegir ejercicio')).toBeTruthy();
  });
});
