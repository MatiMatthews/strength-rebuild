import {
  POUNDS_TO_KG,
  type LoadUnit,
} from "../../application/workouts/load-entry";
import type { WorkoutHistoryItem } from "../../application/workouts/workout-service";

export interface TrendPoint {
  workoutId: string;
  at: string;
  value: number;
}
export interface ExerciseTrend {
  exerciseId: string;
  totalVolume: number;
  bestE1rm: number;
  latestPain: number;
  points: readonly number[];
  datedPoints: readonly TrendPoint[];
  metric: "e1rm" | "seconds" | "reps";
}
export interface HistoryCorrection {
  sessionId: string;
  kind: "replacement" | "safety" | "load";
  detail: string;
  exerciseId?: string;
}

const number = (value: string) => {
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};
const e1rm = (load: number, reps: number) =>
  reps > 0 && reps < 37 ? (load * 36) / (37 - reps) : load;

export function buildHistoryAnalytics(
  items: readonly WorkoutHistoryItem[],
  plannedSessions = items.length,
  unit: LoadUnit = "kg",
) {
  const display = (value: string) =>
    value.trim()
      ? String(
          Number(
            (Number(value) / (unit === "lb" ? POUNDS_TO_KG : 1)).toFixed(8),
          ),
        )
      : "Sin carga";
  const sessions = [...items].sort((a, b) =>
    b.completedAt.localeCompare(a.completedAt),
  );
  const exerciseMap = new Map<
    string,
    {
      volume: number;
      best: number;
      pain: number;
      latest: string;
      datedPoints: TrendPoint[];
      metric: ExerciseTrend["metric"];
    }
  >();
  const corrections: HistoryCorrection[] = [];
  let totalVolume = 0;
  let completedSetCount = 0;
  let skippedSetCount = 0;
  let pendingSetCount = 0;

  for (const session of sessions) {
    for (const exercise of session.actual.exercises) {
      const metric =
        exercise.recording === "seconds"
          ? "seconds"
          : ["bodyweight-reps", "reps-per-side"].includes(
                exercise.recording ?? "",
              ) && exercise.exerciseId !== "pallof-press"
            ? "reps"
            : "e1rm";
      const current = exerciseMap.get(exercise.exerciseId) ?? {
        volume: 0,
        best: 0,
        pain: 0,
        latest: "",
        datedPoints: [],
        metric,
      };
      let sessionBest = 0;
      let hasCompletedWork = false;
      for (const set of exercise.sets) {
        const completed =
          set.disposition === "COMPLETED" ||
          (set.disposition === undefined &&
            set.completed !== false &&
            !set.skipped);
        if (set.disposition === "SKIPPED" || set.skipped) {
          skippedSetCount += 1;
          continue;
        }
        if (!completed) {
          pendingSetCount += 1;
          continue;
        }
        completedSetCount += 1;
        hasCompletedWork = true;
        const load = number(set.load);
        const reps = number(set.reps);
        const volume = metric === "e1rm" ? load * reps : 0;
        totalVolume += volume;
        current.volume += volume;
        sessionBest = Math.max(
          sessionBest,
          metric === "seconds"
            ? number(set.seconds ?? "")
            : metric === "reps"
              ? reps
              : e1rm(load, reps),
        );
        if (session.completedAt > current.latest) {
          current.pain = set.pain;
          current.latest = session.completedAt;
        } else if (session.completedAt === current.latest)
          current.pain = Math.max(current.pain, set.pain);
      }
      if (hasCompletedWork) {
        if (metric === "e1rm")
          current.best = Math.max(current.best, sessionBest);
        const previousPoint = current.datedPoints.find(
          (point) => point.workoutId === session.id,
        );
        if (previousPoint)
          previousPoint.value = Math.max(
            previousPoint.value,
            Math.round(sessionBest * 10) / 10,
          );
        else
          current.datedPoints.push({
            workoutId: session.id,
            at: session.completedAt,
            value: Math.round(sessionBest * 10) / 10,
          });
        exerciseMap.set(exercise.exerciseId, current);
      }
      if (exercise.replacement)
        corrections.push({
          sessionId: session.id,
          kind: "replacement",
          detail: `${exercise.replacement.fromExerciseId} → ${exercise.exerciseId}: ${exercise.replacement.reason}`,
        });
    }
    for (const event of session.corrections ?? [])
      corrections.push({
        sessionId: session.id,
        kind: "load",
        exerciseId: event.exerciseId,
        detail: `Corrección ${event.order} · ejercicio ${event.exerciseIndex + 1} · serie ${event.setIndex + 1} · original ${display(event.originalLoad)} ${unit} · ${display(event.beforeLoad)} → ${display(event.afterLoad)} ${unit} · ${event.reason}${event.enteredLoad ? ` · entrada ${event.enteredLoad.value} ${event.enteredLoad.unit}` : ""}`,
      });
    for (const safety of session.actual.safetyModifications)
      corrections.push({
        sessionId: session.id,
        kind: "safety",
        detail: safety.explanation,
      });
  }

  return {
    sessions,
    totalVolume,
    adherence:
      plannedSessions > 0
        ? new Set(sessions.map((item) => item.actual.sessionPlanId ?? item.id))
            .size / plannedSessions
        : 0,
    setCompletion:
      completedSetCount + skippedSetCount + pendingSetCount > 0
        ? completedSetCount /
          (completedSetCount + skippedSetCount + pendingSetCount)
        : 0,
    completedSetCount,
    skippedSetCount,
    pendingSetCount,
    exercises: [...exerciseMap].map(([exerciseId, value]): ExerciseTrend => {
      const datedPoints = [...value.datedPoints].sort((a, b) =>
        a.at.localeCompare(b.at),
      );
      return {
        exerciseId,
        totalVolume: value.volume,
        bestE1rm: Math.round(value.best * 10) / 10,
        latestPain: value.pain,
        metric: value.metric,
        datedPoints,
        points: datedPoints.map((point) => point.value),
      };
    }),
    corrections,
    symptomDisclaimer:
      "Las tendencias de molestias son solo un registro personal; no es un diagnóstico ni una indicación médica.",
  };
}
