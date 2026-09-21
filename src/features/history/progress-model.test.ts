import {
  exerciseProjection,
  filterProgress,
  progressCycles,
} from "./progress-model";
import type { WorkoutHistoryItem } from "@/application/workouts/workout-service";
import type { ProgressPlanSession } from "@/application/workouts/progress-plan";
import { buildHistoryAnalytics } from "@/domain/analytics/workout-history";

const plan: ProgressPlanSession[] = ["strength", "hypertrophy"].map(
  (cycleType, index) => ({
    sessionPlanId: `plan-${index}`,
    cycleId: `cycle-${index}`,
    cycleType,
    cycleCreatedAt: "2026-08-01",
    weekIndex: 1,
    dayIndex: 1,
    completed: true,
  }),
);
const history = plan.map((item, index) => ({
  id: `work-${index}`,
  completedAt: index ? "2026-09-19T12:00:00Z" : "2026-08-01T12:00:00Z",
  prescribed: { dayIndex: 1, exercises: [] },
  actual: {
    id: `work-${index}`,
    sessionPlanId: item.sessionPlanId,
    safetyModifications: [],
    exercises: ["bench", "row"].map((exerciseId) => ({
      exerciseId,
      originalExerciseId: exerciseId,
      requirement: "EXACT",
      sets: [
        {
          load: exerciseId === "bench" ? "60" : "20",
          reps: "8",
          rir: "3",
          technique: "Limpia",
          pain: 0,
          notes: "",
          completed: true,
          skipped: false,
          disposition: "COMPLETED",
        },
      ],
    })),
  },
})) as WorkoutHistoryItem[];

it("filters actual cycle and period while keeping readable cycle names", () => {
  const now = Date.parse("2026-09-20T12:00:00Z");
  expect(progressCycles(plan)).toEqual([
    { value: "cycle-0", label: "Fuerza 1" },
    { value: "cycle-1", label: "Hipertrofia 2" },
  ]);
  expect(
    filterProgress(history, plan, "", "", 30, now).map((item) => item.id),
  ).toEqual(["work-1"]);
  expect(
    filterProgress(history, plan, "cycle-0", "", 0, now).map((item) => item.id),
  ).toEqual(["work-0"]);
  expect(filterProgress(history, plan, "cycle-0", "", 30, now)).toEqual([]);
});

it("filters aggregate exercises, not just sessions, without changing source indices or snapshots", () => {
  const before = JSON.stringify(history);
  const projection = exerciseProjection(
    filterProgress(history, plan, "", "row", 0, Date.now()),
    "row",
  );
  const analytics = buildHistoryAnalytics(projection, 6);
  expect(analytics.exercises.map((item) => item.exerciseId)).toEqual(["row"]);
  expect(analytics.totalVolume).toBe(320);
  expect(analytics.adherence).toBeCloseTo(1 / 3);
  expect(JSON.stringify(history)).toBe(before);
  expect(history[0]!.actual.exercises[1]!.exerciseId).toBe("row");
});
