import {
  generateCycleSequence,
  generatePrescription,
  PRESCRIPTION_POLICY_VERSION,
} from './generator';

describe('versioned cycle prescriptions', () => {
  it.each([
    ['hypertrophy', { sets: 3, reps: { min: 6, max: 15 }, rir: { min: 2, max: 3 }, loadPercent: null }],
    ['strength', { sets: 3, reps: { min: 3, max: 6 }, rir: { min: 2, max: 3 }, loadPercent: { min: 75, max: 85 } }],
    ['power', { sets: 3, reps: { min: 2, max: 5 }, rir: { min: 3, max: 5 }, loadPercent: null }],
    ['transition', { sets: 2, reps: { min: 5, max: 10 }, rir: { min: 4, max: 5 }, loadPercent: null }],
    ['reentry', { sets: 2, reps: { min: 5, max: 10 }, rir: { min: 4, max: 5 }, loadPercent: null }],
  ] as const)('matches the %s golden profile', (type, expectedTarget) => {
    const prescription = generatePrescription({ id: `${type}-1`, type, weeks: type === 'transition' ? 1 : 2 });

    expect(prescription).toMatchObject({
      schemaVersion: 1,
      policyVersion: PRESCRIPTION_POLICY_VERSION,
      id: `${type}-1`,
      type,
      weeks: expect.any(Array),
    });
    expect(prescription.weeks).toHaveLength(type === 'transition' ? 1 : 2);
    expect(prescription.weeks[0]!.sessions).toHaveLength(3);
    expect(prescription.weeks[0]!.sessions[0]!.exercises[0]!.target).toEqual(expectedTarget);
  });

  it('inserts exactly one transition between different loading cycles', () => {
    const sequence = generateCycleSequence([
      { id: 'h1', type: 'hypertrophy', weeks: 2 },
      { id: 's1', type: 'strength', weeks: 2 },
      { id: 'p1', type: 'power', weeks: 2 },
    ]);

    expect(sequence.map(({ id, type }) => [id, type])).toEqual([
      ['h1', 'hypertrophy'],
      ['h1--to--s1', 'transition'],
      ['s1', 'strength'],
      ['s1--to--p1', 'transition'],
      ['p1', 'power'],
    ]);
  });

  it('does not insert transition around re-entry or duplicate one supplied by the caller', () => {
    const sequence = generateCycleSequence([
      { id: 'r1', type: 'reentry', weeks: 1 },
      { id: 'h1', type: 'hypertrophy', weeks: 2 },
      { id: 't1', type: 'transition', weeks: 1 },
      { id: 's1', type: 'strength', weeks: 2 },
    ]);

    expect(sequence.map(({ type }) => type)).toEqual(['reentry', 'hypertrophy', 'transition', 'strength']);
  });

  it('returns deeply immutable snapshots and does not share mutable structures', () => {
    const first = generatePrescription({ id: 'h1', type: 'hypertrophy', weeks: 2 });
    const second = generatePrescription({ id: 'h2', type: 'hypertrophy', weeks: 2 });

    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.weeks)).toBe(true);
    expect(Object.isFrozen(first.weeks[0]!.sessions[0]!.exercises[0]!.target.reps)).toBe(true);
    expect(first.weeks).not.toBe(second.weeks);
    (first.weeks as unknown as { index: number }[])[0]!.index = 99;
    expect(first.weeks[0]!.index).toBe(1);
    expect(second.weeks[0]!.index).toBe(1);
  });

  it('rejects invalid identifiers, lengths, and explicit transition lengths', () => {
    expect(() => generatePrescription({ id: '', type: 'strength', weeks: 2 })).toThrow('id');
    expect(() => generatePrescription({ id: 'bad', type: 'strength', weeks: 0 })).toThrow('weeks');
    expect(() => generatePrescription({ id: 'bad', type: 'transition', weeks: 2 })).toThrow('one week');
  });
});
