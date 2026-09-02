import { fireEvent, render, waitFor } from "@testing-library/react-native";

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
      expect(view.getAllByText("Ejercicio guardado").length).toBeGreaterThan(0),
    );
    expect(view.getByText("Progreso")).toBeTruthy();
    expect(view.getByTestId("progress-metric-strip")).toBeTruthy();
    expect(view.getByTestId("progress-training-outcomes")).toBeTruthy();
    expect(view.getByText(/Tendencia e1RM.*valores registrados/i)).toBeTruthy();
    expect(view.getByText(/80.*× 8/)).toBeTruthy();
    expect(view.queryByText(/press-banca/)).toBeNull();
    expect(view.getAllByText(/e1RM/).length).toBeGreaterThan(0);
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
    expect(view.getByLabelText("Filtrar por ciclo")).toBeTruthy();
    expect(view.getByLabelText("Filtrar por ejercicio")).toBeTruthy();
    expect(view.getByText(/Prescrito:.*Real:/)).toBeTruthy();
    fireEvent.press(view.getByText("Corregir serie"));
    await waitFor(() =>
      expect(view.getAllByText(/motivo obligatorio/i).length).toBeGreaterThan(
        0,
      ),
    );
    expect(correctHistory).not.toHaveBeenCalled();
  });
});
