import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ActionButton, AppText, FeedbackBanner, TextField } from '@/design-system/v2.2/primitives';
import { ChoiceControl, OperationalSection } from '@/design-system/v2.2/components';
import { radii, spacing , borders, palette as brandPalette, spacing as brandSpacing } from '@/design-system/v2.2/tokens';
import { useAppTheme } from '@/design-system/use-app-theme';
import { defaultSettings, validateSettings, type SettingsStore, type TrainingSettings } from './settings';

const equipment = ['Barra', 'Mancuernas', 'Banco', 'Bandas'];
const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function SettingsPanel({ scenario, store }: { scenario?: 'settings-validation' | undefined; store: SettingsStore }) {
  const theme = useAppTheme();
  const [settings, setSettings] = useState<TrainingSettings>(defaultSettings);
  const [feedback, setFeedback] = useState<{ message: string; danger?: boolean } | null>(null);
  useEffect(() => { store.load().then((saved) => {
    if (scenario === 'settings-validation') {
      setSettings({ ...saved, increments: [] });
      setFeedback({ danger: true, message: 'Añade al menos un incremento positivo.' });
    } else setSettings(saved);
  }); }, [scenario, store]);
  const toggle = (key: 'equipment' | 'schedule', value: string | number) => setSettings((current) => {
    const values = current[key] as (string | number)[];
    return { ...current, [key]: values.includes(value) ? values.filter((item) => item !== value) : [...values, value].sort() } as TrainingSettings;
  });
  const save = async () => {
    const result = validateSettings(settings);
    if (!result.success) return setFeedback({ danger: true, message: result.message });
    await store.save(settings); setFeedback({ message: 'Configuración guardada en este dispositivo.' });
  };
  const choice = (label: string, selected: boolean, onPress: () => void, accessibilityLabel: string) => <ChoiceControl accessibilityLabel={accessibilityLabel} label={label} onPress={onPress} selected={selected} />;
  return <View testID="settings-operational-tools" style={[styles.tools, { borderColor: theme.border }]}>
    <OperationalSection label="Configuración local">
    <AppText color="muted">Equipo, horario y requisitos se guardan sin conexión y se aplican al próximo plan.</AppText>
    <AppText variant="label">Unidad de carga</AppText><View style={styles.wrap}>{(['kg', 'lb'] as const).map((unit) => <View key={unit}>{choice(unit.toUpperCase(), settings.units === unit, () => setSettings({ ...settings, units: unit }), `Usar ${unit}`)}</View>)}</View>
    <TextField accessibilityLabel="Incrementos disponibles" label="Incrementos disponibles" onChangeText={(text) => setSettings({ ...settings, increments: text.split(',').map(Number).filter(Number.isFinite) })} value={settings.increments.join(', ')} />
    <AppText variant="label">Equipo disponible</AppText><View style={styles.wrap}>{equipment.map((item) => <View key={item}>{choice(item, settings.equipment.includes(item), () => toggle('equipment', item), `Alternar equipo ${item}`)}</View>)}</View>
    <AppText variant="label">Días de entrenamiento</AppText><View style={styles.wrap}>{days.map((day, index) => <View key={day}>{choice(day, settings.schedule.includes(index + 1), () => toggle('schedule', index + 1), `Alternar día ${day}`)}</View>)}</View>
    <AppText variant="label">Requisitos del plan</AppText>{settings.requirements.map((requirement, index) => <TextField key={requirement.kind} accessibilityLabel={`Requisito ${requirement.kind}`} label={requirement.kind} onChangeText={(value) => setSettings({ ...settings, requirements: settings.requirements.map((item, itemIndex) => itemIndex === index ? { ...item, value } : item) })} value={requirement.value} />)}
    <TextField accessibilityLabel="Restricciones activas" label="Restricciones activas (separadas por coma)" onChangeText={(text) => setSettings({ ...settings, restrictions: text.split(',').map((value) => value.trim()).filter(Boolean) })} placeholder="Ej. sin impacto" value={settings.restrictions.join(', ')} />
    {feedback ? <FeedbackBanner message={feedback.message} tone={feedback.danger ? 'danger' : 'success'} /> : null}
    <ActionButton accessibilityLabel="Guardar configuración local" onPress={save}>Guardar configuración</ActionButton>
    </OperationalSection>
  </View>;
}

const styles = StyleSheet.create({ check: { alignItems: 'center', height: 20, justifyContent: 'center', width: 20 }, choice: { alignItems: 'center', borderRadius: radii.control, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.md }, sectionBand: { backgroundColor: brandPalette.ink, paddingHorizontal: brandSpacing.lg, paddingVertical: brandSpacing.md }, sectionBandText: { color: brandPalette.paper }, tools: { borderBottomWidth: borders.emphasis, borderTopWidth: borders.emphasis, gap: brandSpacing.lg, paddingBottom: brandSpacing.lg }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm } });
