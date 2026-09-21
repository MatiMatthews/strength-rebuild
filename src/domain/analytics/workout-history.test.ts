import type { WorkoutHistoryItem } from "../../application/workouts/workout-service";
import { buildHistoryAnalytics } from "./workout-history";

const history = [
  {
    id: "new",
    completedAt: "2026-08-02T10:00:00.000Z",
    prescribed: { dayIndex: 2, exercises: [] },
    actual: {
      id: "new",
      safetyModifications: [
        {
          disposition: "MODIFY_SET",
          explanation: "Reduce carga",
          actions: [],
          blockedTraining: [],
          reviewRequired: false,
          exerciseIndex: 0,
          setIndex: 0,
          recordedAt: "2026-08-02T10:00:00.000Z",
        },
      ],
      exercises: [
        {
          exerciseId: "bench",
          originalExerciseId: "bench",
          requirement: "EXACT",
          replacement: { fromExerciseId: "bench", reason: "EQUIPMENT" },
          sets: [
            {
              load: "100",
              reps: "5",
              rir: "1",
              technique: "Regular",
              pain: 3,
              notes: "",
            },
          ],
        },
      ],
    },
  },
  {
    id: "old",
    completedAt: "2026-08-01T10:00:00.000Z",
    prescribed: { dayIndex: 1, exercises: [] },
    actual: {
      id: "old",
      safetyModifications: [],
      exercises: [
        {
          exerciseId: "bench",
          originalExerciseId: "bench",
          requirement: "EXACT",
          sets: [
            {
              load: "80",
              reps: "10",
              rir: "2",
              technique: "Limpia",
              pain: 1,
              notes: "",
            },
          ],
        },
      ],
    },
  },
] as unknown as WorkoutHistoryItem[];

describe("buildHistoryAnalytics", () => {
  it("orders sessions and calculates volume, e1RM, adherence, symptoms and correction audit", () => {
    const result = buildHistoryAnalytics(history, 3);
    expect(result.sessions.map(({ id }) => id)).toEqual(["new", "old"]);
    expect(result.totalVolume).toBe(1300);
    expect(result).toMatchObject({
      adherence: 2 / 3,
      setCompletion: 1,
      completedSetCount: 2,
      skippedSetCount: 0,
    });
    expect(result.exercises[0]).toMatchObject({
      exerciseId: "bench",
      bestE1rm: 112.5,
      latestPain: 3,
    });
    expect(result.corrections).toHaveLength(2);
    expect(result.symptomDisclaimer).toMatch(/no es un diagnóstico/i);
  });

  it("returns an explicit empty state without invalid metrics", () => {
    expect(buildHistoryAnalytics([], 0)).toMatchObject({
      sessions: [],
      exercises: [],
      totalVolume: 0,
      adherence: 0,
      corrections: [],
    });
  });

  it("keeps pending-only exercises in set accounting, not in recorded result trends", () => {
    const session = structuredClone(history[0]!);
    session.actual.exercises[0]!.sets[0]!.completed = false;
    session.actual.exercises[0]!.sets[0]!.disposition = "PENDING";
    expect(buildHistoryAnalytics([session], 3)).toMatchObject({
      exercises: [],
      pendingSetCount: 1,
      completedSetCount: 0,
      totalVolume: 0,
    });
  });

  it("normalizes decimal comma without silently losing valid volume", () => {
    const comma = structuredClone(history[0]!);
    comma.actual.exercises[0]!.sets[0]!.load = "22,5";
    comma.actual.exercises[0]!.sets[0]!.reps = "10";
    expect(buildHistoryAnalytics([comma]).totalVolume).toBe(225);
  });

  it("keeps session consistency independent of partial sets and dates the effective trend without clipping", () => {
    const partial = structuredClone(history[1]!);
    const first = partial.actual.exercises[0]!.sets[0]!;
    partial.actual.exercises[0]!.sets = [
      { ...first, disposition: "COMPLETED", load: "200", reps: "5" },
      { ...first, completed: false, disposition: "PENDING" },
    ];
    const result = buildHistoryAnalytics([history[0]!, partial], 4);
    expect(result.adherence).toBe(0.5);
    expect(result.setCompletion).toBeCloseTo(2 / 3);
    expect(result.exercises[0]!.datedPoints).toEqual([
      { workoutId: "old", at: "2026-08-01T10:00:00.000Z", value: 225 },
      { workoutId: "new", at: "2026-08-02T10:00:00.000Z", value: 112.5 },
    ]);
    expect(result.exercises[0]!.metric).toBe("e1rm");
    expect(result.exercises[0]!.bestE1rm).toBe(225);
  });

  it("gives unloaded and timed work useful quantity trends rather than zero estimated strength", () => {
    const session = structuredClone(history[0]!);
    session.actual.exercises[0]!.recording = "seconds";
    session.actual.exercises[0]!.sets[0] = {
      ...session.actual.exercises[0]!.sets[0]!,
      load: "",
      reps: "",
      seconds: "45",
    };
    const result = buildHistoryAnalytics([session], 3);
    expect(result.exercises[0]).toMatchObject({
      metric: "seconds",
      bestE1rm: 0,
      points: [45],
    });
    expect(result.totalVolume).toBe(0);
  });
});
