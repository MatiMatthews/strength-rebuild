import { useSyncExternalStore } from 'react';

import { darkTheme, lightTheme } from './tokens';

const DARK_MODE_QUERY = '(prefers-color-scheme: dark)';

function subscribe(onChange: () => void) {
  const query = window.matchMedia(DARK_MODE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function getSnapshot() {
  return window.matchMedia(DARK_MODE_QUERY).matches;
}

export function useAppTheme() {
  const dark = useSyncExternalStore(subscribe, getSnapshot, () => false);
  return dark ? darkTheme : lightTheme;
}
