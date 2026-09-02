import type { PropsWithChildren } from 'react';
import { Platform, View, type ViewProps } from 'react-native';

type FocusedSceneProps = PropsWithChildren<ViewProps & { focused: boolean }>;

export function FocusedScene({ children, focused, ...props }: FocusedSceneProps) {
  const webTraversal = Platform.OS === 'web' && !focused
    ? ({ inert: '' } as unknown as ViewProps)
    : {};

  return (
    <View
      {...props}
      {...webTraversal}
      accessibilityElementsHidden={!focused}
      aria-hidden={!focused}
      importantForAccessibility={focused ? 'auto' : 'no-hide-descendants'}
      style={[{ flex: 1 }, props.style]}
    >
      {children}
    </View>
  );
}
