import type { LucideIcon } from 'lucide-react-native';
import { useContext } from 'react';
import type { PropsWithChildren, ReactNode } from 'react';
import { StyleSheet, Text, View, type TextInputProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { borders, palette, radii, spacing, typography } from '../tokens';
import { useAppTheme } from '../../use-app-theme';
import { ActionButton, AppSheet, IconButton, ScreenContentInset, TextField } from '../primitives';

const contentWidth = 800;

export function BrandMark() {
  return <View accessibilityLabel="Strength Rebuild" style={styles.mark}><Text allowFontScaling={false} testID="brand-mark-glyph" style={styles.markText}>SR</Text></View>;
}

export function CutCornerSurface({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
  return <View style={[styles.cutCorner, style]}>{children}</View>;
}

export function BrandBand({ children, inset, testID, tone = 'signal' }: PropsWithChildren<{ inset?: number; testID?: string; tone?: 'signal' | 'ink' }>) {
  const contentInset = useContext(ScreenContentInset);
  const bleed = inset ?? contentInset;
  return <View testID={testID} style={[styles.band, bleed ? { width: 'auto', alignSelf: 'stretch', marginHorizontal: -bleed } : undefined, tone === 'ink' && styles.inkBand]}><View testID="brand-band-content" style={styles.bandContent}>{children}</View></View>;
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
  return <View accessibilityLabel={`Semana ${safeCurrent} de ${safeTotal}`} accessible accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: safeTotal, now: safeCurrent }} aria-valuemin={1} aria-valuemax={safeTotal} aria-valuenow={safeCurrent} style={styles.progressBand}>{Array.from({ length: safeTotal }, (_, index) => <View key={index} style={[styles.progressStep, index < safeCurrent && styles.progressComplete, index === safeCurrent - 1 && styles.progressCurrent]} />)}</View>;
}

export function StatusActionBand({ actionLabel, busy = false, detail, onAction, title }: { actionLabel: string; busy?: boolean; detail?: string; onAction: () => void; title: string }) {
  const theme = useAppTheme();
  return <View style={[styles.statusBand, { borderColor: theme.text }]}><View style={styles.flex}><Text style={[styles.heading, { color: theme.text }]}>{title}</Text>{detail ? <Text accessibilityLabel={detail} style={[styles.body, { color: theme.textMuted }]}>{detail}</Text> : null}</View><Command busy={busy} label={actionLabel} onPress={onAction} /></View>;
}

function Command({ busy = false, icon: Icon, label, onPress }: { busy?: boolean; icon?: LucideIcon | undefined; label: string; onPress: () => void }) {
  return <ActionButton accessibilityLabel={label} busy={busy} {...(Icon ? { icon: Icon } : {})} onPress={onPress} tone="command">{label}</ActionButton>;
}

export function ExerciseRunSheetRow({ actionLabel, detail, icon, name, onPress, ordinal, trailing }: { actionLabel: string; detail: string; icon?: LucideIcon; name: string; onPress: () => void; ordinal: number; trailing?: ReactNode }) {
  const theme = useAppTheme();
  return <View style={[styles.row, { borderColor: theme.border }]}><Ordinal value={ordinal} /><View style={styles.flex}><Text style={[styles.heading, { color: theme.text }]}>{name}</Text><Text style={[styles.body, { color: theme.textMuted }]}>{detail}</Text></View>{trailing ?? <Command icon={icon} label={actionLabel} onPress={onPress} />}</View>;
}

export function BrandContent({ children }: PropsWithChildren) { return <View style={styles.content}>{children}</View>; }

export function AppMasthead({ command, context, inset, role = 'screen', testID, title }: { command?: ReactNode; context?: string; inset?: number; role?: 'screen' | 'task'; testID?: string; title: string }) {
  return <BrandBand {...(inset !== undefined ? { inset } : {})} {...(testID ? { testID } : {})}><View style={styles.masthead}><BrandMark /><View accessible accessibilityLabel={context ? `${title} · ${context}` : title} style={styles.mastheadText}><Text accessibilityRole="header" aria-level={1} style={[styles.screenTitle, role === 'task' && styles.taskTitle]}>{title}</Text>{context ? <Text style={styles.label}>{context}</Text> : null}</View>{command}</View></BrandBand>;
}

export function PhaseBand({ current, label, testID, total }: { current?: number; label: string; testID?: string; total?: number }) {
  return <BrandBand {...(testID ? { testID } : {})} tone="ink"><Text style={styles.phaseLabel}>{label}</Text>{current && total ? <SegmentedRail current={current} total={total} /> : null}</BrandBand>;
}

export function SegmentedRail({ current, total }: { current: number; total: number }) { return <CycleProgressBand current={current} total={total} />; }

export function RuledHeader({ metrics = [], title }: { metrics?: readonly Metric[]; title: string }) {
  const theme = useAppTheme(); return <View><Text style={[styles.title, { color: theme.text }]}>{title}</Text>{metrics.length ? <MetricStrip metrics={metrics} /> : null}</View>;
}

export function CommandButton({ children, disabled = false, busy = false, onPress }: PropsWithChildren<{ disabled?: boolean; busy?: boolean; onPress: () => void }>) {
  return <ActionButton busy={busy} disabled={disabled} onPress={onPress} tone="command">{children}</ActionButton>;
}

export function IconCommand({ icon: Icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  return <IconButton accessibilityLabel={label} icon={Icon} onPress={onPress} tone="command" />;
}

export { ChoiceControl } from '../primitives';

export function TrainingField({ label, unit, style, editable = true, ...props }: TextInputProps & { label: string; unit?: string }) {
  return <TextField label={label} {...(unit ? { unit } : {})} style={style} editable={editable} presentation="training" {...props} />;
}

export function OperationalSection({ children, label }: PropsWithChildren<{ label: string }>) { return <View><View style={styles.operationLabel}><Text style={styles.phaseLabel}>{label}</Text></View>{children}</View>; }

export function BottomCommandDock({ children }: PropsWithChildren) { const theme = useAppTheme(); return <SafeAreaView edges={['bottom']} style={[styles.dock, { backgroundColor: theme.canvas, borderColor: theme.border }]}>{children}</SafeAreaView>; }

export function FocusedSheet({ children, onDismiss, title, visible }: PropsWithChildren<{ onDismiss: () => void; title: string; visible: boolean }>) {
  return <AppSheet onDismiss={onDismiss} title={title} visible={visible} closeLabel="Cerrar">{children}</AppSheet>;
}

export const OrdinalRow = ExerciseRunSheetRow;

const styles = StyleSheet.create({
  band: { width: '100%', backgroundColor: palette.signal },
  inkBand: { backgroundColor: palette.ink },
  bandContent: { width: '100%', maxWidth: contentWidth, alignSelf: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  content: { width: '100%', maxWidth: contentWidth, alignSelf: 'center', paddingHorizontal: spacing.lg },
  mark: { alignItems: 'center', backgroundColor: palette.ink, height: 48, flexShrink: 0, justifyContent: 'center', width: 48 },
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
  masthead: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm }, mastheadText: { flex: 1, minWidth: 0 }, screenTitle: { ...typography.title, color: palette.ink }, taskTitle: { ...typography.taskTitle, color: palette.ink }, label: { ...typography.label, color: palette.ink }, phaseLabel: { ...typography.label, color: palette.paper }, title: { ...typography.title },
  operationLabel: { backgroundColor: palette.ink, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }, dock: { borderTopWidth: borders.emphasis, padding: spacing.lg },
});
