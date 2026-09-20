import { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Check, ArrowLeft, ArrowRight } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useDataServices } from '@/data/repositories/provider';
import { exerciseCatalog } from '@/data/seeds/exercises';
import { AppMasthead, BrandContent } from '@/design-system/v2.2/components';
import { ActionButton, AppSheet, AppText, FeedbackBanner, Screen, TextField } from '@/design-system/v2.2/primitives';
import { spacing, palette } from '@/design-system/v2.2/tokens';
import { useAppTheme } from '@/design-system/use-app-theme';
import { catalogEquipment, equipmentLabels, normalizeEquipment, requirementKinds, requirementOptions, restrictionLabels } from '@/domain/prescriptions/catalog-options';
import { DemoControls } from '@/features/demo/DemoModeProvider';
import { referenceKeys, referenceLabels } from '@/features/settings/reference-draft';
import { FirstUseConflictError, FirstUseService, FirstUseValidationError, type FirstUseDraft } from '@/features/setup/first-use';
import { prescriptionQuantity } from '@/domain/prescriptions/measurement';

const titles = ['Tu objetivo', 'Tus tres días', 'Tu gimnasio', 'Tus referencias', 'Tu plan está listo'];
const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const cycleLabels = { reentry: 'Reentrada', strength: 'Fuerza', hypertrophy: 'Hipertrofia', power: 'Potencia', transition: 'Transición' };

function Choice({ label, selected, onPress, multiple = false, disabled }: { label: string; selected: boolean; onPress(): void; multiple?: boolean; disabled: boolean }) {
  const theme = useAppTheme();
  const color = selected ? palette.ink : theme.text;
  return <Pressable accessibilityRole={multiple ? 'checkbox' : 'radio'} accessibilityLabel={label} accessibilityState={{ checked: selected, disabled }} aria-checked={selected} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.choice, { backgroundColor: selected ? palette.signal : theme.surface, borderColor: theme.textMuted, opacity: pressed ? 0.8 : 1 }]}>
    <View style={[styles.mark, { borderColor: color, borderRadius: multiple ? 0 : 10 }]}>{selected ? <Check color={color} size={16} /> : null}</View>
    <AppText style={{ flex: 1, color }} variant="bodyStrong">{label}</AppText>
  </Pressable>;
}

export default function SetupRoute() {
  const router = useRouter();
  const db = useSQLiteContext();
  const { programs } = useDataServices();
  const service = useMemo(() => new FirstUseService(db), [db]);
  const theme = useAppTheme();
  const scroll = useRef<ScrollView>(null);
  const [draft, setDraft] = useState<FirstUseDraft | null>(null);
  const current = useRef<FirstUseDraft | null>(null);
  const pending = useRef<Promise<void>>(Promise.resolve());
  const locked = useRef(false);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [requirementsOpen, setRequirementsOpen] = useState(false);
  const [confirmReload, setConfirmReload] = useState(false);
  useEffect(() => {
    mounted.current = true;
    void (async () => {
      if (await programs.getActiveCycleId()) { if (mounted.current) setExisting('Ya tienes un plan activo. Tus entrenamientos se conservan.'); return; }
      if ((await programs.listCycleSnapshots()).length) { if (mounted.current) setExisting('Ya tienes un plan guardado. Revísalo en Plan; tus entrenamientos se conservan.'); return; }
      const loaded = await service.load();
      if (mounted.current) { current.current = loaded; setDraft(loaded); }
    })().catch(() => { if (mounted.current) setError('No se pudo abrir tu borrador. Reintenta sin borrar tus datos.'); });
    return () => { mounted.current = false; };
  }, [service, programs, attempt]);

  const persist = (next: FirstUseDraft) => {
    current.current = next; setDraft(next); setSaving(true); setError(null);
    const write = pending.current.catch(() => {}).then(() => service.save(next));
    pending.current = write;
    void write.then(() => { if (mounted.current && current.current === next) setSaving(false); }).catch(failure => {
      if (mounted.current) { setSaving(false); setError(failure instanceof FirstUseConflictError ? failure.message : 'No se pudo guardar el borrador. Tus cambios siguen aquí; reintenta antes de salir.'); }
    });
    return write;
  };
  const change = (update: Partial<FirstUseDraft>) => { if (current.current && !locked.current) void persist({ ...current.current, ...update }).catch(() => {}); };
  const action = async (task: () => Promise<void>, recover = false) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(null); Keyboard.dismiss();
    try { await (recover ? pending.current.catch(() => {}) : pending.current); await task(); }
    catch (failure) {
      setError(failure instanceof FirstUseConflictError || failure instanceof FirstUseValidationError ? failure.message : 'No se pudo guardar. Tus datos se conservaron; reintenta.');
    }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  };
  const stepTo = (step: number) => void action(async () => {
    const next = { ...current.current!, step };
    if (step === 2 && (next.settings.schedule.length !== 3 || new Set(next.settings.schedule).size !== 3)) throw new FirstUseValidationError('Elige exactamente tres días de entrenamiento.');
    if (step === 4) service.preview(next);
    await persist(next); setExpanded(null); scroll.current?.scrollTo({ y: 0, animated: false });
  });
  const leave = () => void action(async () => { await service.save(current.current!); router.replace('/'); });
  if (existing) return <Screen><AppMasthead title="Tu plan" /><AppText>{existing}</AppText><ActionButton onPress={() => router.replace('/plan')}>Ver mi plan</ActionButton></Screen>;
  if (!draft) return <Screen><AppMasthead title="Crear mi plan" />{error ? <><FeedbackBanner tone="danger" message={error} /><ActionButton onPress={() => { setError(null); setAttempt(value => value + 1); }}>Reintentar</ActionButton></> : <AppText>Abriendo tu borrador...</AppText>}<ActionButton tone="secondary" onPress={() => router.replace('/')}>Volver a Hoy</ActionButton></Screen>;
  const updateSettings = (values: Partial<FirstUseDraft['settings']>) => change({ settings: { ...draft.settings, ...values } });
  const toggle = (key: 'schedule' | 'restrictions', value: number | string) => {
    const values = draft.settings[key] as (number | string)[];
    updateSettings({ [key]: values.includes(value) ? values.filter(item => item !== value) : [...values, value].sort() });
  };
  let preview: ReturnType<FirstUseService['preview']> = [];
  let previewError: string | null = null;
  if (draft.step === 4) { try { preview = service.preview(draft); } catch (failure) { previewError = (failure as Error).message; } }
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
    <Screen scrollRef={scroll} testID="personal-setup" footer={<SafeAreaView edges={['bottom']} style={[styles.footer, { backgroundColor: theme.canvas, borderColor: theme.border }]}>
      {draft.step < 4 ? <ActionButton busy={busy} icon={ArrowRight} onPress={() => stepTo(draft.step + 1)}>{draft.step === 3 ? 'Ver mi plan' : 'Continuar'}</ActionButton>
        : <ActionButton busy={busy} disabled={!!previewError} onPress={() => void action(async () => { await service.activate(current.current!); router.replace('/'); })}>Activar mi plan</ActionButton>}
      <View style={styles.footerRow}>
        {draft.step > 0 ? <View style={styles.flex}><ActionButton disabled={busy} icon={ArrowLeft} tone="secondary" onPress={() => stepTo(draft.step - 1)}>Atrás</ActionButton></View> : null}
        <View style={styles.flex}><ActionButton disabled={busy} tone="secondary" onPress={leave}>Guardar y salir</ActionButton></View>
      </View>
    </SafeAreaView>}>
      <AppMasthead title="MI PLAN" context={`PASO ${draft.step + 1} DE 5`} />
      <BrandContent>
        <View style={styles.section}>
          <AppText accessibilityRole="header" aria-level={2} variant="heading">{titles[draft.step]}</AppText>
          <AppText accessibilityLiveRegion="polite" color="muted" variant="caption">{saving ? 'Guardando borrador...' : 'Borrador local · sin activar'}</AppText>
          {error || previewError ? <FeedbackBanner tone="danger" message={error ?? previewError!} /> : null}
          {error ? <ActionButton disabled={busy} tone="secondary" onPress={() => { void persist(current.current!).catch(() => {}); }}>Reintentar guardado</ActionButton> : null}
          {error ? <ActionButton disabled={busy} tone="secondary" onPress={() => setConfirmReload(true)}>Recargar borrador guardado</ActionButton> : null}
          {draft.step === 0 ? <>
            <AppText variant="label">Objetivo del próximo ciclo</AppText>
            <Choice label="Fuerza" selected={draft.goal === 'strength'} disabled={busy} onPress={() => change({ goal: 'strength' })} />
            <Choice label="Hipertrofia" selected={draft.goal === 'hypertrophy'} disabled={busy} onPress={() => change({ goal: 'hypertrophy' })} />
            <AppText variant="label">Tu ritmo actual</AppText>
            <Choice label="Estoy retomando" selected={draft.experience === 'returning'} disabled={busy} onPress={() => change({ experience: 'returning' })} />
            <Choice label="Entreno con regularidad" selected={draft.experience === 'regular'} disabled={busy} onPress={() => change({ experience: 'regular' })} />
            <AppText color="muted">{draft.experience === 'returning' ? 'Dos semanas de reentrada antes de tu ciclo de cuatro semanas.' : 'Un ciclo de cuatro semanas. La preparación de cada sesión mantiene tus restricciones.'}</AppText>
            {!saving && !error ? <DemoControls /> : null}
          </> : null}
          {draft.step === 1 ? <>
            <AppText color="muted">{draft.settings.schedule.length} de 3 días seleccionados</AppText>
            {days.map((day, index) => <Choice key={day} multiple label={day} selected={draft.settings.schedule.includes(index + 1)} disabled={busy} onPress={() => toggle('schedule', index + 1)} />)}
          </> : null}
          {draft.step === 2 ? <>
            <AppText variant="label">Equipo disponible</AppText>
            {catalogEquipment.filter(item => item !== 'bodyweight').map(item => <Choice key={item} multiple label={equipmentLabels[item] ?? item} selected={draft.settings.equipment.some(value => normalizeEquipment(value) === item)} disabled={busy} onPress={() => updateSettings({ equipment: draft.settings.equipment.some(value => normalizeEquipment(value) === item) ? draft.settings.equipment.filter(value => normalizeEquipment(value) !== item) : [...draft.settings.equipment, item] })} />)}
            <Choice label="Solo peso corporal" selected={draft.settings.equipment.length === 1 && draft.settings.equipment[0] === 'bodyweight'} disabled={busy} onPress={() => updateSettings({ equipment: ['bodyweight'] })} />
            <AppText variant="label">Restricciones</AppText>
            {Object.entries(restrictionLabels).map(([value, label]) => <Choice key={value} multiple label={label} selected={draft.settings.restrictions.includes(value)} disabled={busy} onPress={() => toggle('restrictions', value)} />)}
            <ActionButton disabled={busy} tone="secondary" onPress={() => setRequirementsOpen(value => !value)}>{requirementsOpen ? 'Cerrar ejercicios preferidos' : 'Revisar ejercicios preferidos'}</ActionButton>
            {requirementsOpen ? <>
              {draft.settings.requirements.map((requirement, index) => <View key={index} style={styles.section}>
                <AppText variant="label">Preferencia {index + 1}</AppText>
                {Object.entries(requirementKinds).map(([kind, label]) => <Choice key={kind} label={`${label} ${index + 1}`} selected={kind === requirement.kind} disabled={busy} onPress={() => updateSettings({ requirements: draft.settings.requirements.map((item, i) => i === index ? { kind: kind as typeof requirement.kind, value: '' } : item) })} />)}
                {requirementOptions(requirement.kind).map(option => <Choice key={option.value} label={`${option.label} · preferencia ${index + 1}`} selected={option.value === requirement.value} disabled={busy} onPress={() => updateSettings({ requirements: draft.settings.requirements.map((item, i) => i === index ? { ...item, value: option.value } : item) })} />)}
                <ActionButton disabled={busy} tone="secondary" onPress={() => updateSettings({ requirements: draft.settings.requirements.filter((_, i) => i !== index) })}>Quitar preferencia {index + 1}</ActionButton>
              </View>)}
              <ActionButton disabled={busy} tone="secondary" onPress={() => updateSettings({ requirements: [...draft.settings.requirements, { kind: 'CAPABILITY', value: 'core' }] })}>Añadir preferencia</ActionButton>
            </> : null}
          </> : null}
          {draft.step === 3 ? <>
            <AppText color="muted">Solo referencias que ya conoces. No necesitas probar tu máximo.</AppText>
            {referenceKeys.map(key => <View key={key} style={styles.section}>
              <AppText variant="label">{referenceLabels[key]}</AppText>
              <Choice label={`Conozco mi referencia de ${referenceLabels[key]}`} selected={draft.references[key].known} disabled={busy} onPress={() => change({ references: { ...draft.references, [key]: { ...draft.references[key], known: true, edited: true } } })} />
              <Choice label={`No sé mi referencia de ${referenceLabels[key]}`} selected={!draft.references[key].known} disabled={busy} onPress={() => change({ references: { ...draft.references, [key]: { ...draft.references[key], known: false, edited: true } } })} />
              {draft.references[key].known ? <TextField label={`Referencia de ${referenceLabels[key]}`} unit={key === 'strictPullUpCapacity' ? 'reps' : draft.settings.profileUnit ?? draft.settings.units} keyboardType="decimal-pad" editable={!busy} value={draft.references[key].text} onChangeText={text => change({ references: { ...draft.references, [key]: { ...draft.references[key], text, edited: true } } })} /> : <AppText color="muted">Carga por definir</AppText>}
            </View>)}
          </> : null}
          {draft.step === 4 ? <>
            <AppText>{draft.settings.schedule.map(day => days[day - 1]).join(' · ')}</AppText>
            {preview.map(cycle => <View key={cycle.id} style={[styles.cycle, { borderColor: theme.border }]}>
              <AppText variant="heading">{cycleLabels[cycle.type]} · {cycle.weeks.length} semanas</AppText>
              {cycle.weeks[0]?.sessions.map((session, index) => <View key={index} style={styles.section}>
                <ActionButton tone="secondary" onPress={() => setExpanded(expanded === `${cycle.id}-${index}` ? null : `${cycle.id}-${index}`)}>{`${days[session.dayIndex - 1]} · ${session.exercises.length} ejercicios`}</ActionButton>
                {expanded === `${cycle.id}-${index}` ? session.exercises.map((exercise, i) => <View key={i} style={styles.exercise}>
                  <AppText variant="bodyStrong">{exerciseCatalog.find(item => item.id === exercise.exerciseId)?.name}</AppText>
                  <AppText color="muted">{prescriptionQuantity(exercise)} · {exercise.calculatedLoad === undefined ? 'Carga por definir' : `${exercise.calculatedLoad} ${exercise.loadUnit}`} · RIR {exercise.target.rir.min}-{exercise.target.rir.max}</AppText>
                </View>) : null}
              </View>)}
            </View>)}
          </> : null}
          {draft.step === 2 || draft.step === 4 ? <>
            <AppText color="muted">Si cambiaste Configuración, puedes reemplazar el equipo, horario y referencias de este borrador con esas preferencias.</AppText>
            <ActionButton disabled={busy} tone="secondary" onPress={() => void action(async () => {
              const next = await service.useSavedSettings(current.current!);
              current.current = next; setDraft(next); setExpanded(null);
            })}>Usar preferencias guardadas</ActionButton>
          </> : null}
        </View>
      </BrandContent>
      <AppSheet visible={confirmReload} title="Recargar el borrador" onDismiss={() => { if (!busy) setConfirmReload(false); }}>
        <AppText>Se reemplazarán los cambios sin guardar de esta pantalla por el último borrador guardado. Tu plan e historial no cambian.</AppText>
        <ActionButton busy={busy} onPress={() => void action(async () => {
          const loaded = await service.load();
          pending.current = Promise.resolve(); current.current = loaded; setDraft(loaded); setSaving(false);
          setConfirmReload(false); scroll.current?.scrollTo({ y: 0, animated: false });
        }, true)}>Confirmar recarga</ActionButton>
        <ActionButton disabled={busy} tone="secondary" onPress={() => setConfirmReload(false)}>Conservar mis cambios</ActionButton>
      </AppSheet>
    </Screen>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  section: { gap: spacing.md, paddingVertical: spacing.md },
  choice: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52, padding: spacing.md, borderWidth: 1 },
  mark: { width: 20, height: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  footer: { padding: spacing.md, gap: spacing.sm, borderTopWidth: 1 },
  footerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  flex: { flex: 1, minWidth: 130 },
  cycle: { borderTopWidth: 1, paddingVertical: spacing.md, gap: spacing.sm },
  exercise: { gap: spacing.xs, paddingVertical: spacing.sm },
});
