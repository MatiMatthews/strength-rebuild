import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { WeekOutcome, WeeklyChoice, WeeklyProposal, WeeklyReviewService } from '../../application/progression/weekly-review';
import { ActionButton, AppText, Panel, Tag } from '../../design-system/v2.2/primitives';
import { palette, radii, spacing } from '../../design-system/v2.2/tokens';
import { useAppTheme } from '../../design-system/use-app-theme';
const outcomes: readonly { value: WeekOutcome; label: string }[] = [
  { value: 'successful', label: 'Completada' }, { value: 'missed', label: 'Incompleta' },
  { value: 'failed', label: 'Fallida' }, { value: 'restricted', label: 'Restringida' }, { value: 'repeated', label: 'Repetida' },
];
export function WeeklyReviewPanel({ cycleId, nextWeekIndex, reviews, onChanged }: { cycleId: string; nextWeekIndex: number; reviews: WeeklyReviewService; onChanged?: () => void }) {
  const theme = useAppTheme();
  const [outcome, setOutcome] = useState<WeekOutcome>('successful');
  const [proposal, setProposal] = useState<WeeklyProposal | null>(null);
  const [message, setMessage] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resolved, setResolved] = useState(false);
  const [retry, setRetry] = useState(0);
  const lock = useRef(false);
  useEffect(() => {
    let live = true;
    void Promise.resolve().then(async () => {
      if (!live) return;
      setReady(false);
      const value = await reviews.load(cycleId, nextWeekIndex - 1);
      if (!live) return;
      setProposal(value); if (value) setOutcome(value.outcome); setReady(true); setMessage('');
    }).catch(() => { if (live) setMessage('No se pudo cargar la revisión. Reintenta o vuelve a Hoy; tus datos se conservan.'); });
    return () => { live = false; };
  }, [cycleId, nextWeekIndex, reviews, retry]);
  const run = async (task: () => Promise<void>) => {
    if (lock.current || !ready) return;
    lock.current = true; setBusy(true); setMessage('');
    try { await task(); } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo guardar. Reintenta; tus datos se conservan.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const decide = (choice: WeeklyChoice) => run(async () => {
    if (!proposal) return;
    await reviews.decide(proposal.id, choice);
    setResolved(true); setProposal(null);
    setMessage('Revisión guardada. Cargas y repeticiones sin cambios. La preparación de seguridad sigue vigente.');
    onChanged?.();
  });
  return <Panel>
    <AppText accessibilityRole="header" aria-level={2} variant="heading">Revisión de semana {nextWeekIndex - 1}</AppText>
    <AppText color="muted">La semana terminó. Confirma su resultado para continuar. Esta revisión registra tu decisión; no cambia cargas, repeticiones ni restricciones.</AppText>
    {!ready ? <><AppText>{message ? 'Revisión no disponible' : 'Cargando revisión…'}</AppText>{message ? <ActionButton onPress={() => setRetry(value => value + 1)}>Reintentar revisión</ActionButton> : null}</> : null}
    {ready && !resolved && !proposal ? <>
      <View accessibilityLabel="Resultado de la semana" accessibilityRole="radiogroup" style={styles.options}>
        {outcomes.map(item => <Pressable disabled={busy} aria-checked={outcome === item.value} accessibilityLabel={item.label} accessibilityRole="radio" accessibilityState={{ checked: outcome === item.value, disabled: busy }} key={item.value} onPress={() => setOutcome(item.value)} style={[styles.option, { borderColor: outcome === item.value ? palette.strength : theme.border }]}><AppText variant="bodyStrong">{item.label}</AppText></Pressable>)}
      </View>
      <ActionButton accessibilityLabel="Crear propuesta semanal" disabled={busy} onPress={() => run(async () => { const value = await reviews.propose({ cycleId, weekIndex: nextWeekIndex - 1, nextWeekIndex, outcome }); setProposal(value); setOutcome(value.outcome); })}>{busy ? 'Guardando…' : 'Revisar resultado'}</ActionButton>
    </> : null}
    {ready && proposal ? <View style={styles.proposal}>
      <Tag>{outcomes.find(item => item.value === proposal.outcome)?.label ?? 'Resultado guardado'}</Tag>
      <AppText>{proposal.explanation}</AppText>
      <AppText color="muted">Aceptar registra este resultado. Mantener o rechazar cierra la revisión conservando el plan. Ninguna opción aplica nuevos objetivos de entrenamiento.</AppText>
      <View style={styles.actions}>
        <ActionButton accessibilityLabel="Aceptar propuesta semanal" disabled={busy} onPress={() => decide('ACCEPTED')}>{busy ? 'Guardando…' : 'Aceptar resultado'}</ActionButton>
        <ActionButton accessibilityLabel="Mantener plan semanal" disabled={busy} onPress={() => decide('KEPT')} tone="secondary">Mantener plan</ActionButton>
        <ActionButton accessibilityLabel="Rechazar propuesta semanal" disabled={busy} onPress={() => decide('REJECTED')} tone="secondary">Rechazar resultado</ActionButton>
      </View>
    </View> : null}
    {message ? <AppText accessibilityLiveRegion="polite">{message}</AppText> : null}
  </Panel>;
}
const styles = StyleSheet.create({ actions: { gap: spacing.sm }, option: { borderRadius: radii.control, borderWidth: 2, justifyContent: 'center', minHeight: 48, paddingHorizontal: spacing.md }, options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, proposal: { gap: spacing.md } });
