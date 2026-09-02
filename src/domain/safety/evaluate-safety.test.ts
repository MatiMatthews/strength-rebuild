import { evaluateSafety } from './evaluate-safety';

describe('evaluateSafety', () => {
  it.each([0, 1, 2])('continues conservatively for stable pain %i', (pain) => {
    expect(evaluateSafety({ pain, painTrend: 'stable' })).toMatchObject({
      disposition: 'CONTINUE_CONSERVATIVELY',
      reviewRequired: false,
      blockedTraining: [],
    });
  });

  it.each([3, 4])('modifies the set for pain %i', (pain) => {
    expect(evaluateSafety({ pain, painTrend: 'stable' })).toMatchObject({
      disposition: 'MODIFY_SET',
      actions: ['STOP_SET', 'REDUCE_LOAD_OR_RANGE_OR_SUBSTITUTE_ONCE'],
    });
  });

  it('removes a persistent moderately painful pattern for the day', () => {
    expect(evaluateSafety({ pain: 3, painTrend: 'stable', persistsAfterModification: true })).toMatchObject({
      disposition: 'STOP_PATTERN',
      actions: ['STOP_SET', 'REMOVE_PATTERN_FOR_DAY'],
    });
  });

  it.each([
    { pain: 5, painTrend: 'stable' as const },
    { pain: 2, painTrend: 'increasing' as const },
    { pain: 1, painTrend: 'acute' as const },
  ])('stops the pattern for pain above four, acute pain, or increasing pain', (input) => {
    expect(evaluateSafety(input)).toMatchObject({
      disposition: 'STOP_PATTERN',
      actions: ['STOP_PATTERN'],
    });
  });

  it('treats a technique change as a modification even with low pain', () => {
    expect(evaluateSafety({ pain: 1, painTrend: 'stable', techniqueChanged: true })).toMatchObject({
      disposition: 'MODIFY_SET',
      actions: ['STOP_SET', 'REDUCE_LOAD_OR_RANGE_OR_SUBSTITUTE_ONCE'],
    });
  });

  it.each(['NEUROLOGICAL', 'SYSTEMIC'] as const)('aborts for a %s warning flag', (warningFlag) => {
    expect(evaluateSafety({ pain: 0, painTrend: 'stable', warningFlags: [warningFlag] })).toMatchObject({
      disposition: 'REVIEW_REQUIRED',
      reviewRequired: true,
      actions: ['ABORT_SESSION', 'ENTER_REVIEW_REQUIRED'],
    });
  });

  it('blocks heavy loading, maximal bracing, power, and painful-set intensity when abdominal restriction is active', () => {
    expect(evaluateSafety({ pain: 0, painTrend: 'stable', abdominalRestrictionActive: true })).toMatchObject({
      disposition: 'CONTINUE_WITH_RESTRICTIONS',
      blockedTraining: ['HEAVY_LOADING', 'MAXIMAL_BRACING', 'POWER', 'PAINFUL_SET_INTENSIFIERS'],
    });
  });

  it('keeps power blocked whenever the recorded restriction remains active', () => {
    expect(evaluateSafety({
      pain: 0,
      painTrend: 'stable',
      abdominalRestrictionActive: true,
    }).blockedTraining).toContain('POWER');
  });

  it('returns a deeply immutable, non-diagnostic policy result', () => {
    const result = evaluateSafety({ pain: 3, painTrend: 'stable' });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.actions)).toBe(true);
    expect(Object.isFrozen(result.blockedTraining)).toBe(true);
    expect(result.explanation.toLowerCase()).not.toMatch(/diagnos|clearance|hernia/);
  });
});
