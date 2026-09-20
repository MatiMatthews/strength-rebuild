import type { SettingRepository } from '@/data/repositories';

export interface PlanSelectionStore {
  load(): Promise<string | null>;
  save(value: string | null): Promise<void>;
}

export function createPlanSelectionStore(repository: SettingRepository): PlanSelectionStore {
  const key = 'plan-week-selection';
  return {
    load: async () => {
      const value = (await repository.get<unknown>(key))?.value;
      return typeof value === 'string' ? value : null;
    },
    save: async value => { await repository.save({ id: key, key, value }); },
  };
}
