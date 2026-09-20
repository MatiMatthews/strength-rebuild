import { useIsFocused, useRouter } from 'expo-router';
import { useMemo } from 'react';

import { WorkoutReferenceScreen } from '@/features/workout/WorkoutReferenceScreen';
import { useDataServices } from '@/data/repositories/provider';
import { resolveTrainingSettings, type TrainingSettings } from '@/features/settings/settings';

export default function WorkoutRoute() {
  const router = useRouter();
  const focused = useIsFocused();
  const { programs, repositories, workouts } = useDataServices();
  const settingsStore = useMemo(() => ({
    load: async () => resolveTrainingSettings((await repositories.settings.get<TrainingSettings>('training-settings'))?.value),
    save: (value: TrainingSettings) => repositories.settings.save({ id: 'training-settings', key: 'training-settings', value }),
  }), [repositories]);
  return <WorkoutReferenceScreen focused={focused} onClose={() => { if (router.canGoBack()) router.back(); else router.replace('/'); }} programs={programs} requireReadiness settingsStore={settingsStore} workouts={workouts} />;
}
