import { generatePrescription } from '../../domain/prescriptions/generator';
import { defaultSettings, resolveTrainingSettings, SAFE_DEMO_PROFILE_ID, validateSettings } from './settings';

describe('local training settings', () => {
  it('accepts units, increments, equipment, schedule, requirements and restrictions', () => {
    expect(validateSettings(defaultSettings)).toEqual({ success: true });
    expect(defaultSettings.requirements.map(({ kind }) => kind)).toEqual(['EXACT', 'PATTERN', 'CAPABILITY']);
  });

  it('uses a deterministic explicitly synthetic profile for fresh installs', () => {
    const first = resolveTrainingSettings(null);
    const second = resolveTrainingSettings(undefined);

    expect(first).toEqual(second);
    expect(first.demoProfileId).toBe(SAFE_DEMO_PROFILE_ID);
    expect(first.demoProfileId).toMatch(/synthetic/i);
    expect(first.profile).toEqual({
      benchPressReference: 60,
      deadliftReference: 100,
      backSquatReference: 80,
      strictPullUpCapacity: 5,
    });
  });

  it('returns persisted V2.2 settings byte-for-byte without overlaying fresh-install defaults', () => {
    const { demoProfileId: _freshInstallMarker, ...v22Settings } = defaultSettings;
    const persisted = {
      ...v22Settings,
      equipment: ['Equipo existente'],
      restrictions: ['restriccion-existente'],
      profile: { benchPressReference: 73, deadliftReference: 121, backSquatReference: 97, strictPullUpCapacity: 3 },
    };
    const before = JSON.stringify(persisted);

    expect(resolveTrainingSettings(persisted)).toBe(persisted);
    expect(JSON.stringify(persisted)).toBe(before);
  });

  it.each([
    [{ ...defaultSettings, increments: [] }, 'incremento'],
    [{ ...defaultSettings, schedule: [] }, 'día'],
    [{ ...defaultSettings, equipment: [] }, 'equipo'],
    [{ ...defaultSettings, requirements: [] }, 'requisito'],
  ])('rejects invalid configuration', (settings, message) => {
    expect(validateSettings(settings)).toEqual({ success: false, message: expect.stringContaining(message) });
  });
});


describe('catalog-valid settings', () => {
  it('creates a preview from fresh defaults', () => {
    expect(() => generatePrescription({ equipment: defaultSettings.equipment, requirements: defaultSettings.requirements, id: 'fresh', type: 'strength', weeks: 1 })).not.toThrow();
  });
  it('rejects ambiguous saved requirements without changing the input', () => {
    const saved = { ...defaultSettings, requirements: [{ kind: 'EXACT' as const, value: 'Sentadilla con barra' }] };
    const before = JSON.stringify(saved);
    expect(validateSettings(saved)).toMatchObject({ success: false, requirementIndex: 0, message: expect.stringContaining('Requisito 1') });
    expect(JSON.stringify(saved)).toBe(before);
  });
});
