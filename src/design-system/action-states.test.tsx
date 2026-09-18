import { fireEvent, render } from '@testing-library/react-native';
import * as native from 'react-native';
import { StyleSheet } from 'react-native';
import { X } from 'lucide-react-native';
import * as current from './v2.2/primitives';
import * as compatible from './primitives';
import { CommandButton, IconCommand, StatusActionBand } from './v2.2/components/brand-primitives';
import { darkTheme, lightTheme } from './v2.2/tokens';

function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const c = hex.slice(1).match(/../g)!.map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return c[0]! * .2126 + c[1]! * .7152 + c[2]! * .0722;
  };
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
for (const scheme of ['light', 'dark'] as const) describe(`${scheme} action states`, () => {
  beforeEach(() => jest.spyOn(native, 'useColorScheme').mockReturnValue(scheme));
  afterEach(() => jest.restoreAllMocks());
  const theme = scheme === 'light' ? lightTheme : darkTheme;
  for (const { ActionButton } of [current, compatible]) {
    it('announces busy, preserves radio selection and blocks activation', async () => {
      const press = jest.fn();
      const screen = await render(<ActionButton busy accessibilityRole="radio" checked onPress={press}>Guardar</ActionButton>);
      const control = screen.getByRole('radio');
      expect(control.props.accessibilityState).toMatchObject({ busy: true, checked: true, disabled: true });
      await fireEvent.press(control); expect(press).not.toHaveBeenCalled();
    });
    it.each(['primary', 'secondary', 'danger'] as const)('keeps normal and pressed %s labels and boundaries readable', async tone => {
      const screen = await render(<ActionButton onPress={() => undefined} tone={tone}>Guardar</ActionButton>);
      const button = screen.getByRole('button');
      for (const pressed of [false, true]) {
        await fireEvent(button, pressed ? 'pressIn' : 'pressOut');
        const style = StyleSheet.flatten(button.props.style);
        expect(contrast(StyleSheet.flatten(screen.getByText('Guardar').props.style).color, style.backgroundColor)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(style.borderColor, theme.canvas)).toBeGreaterThanOrEqual(3);
        expect(style.opacity ?? 1).toBe(1);
      }
    });
  }
  it.each(['command', 'icon', 'status'] as const)('gives the %s brand action a visible boundary on the canvas', async kind => {
    const screen = await render(kind === 'command' ? <CommandButton onPress={() => undefined}>Guardar</CommandButton> : kind === 'icon' ? <IconCommand icon={X} label="Cerrar" onPress={() => undefined} /> : <StatusActionBand actionLabel="Abrir" onAction={() => undefined} title="Estado" />);
    const style = StyleSheet.flatten(screen.getByRole('button').props.style);
    expect(contrast(style.borderColor ?? style.backgroundColor, theme.canvas)).toBeGreaterThanOrEqual(3);
  });
  it('keeps a disabled brand command legible and prevents activation', async () => {
    const press = jest.fn();
    const screen = await render(<CommandButton disabled onPress={press}>Guardar</CommandButton>);
    const style = StyleSheet.flatten(screen.getByRole('button').props.style);
    expect(contrast(StyleSheet.flatten(screen.getByText('Guardar').props.style).color, style.backgroundColor)).toBeGreaterThanOrEqual(4.5);
    expect(style.backgroundColor).toBe(theme.surfaceMuted);
    await fireEvent.press(screen.getByRole('button'));
    expect(press).not.toHaveBeenCalled();
  });
});
