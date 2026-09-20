import { createContext, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { openDatabaseAsync, useSQLiteContext } from 'expo-sqlite';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LogOut } from 'lucide-react-native';

import { migrateDatabase } from '@/data/migrations';
import { seedExerciseCatalog } from '@/data/seeds/exercises';
import { ActionButton, AppSheet, AppText, IconButton, Screen } from '@/design-system/v2.2/primitives';
import { palette, spacing } from '@/design-system/v2.2/tokens';
import { DataFailureScreen } from '../resilience/DataFailureScreen';
import { DATA_DATABASES, DemoModeService, seedDemoSettings, type DataMode } from './demo-mode';

interface ModeContext {
  mode: DataMode;
  busy: boolean;
  error: string | null;
  switchTo(mode: DataMode): Promise<void>;
}
const Context = createContext<ModeContext | null>(null);
export const useDataMode = () => useContext(Context);

export function DemoModeProvider({ children }: PropsWithChildren) {
  const control = useSQLiteContext();
  const [mode, setMode] = useState<DataMode | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const service = useMemo(() => new DemoModeService(control, async target => {
    const database = await openDatabaseAsync(DATA_DATABASES[target]);
    try {
      await migrateDatabase(database);
      if (target === 'demo') { await seedExerciseCatalog(database); await seedDemoSettings(database); }
    } finally { await database.closeAsync(); }
  }), [control]);
  useEffect(() => {
    let active = true;
    service.load().then(value => { if (active) setMode(value); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [service, attempt]);

  if (failed) return <DataFailureScreen onRetry={() => { setFailed(false); setAttempt(value => value + 1); }} />;
  if (!mode) return <Screen><AppText accessibilityLiveRegion="polite">Abriendo datos locales...</AppText></Screen>;
  const switchTo = async (target: DataMode) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try { setMode(await service.switchTo(target)); }
    catch { setError('No se pudo cambiar de modo. Tus datos se conservaron. Reintenta.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <Context.Provider value={{ mode, busy, error, switchTo }}>{children}</Context.Provider>;
}

export function DemoBanner() {
  const context = useDataMode();
  if (context?.mode !== 'demo') return null;
  return <SafeAreaView edges={['top']} style={styles.banner}>
    <View style={styles.row}>
      <AppText style={styles.label} variant="label">DEMO · DATOS DE EJEMPLO</AppText>
      <IconButton accessibilityLabel="Salir de la demo" disabled={context.busy} icon={LogOut} onPress={() => { void context.switchTo('personal'); }} />
    </View>
    {context.error ? <AppText accessibilityRole="alert" style={styles.label}>{context.error}</AppText> : null}
  </SafeAreaView>;
}

export function DemoControls() {
  const context = useDataMode();
  const [confirm, setConfirm] = useState(false);
  if (!context) return null;
  if (context.mode === 'demo') return <ActionButton disabled={context.busy} onPress={() => { void context.switchTo('personal'); }}>Volver a mis datos</ActionButton>;
  return <>
    <ActionButton tone="secondary" onPress={() => setConfirm(true)}>Probar demo</ActionButton>
    <AppSheet title="Entrar en la demo" visible={confirm} onDismiss={() => { if (!context.busy) setConfirm(false); }}>
      <AppText>Datos y cargas de ejemplo. Tu plan e historial personal permanecen separados.</AppText>
      {context.error ? <AppText accessibilityRole="alert" color="danger">{context.error}</AppText> : null}
      <ActionButton disabled={context.busy} onPress={() => { void context.switchTo('demo'); }}>{context.busy ? 'Abriendo demo...' : 'Entrar en demo'}</ActionButton>
      <ActionButton disabled={context.busy} tone="secondary" onPress={() => setConfirm(false)}>Cancelar</ActionButton>
    </AppSheet>
  </>;
}

const styles = StyleSheet.create({
  banner: { backgroundColor: palette.signal, borderBottomWidth: 1, borderBottomColor: palette.ink, paddingHorizontal: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  label: { color: palette.ink, flexShrink: 1 },
});
