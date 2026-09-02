import { useFonts } from 'expo-font';
import type { PropsWithChildren } from 'react';

import { fontAssets } from './fonts';

export function FontProvider({ children }: PropsWithChildren) {
  const [fontsLoaded, fontError] = useFonts(fontAssets);

  if (!fontsLoaded && !fontError) return null;
  if (fontError) throw fontError;
  return children;
}
