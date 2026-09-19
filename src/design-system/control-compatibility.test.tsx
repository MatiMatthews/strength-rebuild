import { fireEvent, render } from '@testing-library/react-native';
import { Settings } from 'lucide-react-native';
import { StyleSheet, Text } from 'react-native';
import * as legacy from './primitives';
import * as current from './v2.2/primitives';
import { AppMasthead, ChoiceControl, CommandButton, FocusedSheet, IconCommand, TrainingField } from './v2.2/components';

for (const [path, controls] of [['compatibility', legacy], ['current', current]] as const) {
  describe(`${path} controls`, () => {
    it('preserves command callbacks, busy guards, decimal drafts and close requests', async () => {
      const press = jest.fn(), change = jest.fn(), dismiss = jest.fn();
      const { ActionButton, AppSheet, TextField } = controls;
      const screen = await render(<><ActionButton onPress={press}>Guardar</ActionButton><ActionButton busy onPress={press}>Ocupado</ActionButton><TextField label="Carga" value="60," onChangeText={change} /><AppSheet visible title="Decisión" onDismiss={dismiss}><ActionButton onPress={press}>Confirmar</ActionButton></AppSheet></>);
      await fireEvent.press(screen.getByText('Guardar')); expect(press).toHaveBeenCalledTimes(1);
      await fireEvent.press(screen.getByText('Ocupado')); expect(press).toHaveBeenCalledTimes(1);
      await fireEvent.changeText(screen.getByLabelText('Carga'), '60,5'); expect(change).toHaveBeenCalledWith('60,5');
      await fireEvent.press(screen.getByLabelText('Cerrar Decisión')); expect(dismiss).toHaveBeenCalledTimes(1);
      await fireEvent(screen.getByRole('dialog', { name: 'Decisión' }).parent!.parent!, 'requestClose'); expect(dismiss).toHaveBeenCalledTimes(2);
      expect(StyleSheet.flatten(screen.getByText('Guardar').props.style).fontFamily).toBe('Barlow-Bold');
    });
  });
}
it('brand adapters retain labels, checked state, callbacks and sheet dismissal', async () => {
  const press = jest.fn(), dismiss = jest.fn(), change = jest.fn();
  const screen = await render(<><CommandButton onPress={press}>Guardar</CommandButton><IconCommand icon={Settings} label="Ajustes" onPress={press} /><ChoiceControl label="Elegido" selected onPress={press} /><TrainingField label="Carga" value="1," unit="kg" onChangeText={change} /><FocusedSheet visible title="Decisión" onDismiss={dismiss}><Text>Contenido</Text></FocusedSheet></>);
  for (const label of ['Guardar', 'Ajustes', 'Elegido']) await fireEvent.press(screen.getByRole(label === 'Elegido' ? 'radio' : 'button', { name: label }));
  expect(press).toHaveBeenCalledTimes(3);
  expect(screen.getByRole('radio').props.accessibilityState.checked).toBe(true);
  await fireEvent.changeText(screen.getByLabelText('Carga'), '1,25'); expect(change).toHaveBeenCalledWith('1,25');
  await fireEvent.press(screen.getByText('Cerrar')); expect(dismiss).toHaveBeenCalledTimes(1);
  await fireEvent(screen.getByRole('dialog', { name: 'Decisión' }).parent!.parent!, 'requestClose'); expect(dismiss).toHaveBeenCalledTimes(2);
});
it.each(['screen', 'task'] as const)('uses the same fixed %s typography regardless of translated title length', async role => {
  const screen = await render(<><AppMasthead role={role} title="HOY" /><AppMasthead role={role} title="ENTRENAMIENTO Y RECUPERACIÓN" /></>);
  const short = StyleSheet.flatten(screen.getByText('HOY').props.style), long = StyleSheet.flatten(screen.getByText('ENTRENAMIENTO Y RECUPERACIÓN').props.style);
  expect(long).toEqual(short); expect(short.fontSize).toBe(role === 'screen' ? 28 : 22); expect(short.letterSpacing).toBe(0);
});
