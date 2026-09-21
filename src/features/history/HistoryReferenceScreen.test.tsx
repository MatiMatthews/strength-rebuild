import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { WorkoutHistoryItem } from "@/application/workouts/workout-service";
import type { ProgressPlanSession } from "@/application/workouts/progress-plan";

import {
  HistoryReferenceScreen,
  type HistoryWorkouts,
} from "./HistoryReferenceScreen";

describe("HistoryReferenceScreen", () => {
  it("renders persisted session details, useful trends, disclaimer and correction audit", async () => {
    const workouts: HistoryWorkouts = {
      listHistory: jest.fn().mockResolvedValue([
        {
          id: "session-1",
          completedAt: "2026-08-02T10:00:00.000Z",
          prescribed: { dayIndex: 1, exercises: [] },
          actual: {
            id: "session-1",
            safetyModifications: [
              {
                disposition: "MODIFY_SET",
                explanation: "Reducir carga",
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
                exerciseId: "press-banca",
                originalExerciseId: "press-banca",
                requirement: "EXACT",
                sets: [
                  {
                    load: "80",
                    reps: "8",
                    rir: "2",
                    technique: "Regular",
                    pain: 3,
                    notes: "",
                  },
                ],
              },
            ],
          },
        },
      ]),
    } as unknown as HistoryWorkouts;
    const view = await render(<HistoryReferenceScreen workouts={workouts} />);
    await waitFor(() =>
      expect(
        view.getAllByText("Ejercicio no disponible en el catálogo").length,
      ).toBeGreaterThan(0),
    );
    expect(view.getByText("Progreso")).toBeTruthy();
    expect(view.getByTestId("progress-metric-strip")).toBeTruthy();
    expect(view.getByTestId("progress-training-outcomes")).toBeTruthy();
    await fireEvent.press(
      view.getByLabelText(
        "Ver resultado de Ejercicio no disponible en el catálogo",
      ),
    );
    expect(view.getByText("Fuerza estimada · e1RM")).toBeTruthy();
    expect(view.getAllByText("99,3 kg").length).toBeGreaterThan(0);
    await fireEvent.press(view.getByLabelText(/Ver sesión del/));
    expect(view.getByText(/80.*× 8/)).toBeTruthy();
    expect(
      view.getByText(
        /No se puede sustituir este ejercicio porque tiene trabajo registrado/,
      ),
    ).toBeTruthy();
    expect(view.queryByText("Ejercicio guardado")).toBeNull();
    expect(view.getByText(/no es un diagnóstico/i)).toBeTruthy();
    expect(view.getByText("• Reducir carga")).toBeTruthy();
  });

  it("renders a useful empty state", async () => {
    const view = await render(
      <HistoryReferenceScreen
        workouts={{ listHistory: jest.fn().mockResolvedValue([]) }}
      />,
    );
    await waitFor(() =>
      expect(view.getByText("Todavía no hay sesiones terminadas")).toBeTruthy(),
    );
    expect(view.queryByText(/0%|0 kg|NaN/)).toBeNull();
  });

  it("filters typed history and requires an explicit correction confirmation", async () => {
    const correctHistory = jest.fn().mockResolvedValue(undefined);
    const workouts = {
      listHistory: jest.fn().mockResolvedValue([
        {
          id: "session-1",
          completedAt: "2026-08-02T10:00:00.000Z",
          prescribed: { dayIndex: 1, exercises: [] },
          actual: {
            id: "session-1",
            safetyModifications: [],
            exercises: [
              {
                exerciseId: "barbell-bench-press",
                originalExerciseId: "barbell-bench-press",
                requirement: "EXACT",
                sets: [
                  {
                    load: "80",
                    reps: "8",
                    rir: "2",
                    technique: "Regular",
                    pain: 1,
                    notes: "controlada",
                    completed: true,
                    skipped: false,
                    disposition: "COMPLETED",
                  },
                ],
              },
            ],
          },
        },
      ]),
      correctHistory,
    };
    const view = await render(<HistoryReferenceScreen workouts={workouts} />);
    expect((await view.findAllByText("Press banca")).length).toBeGreaterThan(0);
    expect(view.queryByText(/No se puede sustituir este ejercicio/)).toBeNull();
    expect(
      view.queryByText("Ejercicio no disponible en el catálogo"),
    ).toBeNull();
    expect(view.getByLabelText("Filtrar por ciclo")).toBeTruthy();
    expect(view.getByLabelText("Filtrar por ejercicio")).toBeTruthy();
    await fireEvent.press(view.getByRole("tab", { name: "Historial" }));
    await fireEvent.press(view.getByLabelText(/Ver sesión del/));
    expect(view.getByText(/Prescrito:.*Real:/)).toBeTruthy();
    fireEvent.press(view.getByText("Corregir serie 1"));
    await waitFor(() =>
      expect(view.getAllByText(/motivo obligatorio/i).length).toBeGreaterThan(
        0,
      ),
    );
    expect(correctHistory).not.toHaveBeenCalled();
  });
});

it("opens dated unclipped results and filters actual cycles and exercises without confusing sessions with sets", async () => {
  const plan: ProgressPlanSession[] = [
    {
      sessionPlanId: "one",
      cycleId: "strength",
      cycleType: "strength",
      cycleCreatedAt: "2026-08-01",
      weekIndex: 1,
      dayIndex: 1,
      completed: true,
    },
    {
      sessionPlanId: "two",
      cycleId: "strength",
      cycleType: "strength",
      cycleCreatedAt: "2026-08-01",
      weekIndex: 1,
      dayIndex: 2,
      completed: false,
    },
    {
      sessionPlanId: "three",
      cycleId: "hyp",
      cycleType: "hypertrophy",
      cycleCreatedAt: "2026-09-01",
      weekIndex: 1,
      dayIndex: 1,
      completed: true,
    },
  ];
  const history = [0, 2].map((index, order) => ({
    id: `session-${index}`,
    completedAt: order ? "2026-09-19T12:00:00Z" : "2026-08-01T12:00:00Z",
    prescribed: { dayIndex: 1, exercises: [] },
    actual: {
      id: `session-${index}`,
      sessionPlanId: plan[index]!.sessionPlanId,
      safetyModifications: [],
      exercises: ["barbell-bench-press", "chest-supported-row"].map(
        (exerciseId, exerciseIndex) => ({
          exerciseId,
          originalExerciseId: exerciseId,
          requirement: "EXACT",
          sets: [
            {
              load: exerciseIndex ? "20" : order ? "100" : "200",
              reps: "5",
              rir: "3",
              technique: "Limpia",
              pain: 0,
              notes: "",
              completed: true,
              skipped: false,
              disposition: "COMPLETED",
            },
            {
              load: "",
              reps: "",
              rir: "",
              technique: "Limpia",
              pain: 0,
              notes: "",
              completed: false,
              skipped: false,
              disposition: "PENDING",
            },
          ],
        }),
      ),
    },
  })) as WorkoutHistoryItem[];
  const view = await render(
    <HistoryReferenceScreen
      workouts={{
        listHistory: async () => history,
        listProgressPlan: async () => plan,
      }}
    />,
  );
  await waitFor(() => expect(view.getByText("2 / 3")).toBeTruthy());
  expect(view.getByText(/67% de sesiones completadas/)).toBeTruthy();
  expect(
    view.getByText(/4 series completadas de 8 registradas.*50%/),
  ).toBeTruthy();
  await fireEvent.press(view.getByLabelText("Ver resultado de Press banca"));
  expect(view.getByLabelText(/225 kg/)).toBeTruthy();
  expect(view.getByLabelText(/112,5 kg/)).toBeTruthy();
  await fireEvent.press(view.getByLabelText(/225 kg/));
  expect(view.getByText("Serie 1: 200 kg × 5")).toBeTruthy();
  await fireEvent.press(view.getByRole("tab", { name: "Resultados" }));
  await fireEvent.press(view.getByLabelText("Filtrar por ciclo"));
  await fireEvent.press(view.getByText("Hipertrofia 2"));
  expect(view.getByText("1 / 1")).toBeTruthy();
  await fireEvent.press(view.getByLabelText("Filtrar por ejercicio"));
  await fireEvent.press(view.getByRole("radio", { name: "Press banca" }));
  expect(
    view.queryByLabelText("Ver resultado de Remo con pecho apoyado"),
  ).toBeNull();
  expect(view.getByText(/Volumen registrado · 500 kg/)).toBeTruthy();
  await fireEvent.press(view.getByRole("tab", { name: "Historial" }));
  expect(view.getAllByLabelText(/^Ver sesión del/)).toHaveLength(1);
  await fireEvent.press(view.getByLabelText(/^Ver sesión del/));
  expect(view.getByText("Serie 1: 100 kg × 5")).toBeTruthy();
  expect(view.queryByText("Serie 1: 20 kg × 5")).toBeNull();
});

it("loads saved units, keeps unknown and zero distinct, and submits the editor unit with canonical stale protection", async () => {
  const correctHistory = jest.fn().mockResolvedValue(undefined);
  const actual = {
    id: "units",
    safetyModifications: [],
    exercises: [
      {
        exerciseId: "barbell-bench-press",
        originalExerciseId: "barbell-bench-press",
        requirement: "EXACT" as const,
        sets: ["55", "", "0"].map((load) => ({
          load,
          reps: "8",
          rir: "2",
          technique: "Limpia",
          pain: 0,
          notes: "",
          completed: true,
          skipped: false,
          disposition: "COMPLETED" as const,
        })),
      },
    ],
  };
  const workouts = {
    listHistory: jest
      .fn()
      .mockResolvedValue([
        {
          id: "units",
          actual,
          prescribed: { dayIndex: 1, exercises: [] },
          completedAt: "2026-09-05",
        },
      ]),
    correctHistory,
  };
  const settingsStore = { load: jest.fn().mockResolvedValue({ units: "lb" }) };
  const view = await render(
    <HistoryReferenceScreen
      workouts={workouts}
      settingsStore={settingsStore}
    />,
  );
  await fireEvent.press(await view.findByRole("tab", { name: "Historial" }));
  await fireEvent.press(view.getByLabelText(/Ver sesión del/));
  await waitFor(() =>
    expect(view.getByText("Serie 1: 121.2542442 lb × 8")).toBeTruthy(),
  );
  expect(view.getByText("Serie 2: Sin carga × 8")).toBeTruthy();
  expect(view.getByText("Serie 3: 0 lb × 8")).toBeTruthy();
  await fireEvent.press(view.getByLabelText("Corregir serie 1 de Press banca"));
  await waitFor(() =>
    expect(view.getByLabelText("Carga corregida").props.value).toBe(
      "121.2542442",
    ),
  );
  await fireEvent.changeText(view.getByLabelText("Carga corregida"), "100,5");
  await fireEvent.changeText(
    view.getByLabelText("Motivo de la corrección"),
    "Measured",
  );
  await fireEvent.press(
    view.getByLabelText("Confirmar corrección del historial"),
  );
  await waitFor(() =>
    expect(correctHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        load: "100,5",
        unit: "lb",
        expectedLoad: "55",
      }),
    ),
  );
});
