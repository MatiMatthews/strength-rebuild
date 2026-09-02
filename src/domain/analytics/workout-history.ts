import type { WorkoutHistoryItem } from '../../application/workouts/workout-service';

export interface ExerciseTrend { exerciseId: string; totalVolume: number; bestE1rm: number; latestPain: number; points: readonly number[] }
export interface HistoryCorrection { sessionId: string; kind: 'replacement' | 'safety'; detail: string }

const number = (value: string) => {
  const parsed = Number(value.trim().replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};
const e1rm = (load: number, reps: number) => reps > 0 && reps < 37 ? load * 36 / (37 - reps) : load;

export function buildHistoryAnalytics(items: readonly WorkoutHistoryItem[], plannedSessions = items.length) {
  const sessions = [...items].sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  const exerciseMap = new Map<string, { volume: number; best: number; pain: number; latest: string; points: number[] }>();
  const corrections: HistoryCorrection[] = [];
  let totalVolume = 0;
  let completedSetCount = 0;
  let skippedSetCount = 0;

  for (const session of sessions) {
    for (const exercise of session.actual.exercises) {
      const current = exerciseMap.get(exercise.exerciseId) ?? { volume: 0, best: 0, pain: 0, latest: '', points: [] };
      let sessionBest = 0;
      for (const set of exercise.sets) {
        const completed = set.disposition === 'COMPLETED' || (set.disposition === undefined && set.completed !== false && !set.skipped);
        if (set.disposition === 'SKIPPED' || set.skipped) { skippedSetCount += 1; continue; }
        if (!completed) continue;
        completedSetCount += 1;
        const load = number(set.load); const reps = number(set.reps); const volume = load * reps;
        totalVolume += volume; current.volume += volume; sessionBest = Math.max(sessionBest, e1rm(load, reps));
        if (session.completedAt > current.latest) { current.pain = set.pain; current.latest = session.completedAt; }
      }
      current.best = Math.max(current.best, sessionBest); current.points.push(Math.round(sessionBest * 10) / 10);
      exerciseMap.set(exercise.exerciseId, current);
      if (exercise.replacement) corrections.push({ sessionId: session.id, kind: 'replacement', detail: `${exercise.replacement.fromExerciseId} → ${exercise.exerciseId}: ${exercise.replacement.reason}` });
    }
    for (const safety of session.actual.safetyModifications) corrections.push({ sessionId: session.id, kind: 'safety', detail: safety.explanation });
  }

  return {
    sessions,
    totalVolume,
    adherence: completedSetCount + skippedSetCount > 0 ? completedSetCount / (completedSetCount + skippedSetCount) : 0,
    completedSetCount,
    skippedSetCount,
    exercises: [...exerciseMap].map(([exerciseId, value]) => ({ exerciseId, totalVolume: value.volume, bestE1rm: Math.round(value.best * 10) / 10, latestPain: value.pain, points: value.points })),
    corrections,
    symptomDisclaimer: 'Las tendencias de molestias son solo un registro personal; no es un diagnóstico ni una indicación médica.',
  };
}
