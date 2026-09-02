import { darkTheme, lightTheme, palette } from './tokens';

function luminance(hex: string) {
  const values = hex
    .slice(1)
    .match(/.{2}/g)
    ?.map((part) => Number.parseInt(part, 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  if (!values || values.length !== 3) throw new Error(`Invalid color: ${hex}`);
  return 0.2126 * values[0]! + 0.7152 * values[1]! + 0.0722 * values[2]!;
}

function contrast(foreground: string, background: string) {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

describe('color tokens', () => {
  it.each([
    ['light primary text', lightTheme.text, lightTheme.canvas],
    ['light muted text', lightTheme.textMuted, lightTheme.canvas],
    ['dark primary text', darkTheme.text, darkTheme.canvas],
    ['dark muted text', darkTheme.textMuted, darkTheme.canvas],
    ['primary action', palette.white, palette.strength],
  ])('%s passes WCAG AA for body text', (_name, foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });
});
