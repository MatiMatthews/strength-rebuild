import { useCallback, useEffect, useRef, useState } from 'react';
import type { PersistedReadiness, ReadinessInput } from '@/application/workouts/workout-service';
import { X } from 'lucide-react-native';
import { Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { evaluateSafety, type SafetyInput } from '@/domain/safety';
import { ActionButton, AppText, FeedbackBanner, IconButton } from '@/design-system/v2.2/primitives';
import { spacing , borders, palette, spacing as brandSpacing, typography } from '@/design-system/v2.2/tokens';
import { useAppTheme } from '@/design-system/use-app-theme';
import { playContractedHaptic } from '@/design-system/v2.2/haptics';
import { useMotionPolicy } from '@/design-system/v2.2/use-motion-policy';
import { AppMasthead, BottomCommandDock, ChoiceControl } from '@/design-system/v2.2/components';

export type ReadinessGateProps = { savedDecision?: PersistedReadiness | null; initialInput?: SafetyInput | null; onClose: () => void; onDecision?: (input: ReadinessInput) => void | PersistedReadiness | Promise<void | PersistedReadiness>; onReady: (input: SafetyInput) => void | Promise<void>; visible: boolean };

function ReadinessChoice({ label, copy, decision, selected, onSelect, abdominalRestrictionActive }: { label: string; copy: string; decision: SafetyInput; selected: boolean; onSelect: (input: SafetyInput) => Promise<void>; abdominalRestrictionActive: boolean }) {
  return <ChoiceControl accessibilityLabel={label} label={copy} selected={selected} onPress={() => { void onSelect({ ...decision, ...(abdominalRestrictionActive ? { abdominalRestrictionActive: true } : {}) }); }} />;
}

export function ReadinessGate({ savedDecision = null, initialInput = null, onClose, onDecision, onReady, visible }: ReadinessGateProps) {
  const overlayRef = useRef<View>(null);
  const theme = useAppTheme();
  const { reducedMotion } = useMotionPolicy();
  const [input, setInput] = useState<SafetyInput | null>(initialInput);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const overlay = overlayRef.current as unknown as HTMLElement | null;
    overlay?.closest('[aria-modal="true"]')?.setAttribute('role', 'dialog');
  }, [visible]);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [savedInput, setSavedInput] = useState<SafetyInput | null>(initialInput);
  const [region, setRegion] = useState<ReadinessInput['region']>(savedDecision?.input?.region ?? 'other');
  const [stored, setStored] = useState(savedDecision);
  const locked = Boolean(stored && ['PATTERN_STOPPED', 'ABORTED', 'REVIEW_REQUIRED'].includes(stored.sessionStatus));
  const close = () => { if (!pending.current) onClose(); };
  const persist = useCallback(async (selection: SafetyInput, affectedRegion = region) => {
    if (pending.current || locked) return;
    pending.current = true; setBusy(true); setError(null); setInput(selection);
    try {
      const completeInput: ReadinessInput = { ...selection, region: affectedRegion, reproducedByBraceCoughOrSneeze: savedDecision?.input?.reproducedByBraceCoughOrSneeze ?? false };
      const saved = await onDecision?.(completeInput);
      setSavedInput(selection);
      const outcome = evaluateSafety(selection);
      if (saved) setStored(saved);
      else if (outcome.reviewRequired || outcome.disposition === 'STOP_PATTERN') setStored({ input: completeInput, result: outcome, explanation: outcome.explanation, policyVersion: 'safety-v2.1', sessionPlanId: '', decidedAt: '', affectedPattern: affectedRegion, appliedChanges: [], disposition: outcome.disposition, sessionStatus: outcome.reviewRequired ? 'REVIEW_REQUIRED' : 'PATTERN_STOPPED', reviewRequired: outcome.reviewRequired });
    } catch { setError('No se pudo guardar la preparación. Tu selección se conserva; reintenta.'); }
    finally { pending.current = false; setBusy(false); }
  }, [locked, onDecision, region, savedDecision]);
  const result = locked ? stored?.result ?? null : input ? evaluateSafety(input) : null;
  const canTrain = result && !result.reviewRequired && result.disposition !== 'STOP_PATTERN';
  const feedbackTone = result?.disposition === 'MODIFY_SET' || result?.disposition === 'CONTINUE_WITH_RESTRICTIONS'
    ? 'caution'
    : canTrain ? 'success' : 'danger';
  return (
    <Modal animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={close} role="dialog" transparent visible={visible}>
      <View ref={overlayRef} style={[styles.overlay, { backgroundColor: theme.overlay }]}>
        <View accessible accessibilityLabel="Preparación de hoy" accessibilityViewIsModal role="dialog" testID="readiness-focused-surface" style={[styles.sheet, { backgroundColor: theme.surface }]}>
          <AppMasthead command={<IconButton accessibilityLabel="Cerrar Preparación de hoy" icon={X} onPress={close} />} context="Control local antes de entrenar" title="PREPARACIÓN DE HOY" />
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <AppText color="muted">Este control no diagnostica ni autoriza médicamente. Registra cómo estás hoy.</AppText>
        {stored ? <><AppText>Preparación guardada · Región: {stored.affectedPattern}</AppText>{stored.input ? <AppText>Dolor registrado: {stored.input.pain} de 10 · {stored.input.painTrend === 'stable' ? 'estable' : stored.input.painTrend === 'acute' ? 'agudo' : 'creciente'}{stored.input.persistsAfterModification ? ' · persiste después de modificar' : ''}{stored.input.warningFlags?.length ? ' · señales de alerta: ' + stored.input.warningFlags.join(', ') : ''}</AppText> : null}<AppText>{stored.explanation ?? `Registro anterior: ${stored.reviewRequired ? 'revisión requerida' : stored.sessionStatus === 'PATTERN_STOPPED' || stored.sessionStatus === 'ABORTED' ? 'preparación detenida' : 'preparación registrada'}. No se conserva la entrada original; no se han supuesto síntomas.`}</AppText>{stored.appliedChanges.map(change => <AppText key={change}>{change}</AppText>)}</> : null}
        {locked ? <AppText>Se conserva la preparación registrada. Cambiar una selección no elimina este bloqueo. Sigue el motivo y las indicaciones guardadas antes de volver a entrenar.</AppText> : null}
        {!locked ? <><AppText>Región de la molestia</AppText>{(['other', 'lumbar', 'abdominal'] as const).map(value => <ChoiceControl key={value} label={value === 'other' ? 'Otra región o sin molestia' : value === 'lumbar' ? 'Región lumbar' : 'Región abdominal'} selected={region === value} onPress={() => { if (!pending.current) { setRegion(value); if (input) void persist(input, value); } }} />)}</> : null}
        {!locked && ([
          ['Dolor de 0 a 2, estable', '0–2 · estable', { pain: 1, painTrend: 'stable' }, 'safe'],
          ['Dolor de 3 a 4 o técnica alterada', '3–4 o técnica alterada', { pain: 3, painTrend: 'stable', techniqueChanged: true }, 'caution'],
          ['Dolor persiste después de una modificación', '3–4 persiste después del cambio', { pain: 3, painTrend: 'stable', persistsAfterModification: true }, 'caution'],
          ['Dolor sobre 4, creciente o señal de alerta', 'Sobre 4 o creciente', { pain: 5, painTrend: 'increasing' }, 'danger'],
          ['Hormigueo, adormecimiento, pérdida de fuerza o señal neurológica', 'Señal neurológica o sistémica', { pain: 1, painTrend: 'stable', warningFlags: ['NEUROLOGICAL'] }, 'danger'],
        ] as const).map(([label, copy, decision, tone]) => {
          const checked = input?.pain === decision.pain && input?.painTrend === decision.painTrend && Boolean(input?.techniqueChanged) === Boolean('techniqueChanged' in decision && decision.techniqueChanged) && Boolean(input?.persistsAfterModification) === Boolean('persistsAfterModification' in decision && decision.persistsAfterModification) && Boolean(input?.warningFlags?.length) === Boolean('warningFlags' in decision);
          return <View key={label} style={tone === 'caution' ? styles.caution : tone === 'danger' ? styles.danger : undefined}><ReadinessChoice label={label} copy={copy} decision={decision} selected={checked} onSelect={persist} abdominalRestrictionActive={Boolean(input?.abdominalRestrictionActive)} /></View>;
        })}
        {result ? <><AppText accessibilityRole="header" variant="heading">{result.reviewRequired ? 'Evaluación profesional recomendada' : result.disposition === 'STOP_PATTERN' ? 'Preparación detenida' : result.disposition === 'MODIFY_SET' ? 'Preparación adaptada' : 'Preparación confirmable'}</AppText><FeedbackBanner message={result.explanation} tone={feedbackTone} /></> : null}
        {busy ? <AppText accessibilityRole="alert">Guardando preparación…</AppText> : null}
        {error ? <><FeedbackBanner tone="danger" message={error} /><ActionButton accessibilityLabel="Reintentar guardar preparación" onPress={() => { if (input) void persist(input); }}>Reintentar guardar preparación</ActionButton></> : null}
        {!locked && !busy && !error && savedInput === input && canTrain && input ? <BottomCommandDock><ActionButton accessibilityLabel="Confirmar preparación" onPress={async () => { if (pending.current) return; pending.current = true; setBusy(true); try { await onReady(input); void playContractedHaptic('readinessAccepted'); } catch { setError('No se pudo guardar la preparación. Tu selección se conserva; reintenta.'); } finally { pending.current = false; setBusy(false); } }}>Confirmar y continuar</ActionButton></BottomCommandDock> : null}
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
