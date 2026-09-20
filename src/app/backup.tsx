import { useLocalSearchParams, useNavigation } from 'expo-router';

import { useDataServices } from '@/data/repositories/provider';
import { ActionButton, AppText, Screen } from '@/design-system/v2.2/primitives';
import { AppMasthead } from '@/design-system/v2.2/components';
import { BackupPanel } from '@/features/backup/BackupPanel';
import { DemoControls, useDataMode } from '@/features/demo/DemoModeProvider';

export default function BackupRoute() {
  const navigation = useNavigation();
  const { srScenario } = useLocalSearchParams<{ srScenario?: string }>();
  const { backups } = useDataServices();
  const mode = useDataMode();
  if (mode?.mode === 'demo') return <Screen testID="backup-screen">
    <AppMasthead context="Modo demo" title="RESPALDO Y RECUPERACIÓN" />
    <AppText>Los respaldos personales no están disponibles en la demo.</AppText>
    <DemoControls />
  </Screen>;
  return <Screen testID="backup-screen">
    <AppMasthead context="Copia local sin conexión" title="RESPALDO Y RECUPERACIÓN" />
    <AppText color="muted">Administra una copia local sin conexión. Restaurar siempre requiere confirmación.</AppText>
    <BackupPanel scenario={srScenario === 'backup-valid' || srScenario === 'backup-corrupt' ? srScenario : undefined} service={backups} />
    <ActionButton accessibilityLabel="Volver al Plan" onPress={() => navigation.goBack()} tone="secondary">Volver al Plan</ActionButton>
  </Screen>;
}
