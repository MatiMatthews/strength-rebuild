import { PlanReferenceScreen } from '@/features/plan/PlanReferenceScreen';
import { useDataServices } from '@/data/repositories/provider';
import { createSettingsStore } from '@/features/settings/settings-store';
import { useIsFocused, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { FocusedScene } from '@/features/navigation/FocusedScene';

export default function PlanRoute() {
  const isFocused = useIsFocused();
  const router = useRouter() as unknown as { push(href: '/settings' | '/backup' | '/weekly-review' | '/cycle-completion?from=plan'): void };
  const { backups, programs, repositories, weeklyReviews } = useDataServices();
  const settingsStore = useMemo(() => createSettingsStore(repositories.settings), [repositories]);
  return <FocusedScene accessibilityElementsHidden={isFocused ? false : true} focused={isFocused} importantForAccessibility={isFocused ? 'auto' : 'no-hide-descendants'}><PlanReferenceScreen onOpenCycle={() => router.push('/cycle-completion?from=plan')} focused={isFocused} onOpenReview={() => router.push('/weekly-review')} backups={backups} onOpenBackup={() => router.push('/backup')} onOpenSettings={() => router.push('/settings')} programs={programs} reviews={weeklyReviews} settingsStore={settingsStore} /></FocusedScene>;
}
