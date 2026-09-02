export const palette = {
  signal: '#E7FF00',
  ink: '#090B0C',
  paper: '#F7F8F5',
  surface: '#FFFFFF',
  graphite: '#202427',
  steel: '#60686D',
  line: '#C9CECA',
  focus: '#2147D9',
  success: '#08785F',
  caution: '#805B00',
  danger: '#B42318',
  white: '#FFFFFF',
  canvasLight: '#F7F8F5', surfaceLight: '#FFFFFF', surfaceMutedLight: '#F7F8F5',
  textLight: '#090B0C', textMutedLight: '#60686D', borderLight: '#C9CECA',
  canvasDark: '#202427', surfaceDark: '#202427', surfaceMutedDark: '#090B0C',
  textDark: '#F7F8F5', textMutedDark: '#C9CECA', borderDark: '#60686D',
  hypertrophy: '#08785F', hypertrophySoft: '#D5F4EA',
  strength: '#090B0C', strengthSoft: '#E7FF00',
  power: '#B42318', powerSoft: '#FFE1DE',
  transition: '#805B00', transitionSoft: '#FFF0C7',
  stop: '#B42318', stopSoft: '#FFE1DE', successSoft: '#D5F4EA',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 32, huge: 40 } as const;
export const borders = { standard: 1, emphasis: 2, active: 4 } as const;
export const radii = { structural: 0, control: 4, tool: 8 } as const;

export const typography = {
  hero: { fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 72, lineHeight: 72, fontWeight: '800' as const, letterSpacing: 0 },
  display: { fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 44, lineHeight: 46, fontWeight: '800' as const, letterSpacing: 0 },
  sequence: { fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 40, lineHeight: 40, fontWeight: '800' as const, letterSpacing: 0 },
  title: { fontFamily: 'BarlowCondensed-Bold', fontSize: 28, lineHeight: 32, fontWeight: '700' as const, letterSpacing: 0 },
  heading: { fontFamily: 'Barlow-Bold', fontSize: 20, lineHeight: 24, fontWeight: '700' as const, letterSpacing: 0 },
  body: { fontFamily: 'Barlow-Regular', fontSize: 16, lineHeight: 22, fontWeight: '400' as const, letterSpacing: 0 },
  bodyStrong: { fontFamily: 'Barlow-Bold', fontSize: 16, lineHeight: 22, fontWeight: '700' as const, letterSpacing: 0 },
  label: { fontFamily: 'Barlow-SemiBold', fontSize: 14, lineHeight: 18, fontWeight: '600' as const, letterSpacing: 0 },
  caption: { fontFamily: 'Barlow-SemiBold', fontSize: 13, lineHeight: 17, fontWeight: '600' as const, letterSpacing: 0 },
  numeric: { fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 40, lineHeight: 40, fontWeight: '800' as const, letterSpacing: 0 },
} as const;

export const lightTheme = { accent: palette.ink, dark: false, canvas: palette.paper, surface: palette.surface, surfaceMuted: palette.paper, text: palette.ink, textMuted: palette.steel, border: palette.line, tabInactive: palette.steel, overlay: 'rgba(9, 11, 12, 0.58)' } as const;
export const darkTheme = { accent: palette.signal, dark: true, canvas: palette.graphite, surface: palette.graphite, surfaceMuted: palette.ink, text: palette.paper, textMuted: palette.line, border: palette.steel, tabInactive: palette.line, overlay: 'rgba(0, 0, 0, 0.72)' } as const;
export type AppTheme = typeof lightTheme | typeof darkTheme;
