import { spacing, typography } from './tokens';

export const TAB_BAR_CONTENT_HEIGHT = 72;

export function tabBarSafeAreaStyle(bottomInset: number, fontScale = 1) {
  const safeBottom = Math.max(0, bottomInset);
  return {
    height: TAB_BAR_CONTENT_HEIGHT + safeBottom + Math.ceil((typography.caption.lineHeight + spacing.sm) * Math.max(0, fontScale - 1)),
    paddingBottom: spacing.sm + safeBottom,
    paddingTop: spacing.sm,
  } as const;
}
