import { fireEvent, render } from '@testing-library/react-native';
import * as native from 'react-native';
import { StyleSheet } from 'react-native';
import { X } from 'lucide-react-native';
import * as current from './v2.2/primitives';
import * as compatible from './primitives';
import { darkTheme, lightTheme } from './v2.2/tokens';

function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const rgb = hex.slice(1).match(/../g)!.map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return rgb[0]! * .2126 + rgb[1]! * .7152 + rgb[2]! * .0722;
  };
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
for (const scheme of ['light', 'dark'] as const) describe(`${scheme} navigation controls`, () => {
  beforeEach(() => jest.spyOn(native, 'useColorScheme').mockReturnValue(scheme));
  afterEach(() => jest.restoreAllMocks());
  const theme = scheme === 'light' ? lightTheme : darkTheme;
  for (const { ActionButton, IconButton, ProgressBar } of [current, compatible]) {
    it.each(['primary', 'secondary', 'danger'] as const)('keeps disabled %s commands readable without enabling activation', async tone => {
      const press = jest.fn();
      const screen = await render(<ActionButton disabled onPress={press} tone={tone}>Volver</ActionButton>);
      const style = StyleSheet.flatten(screen.getByRole('button').props.style);
      const foreground = StyleSheet.flatten(screen.getByText('Volver').props.style).color;
      expect(contrast(foreground, style.backgroundColor)).toBeGreaterThanOrEqual(4.5);
      expect(style.opacity).toBe(1);
      expect(contrast(style.borderColor, theme.surface)).toBeGreaterThanOrEqual(3);
      await fireEvent.press(screen.getByRole('button'));
      expect(press).not.toHaveBeenCalled();
    });
    it('keeps a busy close command disabled with a readable boundary', async () => {
      const press = jest.fn();
      const screen = await render(<IconButton accessibilityLabel="Cerrar" icon={X} disabled onPress={press} />);
      const button = screen.getByLabelText('Cerrar');
      const style = StyleSheet.flatten(button.props.style);
      expect(style.opacity).toBe(1);
      expect(contrast(style.borderColor, style.backgroundColor)).toBeGreaterThanOrEqual(3);
      await fireEvent.press(button);
      expect(press).not.toHaveBeenCalled();
    });
    it('keeps a selected disabled icon readable on its signal surface', async () => {
      let foreground = '';
      const InspectIcon = ({ color }: { color: string }) => { foreground = color; return null; };
      const screen = await render(<IconButton accessibilityLabel="Seleccionado" icon={InspectIcon as unknown as typeof X} selected disabled onPress={() => undefined} />);
      const style = StyleSheet.flatten(screen.getByLabelText('Seleccionado').props.style);
      expect(contrast(foreground, style.backgroundColor)).toBeGreaterThanOrEqual(3);
    });
    it('preserves passing progress colors and exposes the actual bounded progress', async () => {
      const screen = await render(<ProgressBar accessibilityLabel="Sesión" progress={.25} />);
      const bar = screen.getByRole('progressbar');
      const track = StyleSheet.flatten(bar.props.style);
      const child = bar.children[0];
      if (!child || typeof child === 'string') throw new Error('Missing progress fill');
      const fill = StyleSheet.flatten(child.props.style);
      expect(contrast(fill.backgroundColor, track.backgroundColor)).toBeGreaterThanOrEqual(3);
      expect(bar.props['aria-valuenow']).toBe(25);
      expect(fill.width).toBe('25%');
    });
  }
});
