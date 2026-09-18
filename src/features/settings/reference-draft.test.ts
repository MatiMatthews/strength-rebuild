import { commitReferences, referenceDraft } from './reference-draft';
import { defaultSettings, planningProfile } from './settings';
import { prescribeCatalogExercise } from '../../domain/prescriptions/generator';
import { exerciseCatalog } from '../../data/seeds/exercises';

it('preserves legacy values and provenance unless explicitly edited', () => {
  const saved = { ...defaultSettings, profile: { benchPressReference: 60, deadliftReference: 100 } };
  const draft = referenceDraft(saved);
  expect(commitReferences(saved, draft)).toBe(saved);
  draft.backSquatReference = { known: true, text: '80,5', edited: true };
  const next = commitReferences(saved, draft);
  expect(next.profile).toEqual({ benchPressReference: 60, deadliftReference: 100, backSquatReference: 80.5 });
  expect(saved.profile).toEqual({ benchPressReference: 60, deadliftReference: 100 });
  draft.strictPullUpCapacity = { known: true, text: '2.5', edited: true };
  expect(() => commitReferences(saved, draft)).toThrow('entero positivo');
});

it.each([{}, { benchPressReference: 60 }, { benchPressReference: 60, backSquatReference: 80, deadliftReference: 100, strictPullUpCapacity: 5 }])('keeps every alternative load honest for %j', profile => {
  for (const exercise of exerciseCatalog) {
    const target = prescribeCatalogExercise({ type: 'strength', profile: planningProfile({ ...defaultSettings, profile }) }, exercise, 'EXACT');
    if (exercise.id === 'barbell-bench-press' && 'benchPressReference' in profile) expect(target.calculatedLoad).toBe(47.5);
    else if (exercise.id === 'smith-box-squat' && 'backSquatReference' in profile) expect(target.calculatedLoad).toBe(63.75);
    else { expect(target.calculatedLoad).toBeUndefined(); expect(target.loadSource).toBeUndefined(); }
  }
});

it('converts reference input units only at the prescription boundary, retaining capacity and originals', () => {
  const settings = { ...defaultSettings, profile: { benchPressReference: 60, strictPullUpCapacity: 5 }, profileUnit: 'kg' as const, units: 'lb' as const };
  expect(planningProfile(settings).benchPressReference).toBeCloseTo(132.2773573);
  expect(planningProfile(settings).strictPullUpCapacity).toBe(5);
  expect(settings.profile.benchPressReference).toBe(60);
});
