import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';

import { WorkoutReferenceScreen } from '@/features/workout/WorkoutReferenceScreen';
import { useDataServices } from '@/data/repositories/provider';
import { resolveTrainingSettings, type TrainingSettings } from '@/features/settings/settings';

export default function WorkoutRoute() {
  const router = useRouter();
  const focused = useIsFocused();
  const { exercise } = useLocalSearchParams<{ exercise?: string }>();
  const initialExerciseIndex = typeof exercise === 'string' && /^\d+$/.test(exercise) ? Number(exercise) : undefined;
  const clearEntry = useCallback(() => router.setParams({ exercise: undefined }), [router]);
  const { programs, repositories, workouts } = useDataServices();
  const settingsStore = useMemo(() => ({
    load: async () => resolveTrainingSettings((await repositories.settings.get<TrainingSettings>('training-settings'))?.value),
    save: (value: TrainingSettings) => repositories.settings.save({ id: 'training-settings', key: 'training-settings', value }),
  }), [repositories]);
  return <WorkoutReferenceScreen focused={focused} {...(initialExerciseIndex !== undefined ? { initialExerciseIndex } : {})} onEntryApplied={clearEntry} onClose={() => router.replace('/')} programs={programs} requireReadiness settingsStore={settingsStore} workouts={workouts} />;
}
