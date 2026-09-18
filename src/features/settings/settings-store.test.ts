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

it('preserves legacy values and marker on repeated reads, pins units and rejects concurrent reference edits atomically', async () => {
  let saved: TrainingSettings = { units: 'kg', increments: [1.25], equipment: ['Barra', 'Banco'], schedule: [1,3,5], requirements: [{ kind: 'EXACT', value: 'barbell-bench-press' }], restrictions: [], demoProfileId: 'synthetic-strength-demo-v1', profile: { benchPressReference: 60, deadliftReference: 100, backSquatReference: 80, strictPullUpCapacity: 5 } };
  const original = JSON.stringify(saved);
  const repository = { get: async () => ({ value: saved }), compareAndSave: jest.fn(async ({ value }) => { saved = value; return true; }) };
  const store = createSettingsStore(repository as unknown as SettingRepository);
  const baseline = await store.load();
  expect(JSON.stringify(await store.load())).toBe(original);
  expect(repository.compareAndSave).not.toHaveBeenCalled();
  await store.save({ ...baseline, units: 'lb' }, baseline);
  expect(saved).toMatchObject({ units: 'lb', profileUnit: 'kg', profile: baseline.profile, demoProfileId: baseline.demoProfileId });
  const current = await store.load();
  saved = { ...current, profile: { ...current.profile, benchPressReference: 70 } };
  await expect(store.save({ ...current, profile: { benchPressReference: 80 } }, current)).rejects.toThrow('configuración cambió');
  expect(saved.profile?.benchPressReference).toBe(70);
  expect(repository.compareAndSave).toHaveBeenCalledTimes(1);
  await expect(store.save({ ...saved, profile: { benchPressReference: NaN } }, saved)).rejects.toThrow('positivas');
  expect(repository.compareAndSave).toHaveBeenCalledTimes(1);
});
