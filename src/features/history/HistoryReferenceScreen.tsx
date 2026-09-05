import {
  BarChart3,
  CalendarCheck2,
  Dumbbell,
  ShieldCheck,
} from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import type { WorkoutHistoryItem } from "@/application/workouts/workout-service";
import {
  ActionButton,
  AppText,
  FeedbackBanner,
  Panel,
  Screen,
  Tag,
  TextField,
} from "@/design-system/v2.2/primitives";
import { palette, spacing } from "@/design-system/v2.2/tokens";
import { exerciseCatalog } from "@/data/seeds/exercises";
import { buildHistoryAnalytics } from "@/domain/analytics/workout-history";
import { AppMasthead, OrdinalRow, PhaseBand } from "@/design-system/v2.2/components";

export interface HistoryWorkouts {
  listHistory(): Promise<WorkoutHistoryItem[]>;
  correctHistory?(input: {
    workoutId: string;
    exerciseId: string;
    setIndex: number;
    load: string;
    reason: string;
  }): Promise<void>;
}

const exerciseNames = new Map(
  exerciseCatalog.map((exercise) => [exercise.id, exercise.name]),
);
const exerciseName = (exerciseId: string) =>
  exerciseNames.get(exerciseId) ?? "Ejercicio no disponible en el catálogo";

export function HistoryReferenceScreen({
  workouts,
  refreshKey = 0,
}: {
  workouts: HistoryWorkouts;
  refreshKey?: number;
}) {
  const [history, setHistory] = useState<WorkoutHistoryItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [cycleFilter, setCycleFilter] = useState("");
  const [exerciseFilter, setExerciseFilter] = useState("");
  const [correction, setCorrection] = useState<{
    workoutId: string;
    exerciseId: string;
    setIndex: number;
    load: string;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    workouts
      .listHistory()
      .then(setHistory)
      .finally(() => setLoaded(true));
  }, [refreshKey, workouts]);
  const filteredHistory = useMemo(
    () =>
      history.filter((session) => {
        const cycleNeedle = cycleFilter.trim().toLocaleLowerCase("es");
        const exerciseNeedle = exerciseFilter.trim().toLocaleLowerCase("es");
        const cycle = String(
          ("cycleId" in session.prescribed && session.prescribed.cycleId) ||
            session.actual.sessionPlanId ||
            session.prescribed.dayIndex ||
            "",
        ).toLocaleLowerCase("es");
        const exercises = session.actual.exercises
          .map(
            (exercise) =>
              `${exercise.exerciseId} ${exerciseName(exercise.exerciseId)}`,
          )
          .join(" ")
          .toLocaleLowerCase("es");
        return (
          (!cycleNeedle || cycle.includes(cycleNeedle)) &&
          (!exerciseNeedle || exercises.includes(exerciseNeedle))
        );
      }),
    [cycleFilter, exerciseFilter, history],
  );
  const analytics = useMemo(
    () => buildHistoryAnalytics(filteredHistory),
    [filteredHistory],
  );
  const submitCorrection = async () => {
    if (!correction || !workouts.correctHistory) return;
    if (!reason.trim()) {
      setMessage("El motivo obligatorio debe explicar la corrección.");
      return;
    }
    try {
      await workouts.correctHistory({ ...correction, reason });
      setHistory(await workouts.listHistory());
      setCorrection(null);
      setReason("");
      setMessage(
        "Corrección registrada; el historial original permanece intacto.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo registrar la corrección.",
      );
    }
  };

  return (
    <Screen testID="history-screen">
      <AppMasthead context="Resultados locales de sesiones terminadas" title="Progreso" />
      <PhaseBand label={cycleFilter ? `FILTRO · ${cycleFilter}` : "TODOS LOS RESULTADOS · DATOS LOCALES"} />
      {!loaded ? (
        <Panel>
          <AppText>Cargando historial…</AppText>
        </Panel>
      ) : history.length === 0 ? (
        <Panel>
          <AppText variant="bodyStrong">
            Todavía no hay sesiones terminadas
          </AppText>
          <AppText color="muted">
            Cuando termines un entrenamiento, aquí aparecerán sus detalles y
            tendencias.
          </AppText>
        </Panel>
      ) : (
        <>
          <Panel>
            <AppText
              accessibilityRole="header"
              aria-level={2}
              variant="heading"
            >
              Explorar historial
            </AppText>
            <View style={styles.filters}>
              <TextField
                accessibilityLabel="Filtrar por ciclo"
                label="Ciclo"
                onChangeText={setCycleFilter}
                placeholder="Todos los ciclos"
                value={cycleFilter}
              />
              <TextField
                accessibilityLabel="Filtrar por ejercicio"
                label="Ejercicio"
                onChangeText={setExerciseFilter}
                placeholder="Todos los ejercicios"
                value={exerciseFilter}
              />
            </View>
            {analytics.sessions.length === 0 ? (
              <>
                <AppText variant="bodyStrong">
                  No hay resultados para estos filtros
                </AppText>
                <AppText color="muted">
                  Borra un filtro para volver a explorar tus sesiones.
                </AppText>
              </>
            ) : null}
          </Panel>
          <View style={styles.metrics} testID="progress-metric-strip">
            <Panel style={styles.flex}>
              <CalendarCheck2 color={palette.hypertrophy} size={22} />
              <AppText variant="title">
                {Math.round(analytics.adherence * 100)}%
              </AppText>
              <AppText color="muted" variant="caption">
                Adherencia registrada
              </AppText>
            </Panel>
            <Panel style={styles.flex}>
              <BarChart3 color={palette.strength} size={22} />
              <AppText variant="title">
                {analytics.totalVolume > 0
                  ? `${analytics.totalVolume.toLocaleString("es-CL")} kg`
                  : "Sin carga registrada"}
              </AppText>
              <AppText color="muted" variant="caption">
                Volumen total
              </AppText>
            </Panel>
          </View>
          <View testID="progress-training-outcomes" style={styles.outcomes}>
            {analytics.exercises.map((exercise, index) => (
              <View key={exercise.exerciseId}><OrdinalRow actionLabel="Ver resultado" detail={`${exercise.points.length} registros`} name={exerciseName(exercise.exerciseId)} onPress={() => undefined} ordinal={index + 1} /><Panel accent={palette.strength}>
                <View style={styles.between}>
                  <View style={styles.inline}>
                    <Dumbbell color={palette.strength} size={21} />
                    <AppText variant="bodyStrong">
                      {exerciseName(exercise.exerciseId)}
                    </AppText>
                  </View>
                  {exercise.bestE1rm > 0 ? (
                    <Tag>e1RM {exercise.bestE1rm} kg</Tag>
                  ) : (
                    <Tag>e1RM no disponible</Tag>
                  )}
                </View>
                <AppText color="muted" variant="caption">
                  {exercise.totalVolume > 0
                    ? `Volumen ${exercise.totalVolume.toLocaleString("es-CL")} kg`
                    : "Volumen no disponible"}{" "}
                  · molestia más reciente {exercise.latestPain}/10
                </AppText>
                {exercise.points.some((point) => point > 0) ? (
                  <>
                    <View
                      accessibilityElementsHidden
                      importantForAccessibility="no"
                      style={styles.chart}
                    >
                      {exercise.points
                        .filter((point) => point > 0)
                        .map((point, index) => (
                          <View
                            key={`${point}-${index}`}
                            style={[
                              styles.bar,
                              { height: Math.max(8, Math.min(72, point / 2)) },
                            ]}
                          />
                        ))}
                    </View>
                    <AppText color="muted" variant="caption">
                      Tendencia e1RM de {exerciseName(exercise.exerciseId)}:
                      valores registrados{" "}
                      {exercise.points.filter((point) => point > 0).join(", ")}{" "}
                      kg.
                    </AppText>
                  </>
                ) : (
                  <AppText color="muted">Tendencia no disponible</AppText>
                )}
              </Panel></View>
            ))}
          </View>
          <Panel>
            <AppText
              accessibilityRole="header"
              aria-level={2}
              variant="heading"
            >
              Sesiones recientes
            </AppText>
            <AppText variant="bodyStrong">Comparación del plan</AppText>
            {analytics.sessions.map((session) => (
              <View key={session.id} style={styles.session}>
                <AppText variant="bodyStrong">
                  {new Date(session.completedAt).toLocaleDateString("es-CL")}
                </AppText>
                <AppText color="muted" variant="caption">
                  Prescrito: {session.prescribed.exercises.length} ejercicios ·
                  Real: {session.actual.exercises.length} ejercicios
                </AppText>
                {session.actual.exercises.map((exercise) => {
                  const completed = exercise.sets.filter(
                    (set) =>
                      set.disposition === "COMPLETED" ||
                      (set.disposition === undefined &&
                        set.completed !== false &&
                        !set.skipped),
                  );
                  const omitted = exercise.sets.filter(
                    (set) => set.disposition === "SKIPPED" || set.skipped,
                  );
                  const first = completed[0];
                  return (
                    <View key={exercise.exerciseId}>
                      <AppText>{exerciseName(exercise.exerciseId)}</AppText>
                      {!exerciseNames.has(exercise.exerciseId) ? (
                        <AppText color="muted">
                          No se puede sustituir este ejercicio porque tiene trabajo registrado.
                          Conservamos sus series y cargas sin atribuirlas a otro movimiento.
                        </AppText>
                      ) : null}
                      <AppText color="muted" variant="caption">
                        {completed.length} completada
                        {completed.length === 1 ? "" : "s"} · {omitted.length}{" "}
                        omitida{omitted.length === 1 ? "" : "s"}
                      </AppText>
                      {completed.length > 0 ? (
                        <AppText>
                          {completed
                            .map(
                              (set) =>
                                `${set.load || "Sin carga"} × ${set.reps || "sin repeticiones"} · RIR/RPE ${set.rir || "—"} · técnica ${set.technique} · molestia ${set.pain}/10${set.notes ? ` · ${set.notes}` : ""}`,
                            )
                            .join(", ")}
                        </AppText>
                      ) : (
                        <AppText>Sin series completadas</AppText>
                      )}
                      {first && workouts.correctHistory ? (
                        <ActionButton
                          accessibilityLabel={`Corregir historial de ${exerciseName(exercise.exerciseId)}`}
                          onPress={() => {
                            setCorrection({
                              workoutId: session.id,
                              exerciseId: exercise.exerciseId,
                              setIndex: exercise.sets.indexOf(first),
                              load: first.load,
                            });
                            setReason("");
                            setMessage(
                              "El motivo obligatorio debe explicar la corrección antes de confirmar.",
                            );
                          }}
                          tone="secondary"
                        >
                          Corregir serie
                        </ActionButton>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ))}
          </Panel>
          {correction ? (
            <Panel accent={palette.transition}>
              <AppText
                accessibilityRole="header"
                aria-level={2}
                variant="heading"
              >
                Confirmar corrección
              </AppText>
              <AppText color="muted">
                La sesión original es inmutable. Se agregará un evento auditado
                con la interpretación anterior y la corregida.
              </AppText>
              <TextField
                accessibilityLabel="Carga corregida"
                keyboardType="decimal-pad"
                label="Carga corregida"
                onChangeText={(load) => setCorrection({ ...correction, load })}
                value={correction.load}
              />
              <TextField
                accessibilityLabel="Motivo de la corrección"
                label="Motivo obligatorio"
                onChangeText={setReason}
                value={reason}
              />
              <ActionButton
                accessibilityLabel="Confirmar corrección del historial"
                onPress={submitCorrection}
              >
                Confirmar corrección
              </ActionButton>
            </Panel>
          ) : null}
          {message ? (
            <FeedbackBanner
              message={message}
              tone={
                message.includes("obligatorio") || message.includes("No se")
                  ? "danger"
                  : "success"
              }
            />
          ) : null}
          <Panel accent={palette.transition}>
            <View style={styles.inline}>
              <ShieldCheck color={palette.transition} size={21} />
              <AppText variant="bodyStrong">Molestias y correcciones</AppText>
            </View>
            <AppText color="muted" variant="caption">
              {analytics.symptomDisclaimer}
            </AppText>
            {analytics.corrections.length === 0 ? (
              <AppText>Sin correcciones registradas.</AppText>
            ) : (
              analytics.corrections.map((item, index) => (
                <AppText key={`${item.sessionId}-${item.kind}-${index}`}>
                  • {item.detail}
                </AppText>
              ))
            )}
          </Panel>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: palette.strength,
    borderRadius: 3,
    flex: 1,
    maxWidth: 28,
  },
  between: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  chart: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: spacing.sm,
    height: 76,
  },
  filters: { gap: spacing.sm },
  flex: { flex: 1 },
  inline: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  outcomes: { gap: spacing.md },
  section: { gap: spacing.sm },
  session: { gap: spacing.xs, minHeight: 76, paddingVertical: spacing.md },
});
