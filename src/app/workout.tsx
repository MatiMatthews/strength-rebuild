import { useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { AppState, Keyboard, Platform } from 'react-native';

import { WorkoutReferenceScreen } from '@/features/workout/WorkoutReferenceScreen';
import { useDataServices } from '@/data/repositories/provider';
import { resolveTrainingSettings, type TrainingSettings } from '@/features/settings/settings';
import { wasWorkoutOpenedInThisProcess } from '@/features/navigation/workout-navigation-session';

export default function WorkoutRoute() {
  const router = useRouter();
  const openedInThisProcess = useMemo(() => wasWorkoutOpenedInThisProcess(), []);
  const { programs, repositories, workouts } = useDataServices();
  const settingsStore = useMemo(() => ({
    load: async () => resolveTrainingSettings((await repositories.settings.get<TrainingSettings>('training-settings'))?.value),
    save: (value: TrainingSettings) => repositories.settings.save({ id: 'training-settings', key: 'training-settings', value }),
  }), [repositories]);
  useEffect(() => {
    if (Platform.OS === 'android' && !openedInThisProcess) router.replace('/');
  }, [openedInThisProcess, router]);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && previousState !== 'active') { Keyboard.dismiss(); router.replace('/'); }
      previousState = nextState;
    });
    return () => subscription.remove();
  }, [router]);
  if (Platform.OS === 'android' && !openedInThisProcess) return null;
  return <WorkoutReferenceScreen onClose={() => router.back()} programs={programs} requireReadiness settingsStore={settingsStore} workouts={workouts} />;
}
