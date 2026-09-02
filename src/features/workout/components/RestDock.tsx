import type { PropsWithChildren } from 'react';
import { View } from 'react-native';

import { Panel } from '@/design-system/v2.2/primitives';

/** Stable, non-obscuring frame for the persisted rest-timer instrument. */
export function RestDock({ children }: PropsWithChildren) {
  return <View testID="rest-dock"><Panel>{children}</Panel></View>;
}
