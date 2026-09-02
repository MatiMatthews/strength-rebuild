import { useColorScheme } from 'react-native';

import { darkTheme, lightTheme } from './tokens';

export function useAppTheme() {
  return useColorScheme() === 'dark' ? darkTheme : lightTheme;
}
