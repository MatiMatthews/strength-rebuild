import { PlanReferenceScreen } from '@/features/plan/PlanReferenceScreen';
import { useDataServices } from '@/data/repositories/provider';
import { resolveTrainingSettings, type TrainingSettings } from '@/features/settings/settings';
import { useIsFocused, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { FocusedScene } from '@/features/navigation/FocusedScene';

export default function PlanRoute() {
  const isFocused = useIsFocused();
  const router = useRouter() as unknown as { push(href: '/settings' | '/backup' | '/weekly-review'): void };
  const { backups, programs, repositories, weeklyReviews } = useDataServices();
  const settingsStore = useMemo(() => ({
    load: async () => resolveTrainingSettings((await repositories.settings.get<TrainingSettings>('training-settings'))?.value),
    save: (value: TrainingSettings) => repositories.settings.save({ id: 'training-settings', key: 'training-settings', value }),
  }), [repositories]);
  return <FocusedScene accessibilityElementsHidden={isFocused ? false : true} focused={isFocused} importantForAccessibility={isFocused ? 'auto' : 'no-hide-descendants'}><PlanReferenceScreen focused={isFocused} onOpenReview={() => router.push('/weekly-review')} backups={backups} onOpenBackup={() => router.push('/backup')} onOpenSettings={() => router.push('/settings')} programs={programs} reviews={weeklyReviews} settingsStore={settingsStore} /></FocusedScene>;
}
