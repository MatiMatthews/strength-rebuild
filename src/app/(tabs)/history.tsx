import { useFocusEffect, useIsFocused } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import { resolveTrainingSettings, type TrainingSettings } from '@/features/settings/settings';
import { HistoryReferenceScreen } from '@/features/history/HistoryReferenceScreen';
import { useDataServices } from '@/data/repositories/provider';
import { FocusedScene } from '@/features/navigation/FocusedScene';

export default function HistoryRoute() {
  const { workouts, repositories } = useDataServices();
  const settingsStore = useMemo(() => ({ load: async () => resolveTrainingSettings((await repositories.settings.get<TrainingSettings>('training-settings'))?.value) }), [repositories]);
  const isFocused = useIsFocused();
  const [refreshKey, setRefreshKey] = useState(0);

  useFocusEffect(useCallback(() => {
    setRefreshKey((current) => current + 1);
  }, []));

  return <FocusedScene accessibilityElementsHidden={isFocused ? false : true} focused={isFocused} importantForAccessibility={isFocused ? 'auto' : 'no-hide-descendants'}><HistoryReferenceScreen settingsStore={settingsStore} refreshKey={refreshKey} workouts={workouts} /></FocusedScene>;
}
