import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { exerciseCatalog } from '@/data/seeds/exercises';
import { OperationalSection } from '@/design-system/v2.2/components';
import { ActionButton, AppText } from '@/design-system/v2.2/primitives';
import { spacing } from '@/design-system/v2.2/tokens';
import { useAppTheme } from '@/design-system/use-app-theme';
import type { CyclePrescriptionSnapshot } from '@/domain/prescriptions/generator';
import { prescriptionQuantity } from '@/domain/prescriptions/measurement';

const days = { monday: 'Lunes', tuesday: 'Martes', wednesday: 'Miércoles', thursday: 'Jueves', friday: 'Viernes', saturday: 'Sábado', sunday: 'Domingo' };

export function PreferencePreview({ preview, onClose }: { preview: CyclePrescriptionSnapshot; onClose(): void }) {
  const theme = useAppTheme();
  const [expanded, setExpanded] = useState<number | null>(null);
  return <OperationalSection label="VISTA PREVIA DE PREFERENCIAS">
    <AppText color="muted">Propuesta con tu configuración guardada. Tu plan activo y tus registros no cambian.</AppText>
    {preview.weeks[0]?.sessions.map(session => {
      const name = session.day ? days[session.day] : `Día ${session.dayIndex}`;
      const open = expanded === session.dayIndex;
      const Icon = open ? ChevronUp : ChevronDown;
      return <View key={session.dayIndex} style={[styles.day, { borderColor: theme.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${name}, vista previa de preferencias`} accessibilityState={{ expanded: open }} onPress={() => setExpanded(open ? null : session.dayIndex)} style={styles.heading}>
          <AppText variant="bodyStrong" style={styles.title}>{name}</AppText><Icon color={theme.text} size={20} />
        </Pressable>
        {open ? session.exercises.map((exercise, index) => <View key={`${exercise.exerciseId}-${index}`} style={styles.exercise}>
          <AppText variant="bodyStrong">{exerciseCatalog.find(item => item.id === exercise.exerciseId)?.name ?? 'Ejercicio no disponible'}</AppText>
          <AppText color="muted">{prescriptionQuantity(exercise)}</AppText>
          {exercise.recording === 'load-reps' ? <AppText color="muted">{exercise.calculatedLoad !== undefined ? `${exercise.calculatedLoad} ${exercise.loadUnit ?? 'kg'}` : 'Carga por definir'}</AppText> : null}
        </View>) : null}
      </View>;
    })}
    <ActionButton tone="secondary" onPress={onClose}>Cerrar vista previa de preferencias</ActionButton>
  </OperationalSection>;
}

const styles = StyleSheet.create({
  day: { borderBottomWidth: 1 },
  heading: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  title: { flex: 1, flexShrink: 1 },
  exercise: { paddingBottom: spacing.md, gap: spacing.xs },
});
