import { createSettingsStore } from './settings-store';
import { defaultSettings, type TrainingSettings } from './settings';
import type { SettingRepository } from '../../data/repositories';

it('rejects invalid merged constraints before atomic persistence and preserves unrelated settings on recovery', async () => {
  let saved = { ...defaultSettings, equipment: [...defaultSettings.equipment, 'unknown-device'] };
  const repository = {
    get: jest.fn(async () => ({ value: saved })),
    compareAndSave: jest.fn(async ({ value }) => { saved = value; return true; }),
  };
  const store = createSettingsStore(repository as unknown as SettingRepository);
  const baseline = await store.load();
  for (const next of [
    baseline,
    { ...baseline, equipment: ['bodyweight'], requirements: [{ kind: 'UNKNOWN', value: 'power' }] },
    { ...baseline, equipment: ['bodyweight'], restrictions: ['unknown'] },
    { ...baseline, equipment: ['bodyweight'], requirements: [{ kind: 'CAPABILITY', value: 'mobility' }], restrictions: ['abdominal'] },
  ]) {
    await expect(store.save(next as TrainingSettings, baseline)).rejects.toThrow();
    expect(saved).toEqual(baseline);
    expect(repository.compareAndSave).not.toHaveBeenCalled();
  }
  const valid = { ...baseline, equipment: ['bodyweight'], requirements: [{ kind: 'EXACT' as const, value: 'bird-dog' }], restrictions: ['abdominal', 'sin impacto'] };
  await store.save(valid, baseline);
  expect(repository.compareAndSave).toHaveBeenCalledTimes(1);
  expect(await store.load()).toEqual(valid);
  expect(saved.profile).toEqual(baseline.profile);
  expect(saved.schedule).toEqual(baseline.schedule);
  expect(saved.increments).toEqual(baseline.increments);
});
