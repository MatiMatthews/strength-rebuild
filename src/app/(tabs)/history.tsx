import { useFocusEffect, useIsFocused } from 'expo-router';
import { useCallback, useState } from 'react';

import { HistoryReferenceScreen } from '@/features/history/HistoryReferenceScreen';
import { useDataServices } from '@/data/repositories/provider';
import { FocusedScene } from '@/features/navigation/FocusedScene';

export default function HistoryRoute() {
  const { workouts } = useDataServices();
  const isFocused = useIsFocused();
  const [refreshKey, setRefreshKey] = useState(0);

  useFocusEffect(useCallback(() => {
    setRefreshKey((current) => current + 1);
  }, []));

  return <FocusedScene accessibilityElementsHidden={isFocused ? false : true} focused={isFocused} importantForAccessibility={isFocused ? 'auto' : 'no-hide-descendants'}><HistoryReferenceScreen refreshKey={refreshKey} workouts={workouts} /></FocusedScene>;
}
