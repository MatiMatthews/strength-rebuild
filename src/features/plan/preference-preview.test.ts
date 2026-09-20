import { defaultSettings, type TrainingSettings } from '../settings/settings';
import { previewPreferences } from './preference-preview';

describe('saved preference preview', () => {
  it('uses exactly the saved days and decimal reference without changing its inputs', () => {
    const settings: TrainingSettings = { ...defaultSettings, schedule: [2, 4, 6], profile: { benchPressReference: 60.5 }, profileUnit: 'kg', referenceSources: { benchPressReference: 'user' } };
    const before = structuredClone(settings);
    const preview = previewPreferences(settings, 'strength');
    expect(preview.weeks).toHaveLength(1);
    expect(preview.weeks[0]!.sessions.map(session => session.day)).toEqual(['tuesday', 'thursday', 'saturday']);
    const bench = preview.weeks[0]!.sessions[0]!.exercises.find(exercise => exercise.exerciseId === 'barbell-bench-press');
    expect(bench).toMatchObject({ calculatedLoad: 48.75, loadUnit: 'kg' });
    expect(settings).toEqual(before);
    expect(previewPreferences(settings, 'strength')).toEqual(preview);
  });

  it('does not invent a personal reference and honors equipment and restrictions', () => {
    const settings: TrainingSettings = { ...defaultSettings, profile: {}, equipment: ['bodyweight'], restrictions: ['abdominal', 'sin impacto'], requirements: [{ kind: 'EXACT', value: 'bird-dog' }] };
    const sessions = previewPreferences(settings, 'reentry').weeks[0]!.sessions;
    expect(sessions).toHaveLength(3);
    for (const session of sessions) {
      expect(session.exercises.map(exercise => exercise.exerciseId)).toContain('bird-dog');
      expect(session.exercises.every(exercise => exercise.calculatedLoad === undefined)).toBe(true);
      expect(session.exercises.every(exercise => ['bird-dog', 'bodyweight-activation', 'thoracic-mobility', 'hip-mobility', 'shoulder-mobility'].includes(exercise.exerciseId))).toBe(true);
    }
  });

  it('rejects unsupported saved preferences instead of silently substituting defaults', () => {
    expect(() => previewPreferences({ ...defaultSettings, schedule: [1, 1, 5] }, 'strength')).toThrow();
    expect(() => previewPreferences({ ...defaultSettings, restrictions: ['abdominal'] }, 'power')).toThrow();
  });
});
