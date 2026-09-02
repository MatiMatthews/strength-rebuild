import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react-native';
import { Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { evaluateSafety, type SafetyInput } from '@/domain/safety';
import { ActionButton, AppText, FeedbackBanner, IconButton } from '@/design-system/v2.2/primitives';
import { spacing , borders, palette, spacing as brandSpacing, typography } from '@/design-system/v2.2/tokens';
import { useAppTheme } from '@/design-system/use-app-theme';
import { playContractedHaptic } from '@/design-system/v2.2/haptics';
import { useMotionPolicy } from '@/design-system/v2.2/use-motion-policy';
import { AppMasthead, BottomCommandDock, ChoiceControl } from '@/design-system/v2.2/components';

export type ReadinessGateProps = { initialInput?: SafetyInput | null; onClose: () => void; onDecision?: (input: SafetyInput) => void | Promise<void>; onReady: (input: SafetyInput) => void | Promise<void>; visible: boolean };

export function ReadinessGate({ initialInput = null, onClose, onDecision, onReady, visible }: ReadinessGateProps) {
  const overlayRef = useRef<View>(null);
  const theme = useAppTheme();
  const { reducedMotion } = useMotionPolicy();
  const [input, setInput] = useState<SafetyInput | null>(initialInput);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const overlay = overlayRef.current as unknown as HTMLElement | null;
    overlay?.closest('[aria-modal="true"]')?.setAttribute('role', 'dialog');
  }, [visible]);
  const result = input ? evaluateSafety(input) : null;
  const canTrain = result && !result.reviewRequired && result.disposition !== 'STOP_PATTERN';
  const feedbackTone = result?.disposition === 'MODIFY_SET' || result?.disposition === 'CONTINUE_WITH_RESTRICTIONS'
    ? 'caution'
    : canTrain ? 'success' : 'danger';
  return (
    <Modal animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={onClose} role="dialog" transparent visible={visible}>
      <View ref={overlayRef} style={[styles.overlay, { backgroundColor: theme.overlay }]}>
        <View accessible accessibilityLabel="Preparación de hoy" accessibilityViewIsModal role="dialog" testID="readiness-focused-surface" style={[styles.sheet, { backgroundColor: theme.surface }]}>
          <AppMasthead command={<IconButton accessibilityLabel="Cerrar Preparación de hoy" icon={X} onPress={onClose} />} context="Control local antes de entrenar" title="PREPARACIÓN DE HOY" />
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <AppText color="muted">Este control no diagnostica ni autoriza médicamente. Registra cómo estás hoy.</AppText>
        {([
          ['Dolor de 0 a 2, estable', '0–2 · estable', { pain: 1, painTrend: 'stable' }, 'safe'],
          ['Dolor de 3 a 4 o técnica alterada', '3–4 o técnica alterada', { pain: 3, painTrend: 'stable', techniqueChanged: true }, 'caution'],
          ['Dolor persiste después de una modificación', '3–4 persiste después del cambio', { pain: 3, painTrend: 'stable', persistsAfterModification: true }, 'caution'],
          ['Dolor sobre 4, creciente o señal de alerta', 'Sobre 4 o creciente', { pain: 5, painTrend: 'increasing' }, 'danger'],
          ['Hormigueo, adormecimiento, pérdida de fuerza o señal neurológica', 'Señal neurológica o sistémica', { pain: 1, painTrend: 'stable', warningFlags: ['NEUROLOGICAL'] }, 'danger'],
        ] as const).map(([label, copy, decision, tone]) => {
          const checked = input?.pain === decision.pain && input?.painTrend === decision.painTrend && Boolean(input?.techniqueChanged) === Boolean('techniqueChanged' in decision && decision.techniqueChanged) && Boolean(input?.persistsAfterModification) === Boolean('persistsAfterModification' in decision && decision.persistsAfterModification) && Boolean(input?.warningFlags?.length) === Boolean('warningFlags' in decision);
          return <View key={label} style={tone === 'caution' ? styles.caution : tone === 'danger' ? styles.danger : undefined}><ChoiceControl accessibilityLabel={label} label={copy} onPress={() => { setInput(decision); void onDecision?.(decision); }} selected={checked} /></View>;
        })}
        {result ? <><AppText accessibilityRole="header" variant="heading">{result.reviewRequired ? 'Evaluación profesional recomendada' : result.disposition === 'STOP_PATTERN' ? 'Preparación detenida' : result.disposition === 'MODIFY_SET' ? 'Preparación adaptada' : 'Preparación confirmable'}</AppText><FeedbackBanner message={result.explanation} tone={feedbackTone} /></> : null}
        {canTrain && input ? <BottomCommandDock><ActionButton accessibilityLabel="Confirmar preparación" onPress={async () => { await onReady(input); void playContractedHaptic('readinessAccepted'); }}>Confirmar y continuar</ActionButton></BottomCommandDock> : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  caution: { borderLeftColor: palette.caution, borderLeftWidth: borders.active },
  content: { gap: spacing.md, paddingBottom: brandSpacing.lg },
  danger: { borderLeftColor: palette.danger, borderLeftWidth: borders.active },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  option: { borderBottomColor: palette.line, borderBottomWidth: borders.standard, justifyContent: 'center', minHeight: 56, paddingHorizontal: brandSpacing.md, paddingVertical: brandSpacing.md },
  optionText: { ...typography.bodyStrong },
  pressed: { opacity: 0.72 },
  selected: { backgroundColor: palette.paper, borderBottomWidth: borders.emphasis },
  selectedText: { color: palette.ink },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 8, borderTopRightRadius: 8, gap: brandSpacing.lg, maxHeight: '100%', padding: brandSpacing.lg, paddingBottom: brandSpacing.xxl, width: '100%' },
});
