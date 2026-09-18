import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ActionButton, AppText, FeedbackBanner, TextField } from '@/design-system/v2.2/primitives';
import { ChoiceControl, OperationalSection } from '@/design-system/v2.2/components';
import { radii, spacing , borders, palette as brandPalette, spacing as brandSpacing } from '@/design-system/v2.2/tokens';
import { useAppTheme } from '@/design-system/use-app-theme';
import { defaultSettings, validateSettings, type SettingsStore, type TrainingSettings } from './settings';

import { catalogEquipment, equipmentLabels, normalizeEquipment, normalizeRequirement, requirementKinds, requirementOptions, restrictionLabels } from '../../domain/prescriptions/catalog-options';

import { commitReferences, referenceDraft, referenceKeys, referenceLabels, type ReferenceDraft } from './reference-draft';

const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function SettingsPanel({ scenario, store }: { scenario?: 'settings-validation' | undefined; store: SettingsStore }) {
  const theme = useAppTheme();
  const [settings, setSettings] = useState<TrainingSettings>(defaultSettings);
  const [baseline, setBaseline] = useState<TrainingSettings | null>(null);
  const [increments, setIncrements] = useState<string[]>([]);
  const [references, setReferences] = useState<ReferenceDraft>(() => referenceDraft(defaultSettings));
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [feedback, setFeedback] = useState<{ message: string; danger?: boolean; requirementIndex?: number } | null>(null);
  useEffect(() => {
    let live = true;
    store.load().then((saved) => {
      if (!live) return;
      setBaseline(saved);
      setSettings(saved);
      setReferences(referenceDraft(saved));
      setIncrements(scenario === 'settings-validation' ? [] : saved.increments.map(String));
      if (scenario === 'settings-validation') setFeedback({ danger: true, message: 'Añade al menos un incremento positivo.' });
    }).catch(() => { if (live) setFeedback({ danger: true, message: 'No se pudo cargar la configuración. Vuelve a abrir esta pantalla.' }); });
    return () => { live = false; };
  }, [scenario, store]);
  const toggle = (key: 'equipment' | 'schedule' | 'restrictions', value: string | number) => setSettings((current) => {
    const values = current[key] as (string | number)[];
    return { ...current, [key]: values.includes(value) ? values.filter((item) => item !== value) : [...values, value].sort() } as TrainingSettings;
  });
  const save = async () => {
    if (!baseline || saving.current) return;
    // Keep the editing text untouched until the user commits a complete decimal.
    if (!increments.length || increments.some((text) => !/^\d+(?:[.,]\d+)?$/.test(text.trim()) || !Number.isFinite(Number(text.replace(',', '.'))) || Number(text.replace(',', '.')) <= 0)) {
      setFeedback({ danger: true, message: 'Escribe cada incremento como un número positivo completo (por ejemplo, 1,25).' });
      return;
    }
    let next: TrainingSettings;
    try {
      next = commitReferences({ ...settings, increments: increments.map((text) => Number(text.trim().replace(',', '.'))) }, references);
      if (next.profile) next.profileUnit = baseline.profileUnit ?? baseline.units;
    } catch (error) { setFeedback({ danger: true, message: (error as Error).message }); return; }
    const result = validateSettings(next);
    if (!result.success) return setFeedback({ danger: true, message: result.message, ...(result.requirementIndex !== undefined ? { requirementIndex: result.requirementIndex } : {}) });
    saving.current = true; setBusy(true);
    try {
      await store.save(next, baseline);
      setSettings(next); setBaseline(next); setReferences(referenceDraft(next));
      setFeedback({ message: 'Configuración guardada en este dispositivo.' });
    } catch (error) {
      setFeedback({ danger: true, message: error instanceof Error && error.name === 'SettingsConflictError' ? error.message : 'No se pudo guardar la configuración. Tus cambios siguen aquí; vuelve a intentar guardar.' });
    } finally { saving.current = false; setBusy(false); }
  };
  const choice = (label: string, selected: boolean, onPress: () => void, accessibilityLabel: string) => <ChoiceControl busy={busy} disabled={!baseline} accessibilityLabel={accessibilityLabel} label={label} onPress={() => { if (!saving.current && baseline) onPress(); }} selected={selected} />;
  return <View testID="settings-operational-tools" style={[styles.tools, { borderColor: theme.border }]}>
    <OperationalSection label="Configuración local">
    <AppText color="muted">Equipo, horario y requisitos se guardan sin conexión y se aplican al próximo plan.</AppText>
    <AppText variant="label">Unidad de carga</AppText><View style={styles.wrap}>{(['kg', 'lb'] as const).map((unit) => <View key={unit}>{choice(unit.toUpperCase(), settings.units === unit, () => setSettings({ ...settings, units: unit }), `Usar ${unit}`)}</View>)}</View>
    <AppText variant="label">Incrementos disponibles ({settings.units})</AppText>
    <AppText color="muted">Un valor por campo. Usa punto o coma decimal; el próximo plan redondea al menor incremento.</AppText>
    {increments.map((text, index) => <View key={index} style={{ gap: spacing.sm }}>
      <TextField editable={!busy && !!baseline} accessibilityLabel={`Incremento ${index + 1}`} label={`Incremento ${index + 1} (${settings.units})`} keyboardType="decimal-pad" onChangeText={(value) => setIncrements((current) => current.map((item, i) => i === index ? value : item))} value={text} />
      <ActionButton accessibilityLabel={`Quitar incremento ${index + 1}`} disabled={busy} onPress={() => setIncrements((current) => current.filter((_, i) => i !== index))} tone="secondary">Quitar incremento {index + 1}</ActionButton>
    </View>)}
    <ActionButton accessibilityLabel="Añadir incremento" disabled={busy || !baseline} onPress={() => setIncrements((current) => [...current, ''])} tone="secondary">Añadir incremento</ActionButton>
    <AppText variant="label">Referencias personales</AppText>
    <AppText color="muted">Usa referencias que ya conoces; no necesitas probar tu máximo. No lo sé deja la carga por definir. Solo cambia el próximo plan, nunca el trabajo guardado.</AppText>
    {referenceKeys.map(key => <View key={key} style={{ gap: spacing.sm }}>
      <AppText variant="label">{referenceLabels[key]}</AppText>
      <View style={styles.wrap}>
        {choice('La conozco', references[key].known, () => setReferences(current => ({ ...current, [key]: { ...current[key], known: true, edited: true } })), `Conozco mi referencia de ${referenceLabels[key]}`)}
        {choice('No lo sé', !references[key].known, () => setReferences(current => ({ ...current, [key]: { ...current[key], known: false, edited: true } })), `No sé mi referencia de ${referenceLabels[key]}`)}
      </View>
      {references[key].known ? <TextField editable={!busy && !!baseline} accessibilityLabel={`Referencia de ${referenceLabels[key]}`} label={`${referenceLabels[key]} (${key === 'strictPullUpCapacity' ? 'repeticiones' : baseline?.profileUnit ?? baseline?.units ?? 'kg'})`} keyboardType="decimal-pad" value={references[key].text} onChangeText={text => setReferences(current => ({ ...current, [key]: { ...current[key], text, edited: true } }))} /> : <AppText color="muted">Sin referencia · no inventaremos una carga</AppText>}
      <AppText color="muted">{references[key].edited ? 'Cambio sin guardar' : !references[key].known ? 'Referencia desconocida' : settings.referenceSources?.[key] === 'user' ? 'Referencia indicada por ti' : 'Referencia guardada previamente'}</AppText>
    </View>)}
    <AppText variant="label">Equipo disponible</AppText>
    <AppText color="muted">El peso corporal está siempre disponible. Marca solo el equipo al que tienes acceso.</AppText>
    <View style={styles.wrap}>{catalogEquipment.filter(item => item !== 'bodyweight').map((item) => <View key={item}>{choice(equipmentLabels[item] ?? item, settings.equipment.some(value => normalizeEquipment(value) === item), () => setSettings(current => ({ ...current, equipment: current.equipment.some(value => normalizeEquipment(value) === item) ? current.equipment.filter(value => normalizeEquipment(value) !== item) : [...current.equipment, item] })), `Alternar equipo ${equipmentLabels[item] ?? item}`)}</View>)}</View>
    {settings.equipment.filter(item => !catalogEquipment.includes(normalizeEquipment(item))).map((item, index) => <View key={index}>
      <AppText>Equipo guardado no compatible: {item}</AppText>
      <ActionButton disabled={busy || !baseline} tone="secondary" onPress={() => setSettings(current => ({ ...current, equipment: current.equipment.filter(value => value !== item) }))}>Quitar equipo guardado: {item}</ActionButton>
    </View>)}
    {choice('Solo peso corporal', settings.equipment.length === 1 && settings.equipment[0] === 'bodyweight', () => setSettings(current => ({ ...current, equipment: ['bodyweight'] })), 'Usar solo peso corporal')}
    <AppText variant="label">Días de entrenamiento · elige tres</AppText><View style={styles.wrap}>{days.map((day, index) => <View key={day}>{choice(day, settings.schedule.includes(index + 1), () => toggle('schedule', index + 1), `Alternar día ${day}`)}</View>)}</View>
    <AppText variant="label">Requisitos del plan</AppText>
    <AppText color="muted">Cada requisito debe ser compatible con el equipo y las restricciones. No cambiamos automáticamente un ejercicio concreto por otro.</AppText>
    {settings.requirements.map((requirement, index) => {
      const options = requirementOptions(requirement.kind);
      const selected = options.find(option => option.value === normalizeRequirement(requirement.kind, requirement.value));
      const updateRequirement = (value: string, kind = requirement.kind) => {
        setSettings(current => ({ ...current, requirements: current.requirements.map((item, itemIndex) => itemIndex === index ? { kind, value } : item) }));
        setFeedback(null);
      };
      return <View key={index} style={{ gap: spacing.sm }}>
        <AppText variant="label">Requisito {index + 1} · {requirementKinds[requirement.kind] ?? 'Tipo no compatible'}</AppText>
        <AppText>{selected ? `Seleccionado: ${selected.label}` : `Valor guardado sin resolver: ${requirement.kind} / ${requirement.value || '(sin selección)'}`}</AppText>
        <View style={styles.wrap}>{Object.entries(requirementKinds).map(([kind, label]) => <View key={kind}>{choice(label, requirement.kind === kind, () => updateRequirement('', kind as typeof requirement.kind), `Tipo ${label} para requisito ${index + 1}`)}</View>)}</View>
        {feedback?.requirementIndex === index ? <FeedbackBanner message={feedback.message} tone="danger" /> : null}
        <View style={styles.wrap}>{options.map((option) => <View key={option.value}>{choice(option.label, selected?.value === option.value, () => updateRequirement(option.value), `Elegir ${option.label} para requisito ${index + 1}`)}</View>)}</View>
        <ActionButton disabled={busy || !baseline} tone="secondary" onPress={() => { setSettings(current => ({ ...current, requirements: current.requirements.filter((_, i) => i !== index) })); setFeedback(null); }}>Quitar requisito {index + 1}</ActionButton>
      </View>;
    })}
    <ActionButton disabled={busy || !baseline} tone="secondary" onPress={() => setSettings(current => ({ ...current, requirements: [...current.requirements, { kind: 'EXACT', value: '' }] }))}>Añadir requisito</ActionButton>
    <AppText variant="label">Restricciones activas</AppText>
    <AppText color="muted">Conserva las restricciones que necesitas. Las opciones limitan el catálogo; no sustituyen una evaluación profesional.</AppText>
    <View style={styles.wrap}>{Object.entries(restrictionLabels).map(([value, label]) => <View key={value}>{choice(label, settings.restrictions.some(item => item.trim().toLowerCase() === value), () => setSettings(current => ({ ...current, restrictions: current.restrictions.some(item => item.trim().toLowerCase() === value) ? current.restrictions.filter(item => item.trim().toLowerCase() !== value) : [...current.restrictions, value] })), `Alternar restricción ${label}`)}</View>)}</View>
    {settings.restrictions.filter(item => !Object.hasOwn(restrictionLabels, item.trim().toLowerCase())).map((item, index) => <View key={index}>
      <AppText>Restricción guardada no compatible: {item}. Revísala antes de quitarla; no podemos interpretarla automáticamente.</AppText>
      <ActionButton disabled={busy || !baseline} tone="secondary" onPress={() => setSettings(current => ({ ...current, restrictions: current.restrictions.filter(value => value !== item) }))}>Quitar restricción guardada: {item}</ActionButton>
    </View>)}
    {feedback && feedback.requirementIndex === undefined ? <FeedbackBanner message={feedback.message} tone={feedback.danger ? 'danger' : 'success'} /> : null}
    <ActionButton accessibilityLabel="Cancelar cambios de configuración" disabled={busy || !baseline} tone="secondary" onPress={() => {
      if (!baseline || saving.current) return;
      setSettings(baseline); setIncrements(baseline.increments.map(String)); setReferences(referenceDraft(baseline)); setFeedback(null);
    }}>Cancelar cambios</ActionButton>
    <ActionButton accessibilityLabel="Guardar configuración local" busy={busy} disabled={busy || !baseline} onPress={() => { void save(); }}>{busy ? 'Guardando…' : 'Guardar configuración'}</ActionButton>
    </OperationalSection>
  </View>;
}

const styles = StyleSheet.create({ check: { alignItems: 'center', height: 20, justifyContent: 'center', width: 20 }, choice: { alignItems: 'center', borderRadius: radii.control, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.md }, sectionBand: { backgroundColor: brandPalette.ink, paddingHorizontal: brandSpacing.lg, paddingVertical: brandSpacing.md }, sectionBandText: { color: brandPalette.paper }, tools: { borderBottomWidth: borders.emphasis, borderTopWidth: borders.emphasis, gap: brandSpacing.lg, paddingBottom: brandSpacing.lg }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm } });
