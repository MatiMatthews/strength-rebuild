import type { ProgressPlanSession } from "@/application/workouts/progress-plan";
import type { WorkoutHistoryItem } from "@/application/workouts/workout-service";

const cycleNames: Record<string, string> = {
  strength: "Fuerza",
  hypertrophy: "Hipertrofia",
  power: "Potencia",
  transition: "Transición",
  reentry: "Reentrada",
};
export function progressCycles(plan: readonly ProgressPlanSession[]) {
  return [
    ...new Map(plan.map((session) => [session.cycleId, session])).values(),
  ].map((session, index) => ({
    value: session.cycleId,
    label: `${cycleNames[session.cycleType] ?? "Ciclo"} ${index + 1}`,
  }));
}

export function filterProgress(
  history: readonly WorkoutHistoryItem[],
  plan: readonly ProgressPlanSession[],
  cycleId: string,
  exerciseId: string,
  days: number,
  now: number,
) {
  const sessions = new Map(plan.map((item) => [item.sessionPlanId, item]));
  const cutoff = days ? now - days * 24 * 60 * 60 * 1000 : -Infinity;
  return history.filter(
    (item) =>
      (!cycleId ||
        sessions.get(item.actual.sessionPlanId ?? "")?.cycleId === cycleId) &&
      (!days ||
        (Date.parse(item.completedAt) >= cutoff &&
          Date.parse(item.completedAt) <= now)) &&
      (!exerciseId ||
        item.actual.exercises.some(
          (exercise) => exercise.exerciseId === exerciseId,
        )),
  );
}

// Projection is analytics-only. Correction editors retain original exercise indices.
export function exerciseProjection(
  items: readonly WorkoutHistoryItem[],
  exerciseId: string,
): WorkoutHistoryItem[] {
  return items.map((item) =>
    !exerciseId
      ? item
      : {
          ...item,
          actual: {
            ...item.actual,
            exercises: item.actual.exercises.filter(
              (exercise) => exercise.exerciseId === exerciseId,
            ),
          },
          ...(item.corrections
            ? {
                corrections: item.corrections.filter(
                  (correction) => correction.exerciseId === exerciseId,
                ),
              }
            : {}),
        },
  );
}
