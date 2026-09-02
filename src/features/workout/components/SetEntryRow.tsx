import type { PropsWithChildren } from 'react';
import { View } from 'react-native';

import { Panel } from '@/design-system/v2.2/primitives';

/** Stable frame for one set's values and its explicit completion disposition. */
export function SetEntryRow({ children }: PropsWithChildren) {
  return <View testID="set-entry-row"><Panel>{children}</Panel></View>;
}
