import { useFocusEffect, useIsFocused, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { useDataServices } from '@/data/repositories/provider';
import { TodayReferenceScreen } from '@/features/today/TodayReferenceScreen';
import { ReadinessGate } from '@/features/readiness/ReadinessGate';
import { deriveTodayState, type TodayState } from '@/features/today/today-state';
import { FocusedScene } from '@/features/navigation/FocusedScene';
import { markWorkoutNavigation } from '@/features/navigation/workout-navigation-session';
import { DataFailureScreen } from '@/features/resilience/DataFailureScreen';
import { useLocalSearchParams } from 'expo-router';
import type { SafetyInput } from '@/domain/safety';

export default function TodayRoute() {
  const router = useRouter() as { push(href: Href | '/settings'): void };
  const isFocused = useIsFocused();
  const { programs, workouts } = useDataServices();
  const { srScenario } = useLocalSearchParams<{ srScenario?: string }>();
  const webScenario = Platform.OS === 'web' && typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('srScenario') ?? undefined
    : undefined;
  const requestedScenario = webScenario ?? srScenario;
  const [scenarioReady, setScenarioReady] = useState(false);
  const [state, setState] = useState<TodayState>({ kind: 'empty' });
  const [persistedReadiness, setPersistedReadiness] = useState<SafetyInput | null>(null);
  const navigateToWorkout = useCallback(() => { markWorkoutNavigation(); router.push('/workout'); }, [router]);
  useEffect(() => {
    if (Platform.OS !== 'web' || !requestedScenario || typeof document === 'undefined') return;
    const observeMarker = () => setScenarioReady(Boolean(document.querySelector('[data-testid="v2.2-scenario-state"]')));
    observeMarker();
    const observer = new MutationObserver(observeMarker);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [requestedScenario]);
  useFocusEffect(useCallback(() => {
    let live = true;
    programs.getTodayContext().then(async (context) => {
      const decision = context.today?.sessionPlanId
        ? await workouts.getReadiness(context.today.sessionPlanId)
        : null;
      if (!live) return;
      setState(deriveTodayState({
        ...context,
        restrictionActive: context.restrictionActive || decision?.sessionStatus === 'MODIFIED',
        reviewRequired: context.reviewRequired,
      }));
      setPersistedReadiness(!decision || context.activeSession ? null
        : decision.reviewRequired ? { pain: 1, painTrend: 'stable', warningFlags: ['NEUROLOGICAL'] }
          : decision.sessionStatus === 'PATTERN_STOPPED' ? { pain: 5, painTrend: 'increasing' }
            : decision.sessionStatus === 'MODIFIED' ? { pain: 3, painTrend: 'stable', techniqueChanged: true }
              : { pain: 1, painTrend: 'stable' });
    });
    return () => { live = false; };
  }, [programs, requestedScenario, scenarioReady, workouts]));
  if (requestedScenario === 'data-failure' && scenarioReady) return <DataFailureScreen onRetry={() => setScenarioReady(false)} />;
  return <FocusedScene accessibilityElementsHidden={isFocused ? false : true} focused={isFocused} importantForAccessibility={isFocused ? 'auto' : 'no-hide-descendants'}><TodayReferenceScreen initialReadinessInput={persistedReadiness} readinessGate={ReadinessGate} state={state} onOpenSettings={() => router.push('/settings')} onApplyReadiness={async (input) => {
    if (!('data' in state)) throw new Error('No planned session is available for readiness');
    await workouts.applyReadiness(state.data, { ...input, region: input.abdominalRestrictionActive ? 'abdominal' : 'other', reproducedByBraceCoughOrSneeze: false });
  }} onStartWorkout={navigateToWorkout} /></FocusedScene>;
}
