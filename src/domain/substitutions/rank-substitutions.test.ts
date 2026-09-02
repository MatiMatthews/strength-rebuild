import { exerciseCatalog } from '../../data/seeds/exercises';
import { rankSubstitutions } from './rank-substitutions';

const base = {
  originalExerciseId: 'barbell-bench-press',
  requirement: { type: 'PATTERN' as const, value: 'horizontal-push' },
  reason: 'equipment-unavailable' as const,
  availableEquipment: ['dumbbells', 'incline-bench', 'bodyweight'],
  skillLevel: 'intermediate' as const,
  restrictions: { maxImpact: 'low' as const, maxBraceDemand: 'moderate' as const, maxLumbarDemand: 'low' as const },
  recentExerciseIds: [] as string[],
  preferredExerciseIds: [] as string[],
};

describe('rankSubstitutions', () => {
  it('applies every hard filter before ranking', () => {
    const results = rankSubstitutions(exerciseCatalog, base);
    expect(results.map((item) => item.exercise.id)).toEqual(['incline-dumbbell-press']);
    expect(results.every((item) => item.exercise.pattern === 'horizontal-push')).toBe(true);
  });

  it('returns a deterministic top three with stable explanations and id tie-breaking', () => {
    const catalog = exerciseCatalog.map((exercise) => exercise.id === 'seated-dumbbell-press'
      ? { ...exercise, pattern: 'horizontal-push', tags: ['chest'] }
      : exercise.id === 'dead-bug'
        ? { ...exercise, pattern: 'horizontal-push', tags: ['core'] }
        : exercise);
    const request = { ...base, availableEquipment: ['dumbbells', 'incline-bench', 'bench', 'bodyweight'] };

    const first = rankSubstitutions(catalog, request);
    const second = rankSubstitutions([...catalog].reverse(), request);

    expect(first).toHaveLength(3);
    expect(second).toEqual(first);
    expect(first[0]).toMatchObject({
      exercise: { id: 'incline-dumbbell-press' },
      explanations: ['Matches horizontal-push', 'Shares chest stimulus'],
    });
  });

  it('penalizes recent use without making the result nondeterministic', () => {
    const catalog = exerciseCatalog.map((exercise) => exercise.id === 'seated-dumbbell-press'
      ? { ...exercise, pattern: 'horizontal-push', tags: ['chest'] }
      : exercise);
    const request = {
      ...base,
      availableEquipment: ['dumbbells', 'incline-bench', 'bench'],
      recentExerciseIds: ['incline-dumbbell-press'],
    };
    expect(rankSubstitutions(catalog, request).map((item) => item.exercise.id)).toEqual([
      'seated-dumbbell-press',
      'incline-dumbbell-press',
    ]);
  });

  it('allows EXACT anchors only with an explicit reason and a pre-approved equivalent', () => {
    const exact = { ...base, requirement: { type: 'EXACT' as const, value: 'barbell-bench-press' } };
    expect(rankSubstitutions(exerciseCatalog, { ...exact, reason: null, approvedEquivalentIds: ['incline-dumbbell-press'] })).toEqual([]);
    expect(rankSubstitutions(exerciseCatalog, { ...exact, approvedEquivalentIds: [] })).toEqual([]);
    expect(rankSubstitutions(exerciseCatalog, { ...exact, approvedEquivalentIds: ['incline-dumbbell-press'] })[0]?.exercise.id)
      .toBe('incline-dumbbell-press');
  });

  it('matches CAPABILITY requirements through catalog tags', () => {
    const results = rankSubstitutions(exerciseCatalog, {
      ...base,
      originalExerciseId: 'dead-bug',
      requirement: { type: 'CAPABILITY', value: 'core' },
      reason: 'boredom',
      availableEquipment: ['bodyweight'],
    });
    expect(results.map((item) => item.exercise.id)).toEqual(['bird-dog']);
  });
});
