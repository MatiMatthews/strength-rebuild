import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useDataServices } from '@/data/repositories/provider';
import { ActionButton, AppText, Screen } from '@/design-system/v2.2/primitives';
import { AppMasthead } from '@/design-system/v2.2/components';
import { WeeklyReviewPanel } from '@/features/review/WeeklyReviewPanel';
import type { PendingWeek } from '@/application/progression/weekly-review';

export default function WeeklyReviewRoute() {
  const router = useRouter();
  const { weeklyReviews } = useDataServices();
  const [weeks, setWeeks] = useState<PendingWeek[] | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let live = true;
    void Promise.resolve().then(async () => {
      if (!live) return;
      setError(false);
      const value = await weeklyReviews.listPendingWeeks();
      if (live) setWeeks(value);
    }).catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [weeklyReviews, revision]);
  return <Screen testID="weekly-review-screen">
    <AppMasthead title="REVISIÓN" context="Resultado semanal guardado en este dispositivo" />
    <ActionButton accessibilityLabel="Volver a Hoy" icon={ArrowLeft} tone="secondary" onPress={() => router.replace('/')}>Hoy</ActionButton>
    {saved ? <AppText accessibilityLiveRegion="polite">Revisión guardada. Cargas y repeticiones sin cambios. La preparación de seguridad sigue vigente.</AppText> : null}
    {error ? <><AppText>No se pudo cargar la revisión. Tus datos se conservan.</AppText><ActionButton onPress={() => setRevision(value => value + 1)}>Reintentar revisión</ActionButton></> : weeks === null ? <AppText>Cargando revisión…</AppText> : weeks.length === 0 ? <AppText>No hay revisiones semanales pendientes. Vuelve a Hoy para consultar el siguiente paso.</AppText> : weeks.map(week => <WeeklyReviewPanel key={`${week.cycleId}:${week.weekIndex}`} cycleId={week.cycleId} nextWeekIndex={week.weekIndex + 1} reviews={weeklyReviews} onChanged={() => { setSaved(true); setRevision(value => value + 1); }} />)}
  </Screen>;
}
