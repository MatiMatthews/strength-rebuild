import type { WorkoutHistoryItem } from '../../application/workouts/workout-service';
import { buildHistoryAnalytics } from './workout-history';

const history = [
  {
    id: 'new', completedAt: '2026-08-02T10:00:00.000Z', prescribed: { dayIndex: 2, exercises: [] },
    actual: { id: 'new', safetyModifications: [{ disposition: 'MODIFY_SET', explanation: 'Reduce carga', actions: [], blockedTraining: [], reviewRequired: false, exerciseIndex: 0, setIndex: 0, recordedAt: '2026-08-02T10:00:00.000Z' }], exercises: [{ exerciseId: 'bench', originalExerciseId: 'bench', requirement: 'EXACT', replacement: { fromExerciseId: 'bench', reason: 'EQUIPMENT' }, sets: [{ load: '100', reps: '5', rir: '1', technique: 'Regular', pain: 3, notes: '' }] }] },
  },
  {
    id: 'old', completedAt: '2026-08-01T10:00:00.000Z', prescribed: { dayIndex: 1, exercises: [] },
    actual: { id: 'old', safetyModifications: [], exercises: [{ exerciseId: 'bench', originalExerciseId: 'bench', requirement: 'EXACT', sets: [{ load: '80', reps: '10', rir: '2', technique: 'Limpia', pain: 1, notes: '' }] }] },
  },
] as unknown as WorkoutHistoryItem[];

describe('buildHistoryAnalytics', () => {
  it('orders sessions and calculates volume, e1RM, adherence, symptoms and correction audit', () => {
    const result = buildHistoryAnalytics(history, 3);
    expect(result.sessions.map(({ id }) => id)).toEqual(['new', 'old']);
    expect(result.totalVolume).toBe(1300);
    expect(result).toMatchObject({ adherence: 1, completedSetCount: 2, skippedSetCount: 0 });
    expect(result.exercises[0]).toMatchObject({ exerciseId: 'bench', bestE1rm: 112.5, latestPain: 3 });
    expect(result.corrections).toHaveLength(2);
    expect(result.symptomDisclaimer).toMatch(/no es un diagnóstico/i);
  });

  it('returns an explicit empty state without invalid metrics', () => {
    expect(buildHistoryAnalytics([], 0)).toMatchObject({ sessions: [], exercises: [], totalVolume: 0, adherence: 0, corrections: [] });
  });

  it('normalizes decimal comma without silently losing valid volume', () => {
    const comma = structuredClone(history[0]!);
    comma.actual.exercises[0]!.sets[0]!.load = '22,5';
    comma.actual.exercises[0]!.sets[0]!.reps = '10';
    expect(buildHistoryAnalytics([comma]).totalVolume).toBe(225);
  });
});
