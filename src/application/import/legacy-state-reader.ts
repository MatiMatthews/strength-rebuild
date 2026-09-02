import { requireNativeModule } from 'expo-modules-core';

export type LegacyNativeReadResult =
  | { readonly status: 'absent'; readonly payload: null }
  | { readonly status: 'available'; readonly payload: string }
  | { readonly status: 'oversized'; readonly payload: null };

interface LegacyStateMigratorModule {
  readLegacyState(): LegacyNativeReadResult;
}

let nativeModule: LegacyStateMigratorModule | undefined;

export function readLegacyState(): LegacyNativeReadResult {
  nativeModule ??= requireNativeModule<LegacyStateMigratorModule>('LegacyStateMigrator');
  return nativeModule.readLegacyState();
}
