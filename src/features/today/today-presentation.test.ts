import type { TodayData } from '@/application/programs/program-service';

import { presentToday } from './today-presentation';

const exercise = (exerciseId: string, calculatedLoad?: number, loadProvenance?: string) => ({
  exerciseId,
  requirement: 'EXACT' as const,
  target: { sets: 3, reps: { min: 5, max: 8 }, rir: { min: 2, max: 3 }, loadPercent: null },
  qualityStops: [],
  ...(calculatedLoad === undefined ? {} : { calculatedLoad }),
  ...(loadProvenance === undefined ? {} : { loadProvenance }),
});

function today(session: TodayData['session']): TodayData {
  return {
    cycleId: 'strength-1', cycleType: 'strength', weekIndex: 2, dayIndex: 1,
    cycle: { schemaVersion: 1, policyVersion: 'cycle-prescription-v1', id: 'strength-1', type: 'strength', weeks: [{ index: 2, sessions: [session] }] },
    session,
  };
}

describe('presentToday', () => {
  it('projects canonical blocks in role and exercise order with truthful load provenance', () => {
    const primary = exercise('barbell-bench-press', 72.5, 'bench reference; rounded to 2.5');
    const accessory = exercise('chest-supported-row');
    const model = presentToday({ kind: 'planned', data: today({
      dayIndex: 1,
      blocks: [
        { role: 'primary', exercises: [primary] },
        { role: 'accessory', exercises: [accessory] },
        { role: 'finish-review', exercises: [exercise('session-review')] },
      ],
      exercises: [primary, accessory],
    }) });

    expect(model.kind).toBe('active');
    if (model.kind !== 'active') throw new Error('Expected active presentation');
    expect(model.rows.map(({ blockRole, exerciseId }) => [blockRole, exerciseId])).toEqual([
      ['primary', 'barbell-bench-press'], ['accessory', 'chest-supported-row'],
    ]);
    expect(model.rows[0]).toMatchObject({ load: 72.5, loadProvenance: 'bench reference; rounded to 2.5' });
    expect(model.rows[1]).toMatchObject({ load: null, loadLabel: 'Sin carga prescrita', loadProvenance: 'No disponible' });
    expect(model.metrics).toEqual({ exerciseCount: 2, setCount: 6, durationMinutes: null });
  });

  it('uses the lossless flat projection only for legacy sessions and never invents duration', () => {
    const model = presentToday({ kind: 'planned', data: today({ dayIndex: 1, exercises: [exercise('dead-bug')] }) });
    if (model.kind !== 'active') throw new Error('Expected active presentation');
    expect(model.rows[0]).toMatchObject({ blockRole: null, exerciseId: 'dead-bug' });
    expect(model.metrics.durationMinutes).toBeNull();
    expect(model.metricLabel).toBe('1 ejercicio · 3 series');
  });

  it.each([
    [{ kind: 'empty' }, 'empty'],
    [{ kind: 'review-required' }, 'review-required'],
    [{ kind: 'no-workout', nextSessionLabel: 'Miércoles' }, 'no-workout'],
  ] as const)('maps %j deterministically', (state, kind) => {
    expect(presentToday(state)).toMatchObject({ kind });
  });

  it.each(['resume', 'restriction'] as const)('preserves data for the %s state', (kind) => {
    const data = today({ dayIndex: 1, exercises: [exercise('dead-bug')] });
    expect(presentToday({ kind, data })).toMatchObject({ kind, rows: [{ exerciseId: 'dead-bug' }] });
  });
});
