import type { PropsWithChildren } from 'react';
import { View } from 'react-native';
import { useAppTheme } from '@/design-system/use-app-theme';
import { spacing } from '@/design-system/v2.2/tokens';

/** Stable frame for one set's values and its explicit completion disposition. */
export function SetEntryRow({ children }: PropsWithChildren) {
  const theme = useAppTheme();
  return <View testID="set-entry-row" style={{ borderBottomColor: theme.border, borderBottomWidth: 1, gap: spacing.sm, paddingVertical: spacing.md }}>{children}</View>;
}
