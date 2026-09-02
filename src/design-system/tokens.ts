export const palette = {
  white: '#FFFFFF',
  canvasLight: '#F6F7F8',
  surfaceLight: '#FFFFFF',
  surfaceMutedLight: '#EDF1F3',
  textLight: '#11181C',
  textMutedLight: '#52616B',
  borderLight: '#D6DDE1',
  canvasDark: '#101417',
  surfaceDark: '#181D21',
  surfaceMutedDark: '#22292E',
  textDark: '#F4F7F8',
  textMutedDark: '#BAC4CA',
  borderDark: '#3A444B',
  hypertrophy: '#087E6D',
  hypertrophySoft: '#CFF3EB',
  strength: '#175CD3',
  strengthSoft: '#D8E6FF',
  power: '#B5473F',
  powerSoft: '#FFE0DD',
  transition: '#805B00',
  transitionSoft: '#FFF0C7',
  stop: '#B42318',
  stopSoft: '#FFE1DE',
  success: '#08785F',
  successSoft: '#D5F4EA',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;

export const radii = {
  control: 6,
  panel: 8,
  sheet: 16,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '700' as const },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '700' as const },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: '700' as const },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '500' as const },
  numeric: { fontSize: 36, lineHeight: 40, fontWeight: '700' as const },
} as const;

export const lightTheme = {
  accent: palette.strength,
  dark: false,
  canvas: palette.canvasLight,
  surface: palette.surfaceLight,
  surfaceMuted: palette.surfaceMutedLight,
  text: palette.textLight,
  textMuted: palette.textMutedLight,
  border: palette.borderLight,
  tabInactive: '#667782',
  overlay: 'rgba(17, 24, 28, 0.58)',
} as const;

export const darkTheme = {
  accent: '#6EA8FF',
  dark: true,
  canvas: palette.canvasDark,
  surface: palette.surfaceDark,
  surfaceMuted: palette.surfaceMutedDark,
  text: palette.textDark,
  textMuted: palette.textMutedDark,
  border: palette.borderDark,
  tabInactive: '#95A3AC',
  overlay: 'rgba(0, 0, 0, 0.72)',
} as const;

export type AppTheme = typeof lightTheme | typeof darkTheme;
