import { spacing } from './tokens';

export const TAB_BAR_CONTENT_HEIGHT = 72;

export function tabBarSafeAreaStyle(bottomInset: number) {
  const safeBottom = Math.max(0, bottomInset);
  return {
    height: TAB_BAR_CONTENT_HEIGHT + safeBottom,
    paddingBottom: spacing.sm + safeBottom,
    paddingTop: spacing.sm,
  } as const;
}
