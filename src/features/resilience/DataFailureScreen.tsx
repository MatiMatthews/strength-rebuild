import { StyleSheet, View } from 'react-native';
import { ActionButton, AppText, Screen } from '@/design-system/v2.2/primitives';
import { borders, palette, spacing } from '@/design-system/v2.2/tokens';

export function DataFailureScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <Screen testID="data-failure-screen">
      <View testID="data-failure-recovery-band" style={styles.recoveryBand}>
        <AppText accessibilityRole="header" aria-level={1} variant="title">
          No se pudieron abrir los datos locales
        </AppText>
        <AppText accessibilityRole="alert" color="muted">
          Tus datos siguen en este dispositivo. Reintenta la apertura; no se borrará ni reemplazará información.
        </AppText>
        <ActionButton accessibilityLabel="Reintentar apertura de datos" onPress={onRetry}>
          Reintentar
        </ActionButton>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ recoveryBand: { borderBottomColor: palette.danger, borderBottomWidth: borders.emphasis, borderTopColor: palette.danger, borderTopWidth: borders.active, gap: spacing.lg, paddingVertical: spacing.lg } });
