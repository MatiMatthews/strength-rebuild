import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import * as native from 'react-native';
import { AppText, FeedbackBanner, Tag } from './v2.2/primitives';
import { FeedbackBanner as CompatibleBanner } from './primitives';
import { useAppTheme } from './use-app-theme';
import { darkTheme, lightTheme } from './v2.2/tokens';

function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const rgb = hex.slice(1).match(/../g)!.map(v => parseInt(v, 16) / 255)
      .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
  };
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

for (const scheme of ['light', 'dark'] as const) describe(`${scheme} production content`, () => {
  const theme = scheme === 'dark' ? darkTheme : lightTheme;
  beforeEach(() => jest.spyOn(native, 'useColorScheme').mockReturnValue(scheme));
  afterEach(() => jest.restoreAllMocks());
  it('uses the canonical theme from the native hook', async () => {
    let actual: unknown;
    function Consumer() { actual = useAppTheme(); return null; }
    await render(<Consumer />);
    expect(actual).toBe(theme);
  });
  for (const Banner of [FeedbackBanner, CompatibleBanner]) it.each(['success', 'caution', 'danger'] as const)('renders readable %s notice text', async tone => {
    const screen = await render(<Banner message="Estado guardado" tone={tone} />);
    const foreground = StyleSheet.flatten(screen.getByText('Estado guardado').props.style).color;
    const background = StyleSheet.flatten(screen.getByRole('alert').props.style).backgroundColor;
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });
  it.each(['default', 'muted', 'accent', 'danger'] as const)('renders readable %s content on each theme surface', async color => {
    const screen = await render(<AppText color={color}>Contenido</AppText>);
    const foreground = StyleSheet.flatten(screen.getByText('Contenido').props.style).color;
    for (const background of [theme.canvas, theme.surface, theme.surfaceMuted]) {
      expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('keeps tag text readable on its explicit signal surface', async () => {
    const screen = await render(<Tag>Estado</Tag>);
    const text = screen.getByText('Estado');
    expect(contrast(StyleSheet.flatten(text.props.style).color, StyleSheet.flatten(text.parent!.props.style).backgroundColor)).toBeGreaterThanOrEqual(4.5);
  });
});
