import { StyleSheet, Text, View } from 'react-native';

import { palette, spacing, typography } from '@/design-system/v2.2/tokens';

export function ExerciseProgressRail({ current, total }: { current: number; total: number }) {
  const safeTotal = Math.max(1, total);
  const safeCurrent = Math.max(1, Math.min(current, safeTotal));
  return <View
    accessibilityLabel={`Ejercicio ${safeCurrent} de ${safeTotal}`}
    accessibilityRole="progressbar"
    accessibilityValue={{ min: 1, max: safeTotal, now: safeCurrent }}
    style={styles.rail}
    testID="workout-sequence-rail"
  >
    <Text style={styles.ordinal}>{String(safeCurrent).padStart(2, '0')}</Text>
    <View style={styles.steps}>{Array.from({ length: safeTotal }, (_, index) => <View key={index} style={[styles.step, index < safeCurrent && styles.complete, index === safeCurrent - 1 && styles.current]} />)}</View>
    <Text style={styles.total}>/ {String(safeTotal).padStart(2, '0')}</Text>
  </View>;
}

const styles = StyleSheet.create({
  rail: { alignItems: 'center', backgroundColor: palette.ink, flexDirection: 'row', gap: spacing.md, minHeight: 64, paddingHorizontal: spacing.lg },
  ordinal: { ...typography.sequence, color: palette.signal },
  steps: { flex: 1, flexDirection: 'row', gap: spacing.xs },
  step: { backgroundColor: palette.steel, flex: 1, height: 4 },
  complete: { backgroundColor: palette.paper },
  current: { backgroundColor: palette.signal, height: 8 },
  total: { ...typography.label, color: palette.paper },
});
