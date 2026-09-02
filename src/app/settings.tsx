import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo, findNodeHandle, Platform, View } from 'react-native';

import { useDataServices } from '@/data/repositories/provider';
import { ActionButton, AppText, Screen } from '@/design-system/v2.2/primitives';
import { AppMasthead } from '@/design-system/v2.2/components';
import { SettingsPanel } from '@/features/settings/SettingsPanel';
import { resolveTrainingSettings, type TrainingSettings } from '@/features/settings/settings';

export default function SettingsRoute() {
  const navigation = useNavigation();
  const { srScenario } = useLocalSearchParams<{ srScenario?: string }>();
  const { repositories } = useDataServices();
  const headingRef = useRef<View>(null);
  const settingsStore = useMemo(() => ({
    load: async () => resolveTrainingSettings((await repositories.settings.get<TrainingSettings>('training-settings'))?.value),
    save: (value: TrainingSettings) => repositories.settings.save({ id: 'training-settings', key: 'training-settings', value }),
  }), [repositories]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      (headingRef.current as unknown as HTMLElement | null)?.focus?.();
      return;
    }
    const handle = findNodeHandle(headingRef.current);
    if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
  }, [navigation]);

  return <Screen testID="settings-screen">
    <AppMasthead context="Preferencias locales y sin conexión" title="Configuración" />
    <View accessibilityRole="header" aria-level={1} ref={headingRef} tabIndex={-1}>
      <AppText variant="heading">Preferencias de entrenamiento</AppText>
    </View>
    <AppText color="muted">Tus preferencias se guardan localmente y siguen disponibles sin conexión.</AppText>
    <SettingsPanel scenario={srScenario === 'settings-validation' ? srScenario : undefined} store={settingsStore} />
    <ActionButton accessibilityLabel="Volver a Hoy" onPress={() => navigation.goBack()} tone="secondary">Volver a Hoy</ActionButton>
  </Screen>;
}
