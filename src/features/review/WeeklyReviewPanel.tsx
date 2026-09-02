import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { WeekOutcome, WeeklyProposal, WeeklyReviewService } from '../../application/progression/weekly-review';
import { ActionButton, AppText, Panel, Tag } from '../../design-system/v2.2/primitives';
import { palette, radii, spacing } from '../../design-system/v2.2/tokens';
import { useAppTheme } from '../../design-system/use-app-theme';

const outcomes: readonly { value: WeekOutcome; label: string }[] = [
  { value: 'successful', label: 'Completada' }, { value: 'missed', label: 'Incompleta' },
  { value: 'failed', label: 'Fallida' }, { value: 'restricted', label: 'Restringida' },
  { value: 'repeated', label: 'Repetida' },
];

export function WeeklyReviewPanel({ cycleId, nextWeekIndex, reviews }: { cycleId: string; nextWeekIndex: number; reviews: WeeklyReviewService }) {
  const theme = useAppTheme();
  const [outcome, setOutcome] = useState<WeekOutcome>('successful');
  const [proposal, setProposal] = useState<WeeklyProposal | null>(null);
  const [message, setMessage] = useState('');
  const propose = async () => { setProposal(await reviews.propose({ cycleId, weekIndex: nextWeekIndex - 1, nextWeekIndex, outcome })); setMessage(''); };
  const decide = async (accepted: boolean) => { if (!proposal) return; await reviews.decide(proposal.id, accepted); setProposal(null); setMessage(accepted ? 'Cambio confirmado para la próxima semana.' : 'Propuesta rechazada. El plan quedó sin cambios.'); };

  return <Panel>
    <AppText accessibilityRole="header" aria-level={2} variant="heading">Revisión semanal</AppText>
    <AppText color="muted">Elige el resultado real. La propuesta no cambia el plan hasta que la confirmes.</AppText>
    <View accessibilityLabel="Resultado de la semana" accessibilityRole="radiogroup" style={styles.options}>
      {outcomes.map((item) => <Pressable aria-checked={outcome === item.value} accessibilityLabel={item.label} accessibilityRole="radio" accessibilityState={{ checked: outcome === item.value }} key={item.value} onPress={() => setOutcome(item.value)} style={[styles.option, { borderColor: outcome === item.value ? palette.strength : theme.border }]}><AppText variant="bodyStrong">{item.label}</AppText></Pressable>)}
    </View>
    <ActionButton accessibilityLabel="Crear propuesta semanal" onPress={propose}>Crear propuesta</ActionButton>
    {proposal ? <View style={styles.proposal}><Tag>{proposal.action === 'hold' ? 'MANTENER' : proposal.action === 'progress' ? 'PROGRESAR' : 'AJUSTAR'}</Tag><AppText>{proposal.explanation}</AppText><AppText color="muted" variant="caption">Solo afecta la semana {proposal.nextWeekIndex} si aceptas.</AppText><View style={styles.actions}><ActionButton accessibilityLabel="Aceptar propuesta semanal" onPress={() => decide(true)}>Aceptar</ActionButton><ActionButton accessibilityLabel="Rechazar propuesta semanal" onPress={() => decide(false)} tone="secondary">Rechazar</ActionButton></View></View> : null}
    {message ? <AppText accessibilityLiveRegion="polite">{message}</AppText> : null}
  </Panel>;
}

const styles = StyleSheet.create({ actions: { gap: spacing.sm }, option: { borderRadius: radii.control, borderWidth: 2, justifyContent: 'center', minHeight: 48, paddingHorizontal: spacing.md }, options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, proposal: { gap: spacing.md } });
