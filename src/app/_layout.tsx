import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SQLiteProvider } from 'expo-sqlite';

import { importLegacyState } from '@/application/import';
import { ScenarioStateGate } from '@/application/scenario-entry';
import { migrateDatabase } from '@/data/migrations';
import type { RepositoryDatabase } from '@/data/repositories';
import { RepositoryProvider } from '@/data/repositories/provider';
import { seedExerciseCatalog } from '@/data/seeds/exercises';
import { FontProvider } from '@/design-system/v2.2/font-provider';
import { useAppTheme } from '@/design-system/use-app-theme';
import { DataFailureScreen } from '@/features/resilience/DataFailureScreen';

function RootContent() {
  const theme = useAppTheme();
  const [databaseAttempt, setDatabaseAttempt] = useState(0);
  const [databaseFailed, setDatabaseFailed] = useState(false);

  if (databaseFailed) {
    return <DataFailureScreen onRetry={() => { setDatabaseFailed(false); setDatabaseAttempt((attempt) => attempt + 1); }} />;
  }

  return (
    <>
      <SQLiteProvider
        databaseName="strength-rebuild-v2.db"
        key={databaseAttempt}
        onError={() => setDatabaseFailed(true)}
        onInit={async (database) => {
          await migrateDatabase(database);
          await seedExerciseCatalog(database as RepositoryDatabase);
          if (Platform.OS !== 'web') {
            const result = await importLegacyState(database as RepositoryDatabase);
            if (result.status === 'invalid' || result.status === 'oversized') {
              console.warn(`Legacy state was preserved but could not be imported (${result.status}).`);
            }
          }
        }}
      >
        <RepositoryProvider>
          <ScenarioStateGate>
            <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.canvas }}>
              <SafeAreaProvider>
                <StatusBar style={theme.dark ? 'light' : 'dark'} />
                <Stack
                  screenOptions={{
                    animation: 'slide_from_right',
                    contentStyle: { backgroundColor: theme.canvas },
                    headerShown: false,
                  }}
                >
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="settings" />
                  <Stack.Screen name="workout" />
                </Stack>
              </SafeAreaProvider>
            </GestureHandlerRootView>
          </ScenarioStateGate>
        </RepositoryProvider>
      </SQLiteProvider>
    </>
  );
}

export default function RootLayout() {
  return <FontProvider><RootContent /></FontProvider>;
}
