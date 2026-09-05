import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import type { SessionChoice, SessionRecommendation, SessionReviewService } from '../../application/progression/session-review';
import { ActionButton, AppText, Panel } from '../../design-system/v2.2/primitives';

export function SessionReviewPanel({ reviews, onChanged }: { reviews: SessionReviewService; onChanged: () => void }) {
  const [items, setItems] = useState<SessionRecommendation[]>([]);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [message, setMessage] = useState('');
  const reload = useCallback(async () => setItems(await reviews.listPending()), [reviews]);
  useEffect(() => {
    let live = true;
    reviews.listPending().then(value => { if (live) setItems(value); }).catch(() => { if (live) setMessage('No se pudieron cargar las recomendaciones. Vuelve a intentarlo.'); });
    return () => { live = false; };
  }, [reviews]);
  const decide = async (item: SessionRecommendation, choice: SessionChoice) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage('');
    try {
      await reviews.decide(item, choice);
      setMessage(choice === 'ACCEPTED' ? 'Recomendación aplicada a la próxima exposición indicada.' : choice === 'KEPT' ? 'Plan mantenido sin cambios.' : 'Recomendación rechazada. Plan sin cambios.');
      await reload(); onChanged();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se guardó la decisión. Inténtalo de nuevo.'); await reload(); }
    finally { lock.current = false; setBusy(false); }
  };
  if (!items.length && !message) return null;
  return <View testID="session-recommendations"><Panel>
    <AppText accessibilityRole="header" aria-level={2} variant="heading">Recomendaciones de tu sesión</AppText>
    <AppText>Son opcionales. Puedes preparar tu próxima sesión sin aceptar cambios. La revisión semanal y la preparación de seguridad son independientes.</AppText>
    {items.map(item => <View key={item.id} style={{ gap: 12 }}>
      <AppText variant="bodyStrong">{item.exerciseName}</AppText>
      <AppText>{item.reason}</AppText>
      {item.before && item.after ? <AppText>Antes: {item.before.sets} × {item.before.prescribedReps} · {item.before.load} kg. Propuesta: {item.after.sets} × {item.after.reps} · {item.after.load} kg.</AppText> : null}
      {item.target ? <AppText>Próxima exposición: semana {item.target.week_index}, día {item.target.day_index}.</AppText> : null}
      {item.unavailable ? <AppText>{item.unavailable}</AppText> : <ActionButton disabled={busy} accessibilityLabel="Aceptar recomendación de sesión" onPress={() => decide(item, 'ACCEPTED')}>Aceptar recomendación</ActionButton>}
      <ActionButton disabled={busy} tone="secondary" accessibilityLabel="Mantener plan de sesión" onPress={() => decide(item, 'KEPT')}>Mantener plan</ActionButton>
      <ActionButton disabled={busy} tone="secondary" accessibilityLabel="Rechazar recomendación de sesión" onPress={() => decide(item, 'REJECTED')}>Rechazar recomendación</ActionButton>
    </View>)}
    {message ? <AppText accessibilityLiveRegion="polite">{message}</AppText> : null}
  </Panel></View>;
}
