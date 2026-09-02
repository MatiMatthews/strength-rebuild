import type { LucideIcon } from 'lucide-react-native';
import type { PropsWithChildren, ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { borders, palette, radii, spacing, typography } from '../tokens';
import { useAppTheme } from '../../use-app-theme';

const contentWidth = 800;

export function BrandMark() {
  return <View accessibilityLabel="Strength Rebuild" style={styles.mark}><Text style={styles.markText}>SR</Text></View>;
}

export function CutCornerSurface({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
  return <View style={[styles.cutCorner, style]}>{children}</View>;
}

export function BrandBand({ children, testID, tone = 'signal' }: PropsWithChildren<{ testID?: string; tone?: 'signal' | 'ink' }>) {
  return <View testID={testID} style={[styles.band, tone === 'ink' && styles.inkBand]}><View testID="brand-band-content" style={styles.bandContent}>{children}</View></View>;
}

export function Ordinal({ value }: { value: number | string }) {
  const theme = useAppTheme();
  return <Text accessibilityLabel={`Ejercicio ${value}`} style={[styles.ordinal, { color: theme.text }]}>{String(value).padStart(2, '0')}</Text>;
}

export type Metric = { label: string; value: string; hint?: string };
export function MetricStrip({ metrics }: { metrics: readonly Metric[] }) {
  const theme = useAppTheme();
  return <View style={[styles.metricStrip, { borderColor: theme.border }]}>{metrics.map((metric) => <View key={metric.label} style={styles.metric}><Text style={[styles.metricLabel, { color: theme.textMuted }]}>{metric.label}</Text><Text style={[styles.metricValue, { color: theme.text }]}>{metric.value}</Text>{metric.hint ? <Text style={[styles.hint, { color: theme.textMuted }]}>{metric.hint}</Text> : null}</View>)}</View>;
}

export function CycleProgressBand({ current, total }: { current: number; total: number }) {
  const safeTotal = Math.max(1, total); const safeCurrent = Math.max(1, Math.min(current, safeTotal));
  return <View accessibilityLabel={`Semana ${safeCurrent} de ${safeTotal}`} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: safeTotal, now: safeCurrent }} style={styles.progressBand}>{Array.from({ length: safeTotal }, (_, index) => <View key={index} style={[styles.progressStep, index < safeCurrent && styles.progressComplete, index === safeCurrent - 1 && styles.progressCurrent]} />)}</View>;
}

export function StatusActionBand({ actionLabel, detail, onAction, title }: { actionLabel: string; detail?: string; onAction: () => void; title: string }) {
  const theme = useAppTheme();
  return <View style={[styles.statusBand, { borderColor: theme.text }]}><View style={styles.flex}><Text style={[styles.heading, { color: theme.text }]}>{title}</Text>{detail ? <Text accessibilityLabel={detail} style={[styles.body, { color: theme.textMuted }]}>{detail}</Text> : null}</View><Command label={actionLabel} onPress={onAction} /></View>;
}

function Command({ icon: Icon, label, onPress }: { icon?: LucideIcon | undefined; label: string; onPress: () => void }) {
  return <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.command, pressed && styles.pressed]}>{Icon ? <Icon color={palette.paper} size={20} /> : null}<Text style={styles.commandText}>{label}</Text></Pressable>;
}

export function ExerciseRunSheetRow({ actionLabel, detail, icon, name, onPress, ordinal, trailing }: { actionLabel: string; detail: string; icon?: LucideIcon; name: string; onPress: () => void; ordinal: number; trailing?: ReactNode }) {
  const theme = useAppTheme();
  return <View style={[styles.row, { borderColor: theme.border }]}><Ordinal value={ordinal} /><View style={styles.flex}><Text style={[styles.heading, { color: theme.text }]}>{name}</Text><Text style={[styles.body, { color: theme.textMuted }]}>{detail}</Text></View>{trailing ?? <Command icon={icon} label={actionLabel} onPress={onPress} />}</View>;
}

export function BrandContent({ children }: PropsWithChildren) { return <View style={styles.content}>{children}</View>; }

export function AppMasthead({ command, context, testID, title }: { command?: ReactNode; context?: string; testID?: string; title: string }) {
  const compactTitle = title.split(/\s+/).some((word) => word.length > 10);
  return <BrandBand {...(testID ? { testID } : {})}><View style={styles.masthead}><BrandMark /><View accessible accessibilityLabel={context ? `${title} · ${context}` : title} style={styles.mastheadText}><Text accessibilityRole="header" aria-level={1} style={[styles.display, compactTitle && styles.compactDisplay]}>{title}</Text>{context ? <Text style={styles.label}>{context}</Text> : null}</View>{command}</View></BrandBand>;
}

export function PhaseBand({ current, label, testID, total }: { current?: number; label: string; testID?: string; total?: number }) {
  return <BrandBand {...(testID ? { testID } : {})} tone="ink"><Text style={styles.phaseLabel}>{label}</Text>{current && total ? <SegmentedRail current={current} total={total} /> : null}</BrandBand>;
}

export function SegmentedRail({ current, total }: { current: number; total: number }) { return <CycleProgressBand current={current} total={total} />; }

export function RuledHeader({ metrics = [], title }: { metrics?: readonly Metric[]; title: string }) {
  const theme = useAppTheme(); return <View><Text style={[styles.title, { color: theme.text }]}>{title}</Text>{metrics.length ? <MetricStrip metrics={metrics} /> : null}</View>;
}

export function CommandButton({ children, disabled = false, onPress }: PropsWithChildren<{ disabled?: boolean; onPress: () => void }>) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.command, pressed && styles.pressed]}><Text style={styles.commandText}>{children}</Text></Pressable>;
}

export function IconCommand({ icon: Icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  return <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.iconCommand, pressed && styles.pressed]}><Icon color={palette.paper} size={22} /></Pressable>;
}

export function ChoiceControl({ accessibilityLabel, label, onPress, selected }: { accessibilityLabel?: string; label: string; onPress: () => void; selected: boolean }) {
  const theme = useAppTheme();
  return <Pressable accessibilityLabel={accessibilityLabel ?? label} accessibilityRole="radio" accessibilityState={{ checked: selected }} aria-checked={selected} onPress={onPress} style={[styles.choice, selected && styles.choiceSelected]}><View style={[styles.choiceMark, selected && styles.choiceMarkSelected]} /><Text style={[styles.label, { color: selected ? palette.ink : theme.text }]}>{label}</Text></Pressable>;
}

export function TrainingField({ label, unit, ...props }: TextInputProps & { label: string; unit?: string }) {
  const theme = useAppTheme(); return <View style={styles.field}><Text style={[styles.label, { color: theme.text }]}>{label}</Text><View style={styles.fieldInstrument}><TextInput accessibilityLabel={label} allowFontScaling style={[styles.fieldInput, { color: theme.text }]} {...props} />{unit ? <Text style={[styles.label, { color: theme.textMuted }]}>{unit}</Text> : null}</View></View>;
}

export function OperationalSection({ children, label }: PropsWithChildren<{ label: string }>) { return <View><View style={styles.operationLabel}><Text style={styles.phaseLabel}>{label}</Text></View>{children}</View>; }

export function BottomCommandDock({ children }: PropsWithChildren) { const theme = useAppTheme(); return <SafeAreaView edges={['bottom']} style={[styles.dock, { backgroundColor: theme.canvas, borderColor: theme.border }]}>{children}</SafeAreaView>; }

export function FocusedSheet({ children, onDismiss, title, visible }: PropsWithChildren<{ onDismiss: () => void; title: string; visible: boolean }>) {
  const theme = useAppTheme(); return <Modal animationType="slide" onRequestClose={onDismiss} transparent visible={visible}><View style={[styles.sheetOverlay, { backgroundColor: theme.overlay }]}><View accessibilityLabel={title} accessibilityViewIsModal role="dialog" style={[styles.sheet, { backgroundColor: theme.surface }]}><View style={styles.sheetHeader}><Text style={[styles.title, { color: theme.text }]}>{title}</Text><CommandButton onPress={onDismiss}>Cerrar</CommandButton></View><ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView></View></View></Modal>;
}

export const OrdinalRow = ExerciseRunSheetRow;

const styles = StyleSheet.create({
  band: { width: '100%', backgroundColor: palette.signal },
  inkBand: { backgroundColor: palette.ink },
  bandContent: { width: '100%', maxWidth: contentWidth, alignSelf: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  content: { width: '100%', maxWidth: contentWidth, alignSelf: 'center', paddingHorizontal: spacing.lg },
  mark: { alignItems: 'center', backgroundColor: palette.ink, height: 48, justifyContent: 'center', width: 48 },
  markText: { ...typography.title, color: palette.signal },
  cutCorner: { borderRadius: radii.structural, borderTopRightRadius: radii.tool, overflow: 'hidden' },
  ordinal: { ...typography.sequence, color: palette.ink, minWidth: 48 },
  metricStrip: { borderBottomWidth: borders.emphasis, borderTopWidth: borders.standard, borderColor: palette.line, flexDirection: 'row', flexWrap: 'wrap' },
  metric: { flexGrow: 1, flexBasis: 96, minWidth: 96, padding: spacing.md },
  metricLabel: { ...typography.caption, color: palette.steel }, metricValue: { ...typography.heading, color: palette.ink }, hint: { ...typography.caption, color: palette.steel },
  progressBand: { backgroundColor: palette.ink, flexDirection: 'row', gap: spacing.sm, minHeight: 48, padding: spacing.md },
  progressStep: { backgroundColor: palette.steel, flex: 1, height: 4, alignSelf: 'center' }, progressComplete: { backgroundColor: palette.paper }, progressCurrent: { backgroundColor: palette.signal, height: 8 },
  statusBand: { alignItems: 'center', borderBottomWidth: borders.emphasis, borderTopWidth: borders.emphasis, borderColor: palette.ink, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, paddingVertical: spacing.md },
  row: { alignItems: 'center', borderBottomWidth: borders.standard, borderColor: palette.line, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, minHeight: 72, paddingVertical: spacing.sm },
  flex: { flex: 1, minWidth: 140 }, heading: { ...typography.heading, color: palette.ink }, body: { ...typography.body, color: palette.steel },
  command: { alignItems: 'center', backgroundColor: palette.ink, borderRadius: radii.control, flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', minHeight: 48, minWidth: 48, paddingHorizontal: spacing.lg },
  commandText: { ...typography.bodyStrong, color: palette.paper }, pressed: { opacity: 0.72 },
  masthead: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm }, mastheadText: { flex: 1, minWidth: 0 }, display: { ...typography.display, color: palette.ink }, compactDisplay: { fontSize: 22, lineHeight: 26 }, label: { ...typography.label, color: palette.ink }, phaseLabel: { ...typography.label, color: palette.paper }, title: { ...typography.title },
  iconCommand: { alignItems: 'center', backgroundColor: palette.ink, height: 48, justifyContent: 'center', width: 48 },
  choice: { alignItems: 'center', borderBottomColor: palette.line, borderBottomWidth: borders.standard, flexDirection: 'row', gap: spacing.md, minHeight: 56, padding: spacing.md }, choiceSelected: { backgroundColor: palette.signal }, choiceMark: { borderColor: palette.ink, borderWidth: borders.emphasis, height: 20, width: 20 }, choiceMarkSelected: { backgroundColor: palette.ink },
  field: { gap: spacing.xs }, fieldInstrument: { alignItems: 'center', borderColor: palette.line, borderWidth: borders.standard, flexDirection: 'row', minHeight: 48, paddingHorizontal: spacing.md }, fieldInput: { ...typography.body, flex: 1, minHeight: 48 },
  operationLabel: { backgroundColor: palette.ink, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }, dock: { borderTopWidth: borders.emphasis, padding: spacing.lg },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end' }, sheet: { borderTopLeftRadius: radii.tool, borderTopRightRadius: radii.tool, maxHeight: '92%', padding: spacing.lg }, sheetHeader: { alignItems: 'center', borderBottomColor: palette.line, borderBottomWidth: borders.standard, flexDirection: 'row', justifyContent: 'space-between', paddingBottom: spacing.md },
});
