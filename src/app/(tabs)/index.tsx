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
import { SessionReviewPanel } from '@/features/review/SessionReviewPanel';
import type { PersistedReadiness } from '@/application/workouts/workout-service';

export default function TodayRoute() {
  const router = useRouter() as { push(href: Href | '/settings'): void };
  const isFocused = useIsFocused();
  const { programs, workouts, sessionReviews } = useDataServices();
  const { srScenario } = useLocalSearchParams<{ srScenario?: string }>();
  const webScenario = Platform.OS === 'web' && typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('srScenario') ?? undefined
    : undefined;
  const requestedScenario = webScenario ?? srScenario;
  const [loadFailed, setLoadFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const onReviewChanged = useCallback(() => setRevision(value => value + 1), []);
  const [scenarioReady, setScenarioReady] = useState(false);
  const [state, setState] = useState<TodayState>({ kind: 'empty' });
  const [activeReadiness, setActiveReadiness] = useState<PersistedReadiness | null>(null);
  const [persistedReadiness, setPersistedReadiness] = useState<PersistedReadiness | null>(null);
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
    setLoadFailed(false);
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
      setActiveReadiness(context.activeSession ? decision : null);
      setPersistedReadiness(context.activeSession && decision && ['READY', 'MODIFIED'].includes(decision.sessionStatus) ? null : decision);
    }).catch(() => { if (live) setLoadFailed(true); });
    return () => { live = false; };
  }, [programs, requestedScenario, scenarioReady, workouts, revision]));
  if (loadFailed) return <DataFailureScreen onRetry={() => setRevision(value => value + 1)} />;
  if (requestedScenario === 'data-failure' && scenarioReady) return <DataFailureScreen onRetry={() => setScenarioReady(false)} />;
  return <FocusedScene accessibilityElementsHidden={isFocused ? false : true} focused={isFocused} importantForAccessibility={isFocused ? 'auto' : 'no-hide-descendants'}><TodayReferenceScreen activeReadiness={activeReadiness} onOpenReview={() => router.push('/weekly-review' as Href)} recommendations={<SessionReviewPanel key={`${isFocused}`} reviews={sessionReviews} onChanged={onReviewChanged} />} savedReadiness={persistedReadiness} initialReadinessInput={persistedReadiness?.input ?? null} readinessGate={ReadinessGate} state={state} onOpenSettings={() => router.push('/settings')} onApplyReadiness={async (input) => {
    if (!('data' in state)) throw new Error('No planned session is available for readiness');
    return workouts.applyReadiness(state.data, input);
  }} onStartWorkout={navigateToWorkout} /></FocusedScene>;
}
