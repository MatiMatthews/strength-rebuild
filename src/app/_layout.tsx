import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SQLiteProvider } from 'expo-sqlite';

import { importLegacyState } from '@/application/import';
import { migrateDatabase } from '@/data/migrations';
import type { RepositoryDatabase } from '@/data/repositories';
import { RepositoryProvider } from '@/data/repositories/provider';
import { seedExerciseCatalog } from '@/data/seeds/exercises';
import { FontProvider } from '@/design-system/v2.2/font-provider';
import { useAppTheme } from '@/design-system/use-app-theme';
import { DataFailureScreen } from '@/features/resilience/DataFailureScreen';
import { DemoBanner, DemoModeProvider, useDataMode } from '@/features/demo/DemoModeProvider';
import { DATA_DATABASES, initializeModeStore, MODE_DATABASE, seedDemoSettings } from '@/features/demo/demo-mode';

function RootContent() {
  const theme = useAppTheme();
  const { mode } = useDataMode()!;
  const [databaseAttempt, setDatabaseAttempt] = useState(0);
  const [databaseFailed, setDatabaseFailed] = useState(false);

  if (databaseFailed) {
    return <><DemoBanner /><DataFailureScreen onRetry={() => { setDatabaseFailed(false); setDatabaseAttempt((attempt) => attempt + 1); }} /></>;
  }

  return (
    <>
      <SQLiteProvider
        databaseName={DATA_DATABASES[mode]}
        key={`${mode}-${databaseAttempt}`}
        onError={() => setDatabaseFailed(true)}
        onInit={async (database) => {
          await migrateDatabase(database);
          await seedExerciseCatalog(database as RepositoryDatabase);
          if (mode === 'demo') await seedDemoSettings(database as RepositoryDatabase);
          if (mode === 'personal' && Platform.OS !== 'web') {
            const result = await importLegacyState(database as RepositoryDatabase);
            if (result.status === 'invalid' || result.status === 'oversized') {
              console.warn(`Legacy state was preserved but could not be imported (${result.status}).`);
            }
          }
        }}
      >
        <RepositoryProvider>
          <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.canvas }}>
            <SafeAreaProvider>
              <StatusBar style={theme.dark ? 'light' : 'dark'} />
              <DemoBanner />
              <Stack
                screenOptions={{
                  animation: 'slide_from_right',
                  contentStyle: { backgroundColor: theme.canvas },
                  headerShown: false,
                  statusBarStyle: theme.dark ? 'light' : 'dark',
                }}
              >
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="settings" />
                <Stack.Screen name="workout" />
              </Stack>
            </SafeAreaProvider>
          </GestureHandlerRootView>
        </RepositoryProvider>
      </SQLiteProvider>
    </>
  );
}

function SelectedDataRoot() {
  const { mode } = useDataMode()!;
  return <RootContent key={mode} />;
}

export default function RootLayout() {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  return <FontProvider><SafeAreaProvider>{failed
    ? <DataFailureScreen onRetry={() => { setFailed(false); setAttempt(value => value + 1); }} />
    : <SQLiteProvider databaseName={MODE_DATABASE} key={attempt} onInit={initializeModeStore} onError={() => setFailed(true)}>
      <DemoModeProvider><SelectedDataRoot /></DemoModeProvider>
    </SQLiteProvider>}</SafeAreaProvider></FontProvider>;
}
