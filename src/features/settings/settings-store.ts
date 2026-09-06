import type { SettingRepository } from '../../data/repositories';
import { resolveTrainingSettings, validateSettings, type SettingsStore, type TrainingSettings } from './settings';

class SettingsConflictError extends Error {
  override name = 'SettingsConflictError';
  constructor() { super('La configuración cambió mientras editabas. Tus datos guardados se conservaron. Vuelve a abrir Configuración para revisar los cambios.'); }
}

export function createSettingsStore(repository: SettingRepository): SettingsStore {
  return {
    load: async () => resolveTrainingSettings((await repository.get<TrainingSettings>('training-settings'))?.value),
    save: async (edited, baseline) => {
      const stored = (await repository.get<TrainingSettings>('training-settings'))?.value ?? null;
      const current = resolveTrainingSettings(stored);
      if (baseline && current.units !== baseline.units && JSON.stringify(edited.increments) !== JSON.stringify(baseline.increments)) throw new SettingsConflictError();
      const next = { ...current };
      // Only explicitly edited fields belong to this save; preserve unrelated data.
      for (const key of Object.keys(edited) as (keyof TrainingSettings)[]) {
        if (baseline && JSON.stringify(edited[key]) === JSON.stringify(baseline[key])) continue;
        if (baseline && JSON.stringify(current[key]) !== JSON.stringify(baseline[key]) && JSON.stringify(current[key]) !== JSON.stringify(edited[key])) throw new SettingsConflictError();
        Object.assign(next, { [key]: edited[key] });
      }
      const validation = validateSettings(next);
      if (!validation.success) throw new Error(validation.message);
      if (!await repository.compareAndSave({ id: 'training-settings', key: 'training-settings', value: next }, stored)) throw new SettingsConflictError();
    },
  };
}
