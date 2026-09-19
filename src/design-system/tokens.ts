import { radii as athleteRadii } from './v2.2/tokens';
// Compatibility names share the same Athlete typography, spacing and geometry.
export { palette, lightTheme, darkTheme, spacing, typography } from './v2.2/tokens';
export type { AppTheme } from './v2.2/tokens';
export const radii = { ...athleteRadii, panel: athleteRadii.structural, sheet: athleteRadii.tool, pill: athleteRadii.control } as const;
