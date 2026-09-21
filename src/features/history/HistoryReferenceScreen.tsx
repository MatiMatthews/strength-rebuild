import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { displayLoad, type LoadUnit } from "@/application/workouts/load-entry";
import type { WorkoutHistoryItem } from "@/application/workouts/workout-service";
import type { ProgressPlanSession } from "@/application/workouts/progress-plan";
import type { TrainingSettings } from "@/features/settings/settings";
import {
  ActionButton,
  AppText,
  FeedbackBanner,
  IconButton,
  Screen,
  TextField,
} from "@/design-system/v2.2/primitives";
import { AppMasthead, PhaseBand } from "@/design-system/v2.2/components";
import { useAppTheme } from "@/design-system/use-app-theme";
import { exerciseCatalog } from "@/data/seeds/exercises";
import { buildHistoryAnalytics } from "@/domain/analytics/workout-history";
import {
  exerciseProjection,
  filterProgress,
  progressCycles,
} from "./progress-model";
import { ProgressFilter, ProgressResults } from "./ProgressResults";

export interface HistoryWorkouts {
  listHistory(): Promise<WorkoutHistoryItem[]>;
  listProgressPlan?(): Promise<ProgressPlanSession[]>;
  correctHistory?(input: {
    unit?: LoadUnit;
    workoutId: string;
    exerciseId: string;
    setIndex: number;
    load: string;
    reason: string;
    exerciseIndex?: number;
    expectedLoad?: string;
    requestId?: string;
  }): Promise<void>;
}
const exerciseNames = new Map(
  exerciseCatalog.map((exercise) => [exercise.id, exercise.name]),
);
const exerciseName = (id: string) =>
  exerciseNames.get(id) ?? "Ejercicio no disponible en el catálogo";
const date = (value: string) =>
  new Date(value).toLocaleDateString("es-CL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

export function HistoryReferenceScreen({
  workouts,
  refreshKey = 0,
  settingsStore,
}: {
  workouts: HistoryWorkouts;
  refreshKey?: number;
  settingsStore?: { load(): Promise<TrainingSettings> };
}) {
  const theme = useAppTheme();
  const [unit, setUnit] = useState<LoadUnit>("kg");
  const loadText = (load: string) =>
    load.trim() ? `${displayLoad({ load }, unit)} ${unit}` : "Sin carga";
  const [history, setHistory] = useState<WorkoutHistoryItem[]>([]);
  const [plan, setPlan] = useState<ProgressPlanSession[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [tab, setTab] = useState<"results" | "history">("results");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [cycleFilter, setCycleFilter] = useState("");
  const [exerciseFilter, setExerciseFilter] = useState("");
  const [period, setPeriod] = useState("0");
  const [correction, setCorrection] = useState<{
    workoutId: string;
    exerciseId: string;
    setIndex: number;
    load: string;
    unit: LoadUnit;
    initialLoad: string;
    exerciseIndex: number;
    expectedLoad: string;
    requestId: string;
  } | null>(null);
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let live = true;
    void Promise.all([
      workouts.listHistory(),
      workouts.listProgressPlan?.() ?? Promise.resolve([]),
      settingsStore?.load(),
    ])
      .then(([items, sessions, settings]) => {
        if (live) {
          setHistory(items);
          setPlan(sessions);
          setUnit(settings?.units ?? "kg");
          setNow(Date.now());
          setLoadError("");
        }
      })
      .catch(() => {
        if (live)
          setLoadError(
            "No se pudo cargar el progreso. Tus registros se conservan.",
          );
      })
      .finally(() => {
        if (live) setLoaded(true);
      });
    return () => {
      live = false;
    };
  }, [refreshKey, workouts, settingsStore, retry]);
  const cycles = useMemo(() => progressCycles(plan), [plan]);
  const selectedPlan = useMemo(
    () => plan.filter((item) => !cycleFilter || item.cycleId === cycleFilter),
    [plan, cycleFilter],
  );
  const filteredHistory = useMemo(
    () =>
      filterProgress(
        history,
        plan,
        cycleFilter,
        exerciseFilter,
        Number(period),
        now,
      ),
    [history, plan, cycleFilter, exerciseFilter, period, now],
  );
  const analytics = useMemo(
    () =>
      buildHistoryAnalytics(
        exerciseProjection(filteredHistory, exerciseFilter),
        selectedPlan.length,
        unit,
      ),
    [filteredHistory, exerciseFilter, selectedPlan, unit],
  );
  const selectedSession = filteredHistory.find((item) => item.id === sessionId);
  const exercises = [
    ...new Set(
      filterProgress(
        history,
        plan,
        cycleFilter,
        "",
        Number(period),
        now,
      ).flatMap((item) =>
        item.actual.exercises.map((exercise) => exercise.exerciseId),
      ),
    ),
  ];
  const openSession = (id: string) => {
    setSessionId(id);
    setTab("history");
  };
  const submitCorrection = async () => {
    if (!correction || !workouts.correctHistory || savingRef.current) return;
    if (!reason.trim()) {
      setMessage("El motivo obligatorio debe explicar la corrección.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await workouts.correctHistory({
        ...correction,
        reason,
        ...(correction.load === correction.initialLoad &&
        correction.expectedLoad.trim()
          ? { load: correction.expectedLoad, unit: "kg" }
          : {}),
      });
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
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const changeFilter = (change: () => void) => {
    change();
    setSessionId(null);
    setCorrection(null);
    setMessage("");
  };
  return (
    <Screen testID="history-screen">
      <AppMasthead
        context="Resultados locales de sesiones terminadas"
        title="Progreso"
      />
      <PhaseBand
        label={
          cycleFilter
            ? (cycles.find((item) => item.value === cycleFilter)?.label ??
              "Ciclo")
            : "TODOS LOS RESULTADOS · DATOS LOCALES"
        }
      />
      {!loaded ? (
        <AppText>Cargando progreso…</AppText>
      ) : loadError ? (
        <View style={{ gap: 12 }}>
          <FeedbackBanner tone="danger" message={loadError} />
          <ActionButton onPress={() => setRetry((value) => value + 1)}>
            Reintentar progreso
          </ActionButton>
        </View>
      ) : !history.length ? (
        <View style={{ gap: 12 }}>
          <AppText variant="heading">
            Todavía no hay sesiones terminadas
          </AppText>
          <AppText color="muted">
            Cuando termines un entrenamiento, aquí aparecerán sus detalles y
            tendencias.
          </AppText>
          {plan.length ? (
            <AppText color="muted">
              {plan.length} sesiones en tu plan. Aún no hay resultados
              registrados.
            </AppText>
          ) : null}
        </View>
      ) : (
        <>
          <View
            accessibilityRole="tablist"
            style={{
              flexDirection: "row",
              borderBottomWidth: 1,
              borderColor: theme.border,
            }}
          >
            {(["results", "history"] as const).map((value) => (
              <Pressable
                key={value}
                accessibilityRole="tab"
                accessibilityState={{
                  selected: tab === value,
                  disabled: saving,
                }}
                disabled={saving}
                onPress={() => {
                  setTab(value);
                  setCorrection(null);
                  setMessage("");
                }}
                style={{
                  flex: 1,
                  minHeight: 52,
                  paddingVertical: 12,
                  borderBottomWidth: tab === value ? 4 : 0,
                  borderColor: theme.text,
                  alignItems: "center",
                }}
              >
                <AppText variant="bodyStrong">
                  {value === "results" ? "Resultados" : "Historial"}
                </AppText>
              </Pressable>
            ))}
          </View>
          {!correction ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              <ProgressFilter
                label="Ciclo"
                value={cycleFilter}
                options={[{ value: "", label: "Todos los ciclos" }, ...cycles]}
                onChange={(value) =>
                  changeFilter(() => {
                    setCycleFilter(value);
                    setExerciseFilter("");
                  })
                }
              />
              <ProgressFilter
                label="Período"
                value={period}
                options={[
                  { value: "0", label: "Todo el historial" },
                  { value: "30", label: "Últimos 30 días" },
                  { value: "90", label: "Últimos 90 días" },
                ]}
                onChange={(value) =>
                  changeFilter(() => {
                    setPeriod(value);
                    setExerciseFilter("");
                  })
                }
              />
              <ProgressFilter
                label="Ejercicio"
                value={exerciseFilter}
                options={[
                  { value: "", label: "Todos los ejercicios" },
                  ...exercises.map((id) => ({
                    value: id,
                    label: exerciseName(id),
                  })),
                ]}
                onChange={(value) =>
                  changeFilter(() => setExerciseFilter(value))
                }
              />
            </View>
          ) : null}
          {tab === "results" ? (
            <ProgressResults
              key={`${cycleFilter}:${exerciseFilter}:${period}`}
              analytics={analytics}
              plan={selectedPlan}
              planKnown={Boolean(workouts.listProgressPlan)}
              unit={unit}
              name={exerciseName}
              onSession={openSession}
            />
          ) : selectedSession ? (
            <View style={{ gap: 20 }}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
              >
                <IconButton
                  accessibilityLabel="Volver al historial"
                  disabled={saving}
                  icon={ArrowLeft}
                  onPress={() => {
                    setSessionId(null);
                    setCorrection(null);
                    setMessage("");
                  }}
                />
                <AppText variant="heading" style={{ flex: 1 }}>
                  {date(selectedSession.completedAt)}
                </AppText>
              </View>
              <AppText color="muted">
                Prescrito: {selectedSession.prescribed.exercises.length}{" "}
                ejercicios · Real: {selectedSession.actual.exercises.length}{" "}
                ejercicios
              </AppText>
              {selectedSession.actual.exercises.map(
                (exercise, exerciseIndex) => {
                  if (exerciseFilter && exercise.exerciseId !== exerciseFilter)
                    return null;
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
                  return (
                    <View
                      key={`${exercise.exerciseId}-${exerciseIndex}`}
                      style={{
                        borderTopWidth: 1,
                        borderColor: theme.border,
                        paddingTop: 16,
                        gap: 8,
                      }}
                    >
                      <AppText variant="heading">
                        {exerciseName(exercise.exerciseId)}
                      </AppText>
                      {!exerciseNames.has(exercise.exerciseId) ? (
                        <AppText color="muted">
                          No se puede sustituir este ejercicio porque tiene
                          trabajo registrado. Conservamos sus series y cargas
                          sin atribuirlas a otro movimiento.
                        </AppText>
                      ) : null}
                      <AppText color="muted">
                        {completed.length} completadas · {omitted.length}{" "}
                        omitidas ·{" "}
                        {exercise.sets.length -
                          completed.length -
                          omitted.length}{" "}
                        pendientes
                      </AppText>
                      {exercise.sets.map((set, setIndex) => (
                        <View
                          key={setIndex}
                          style={{ gap: 8, paddingVertical: 8 }}
                        >
                          <AppText variant="bodyStrong">
                            Serie {setIndex + 1}:{" "}
                            {exercise.recording === "seconds"
                              ? `${set.seconds || "—"} s`
                              : `${loadText(set.load)} × ${set.reps || "—"}${exercise.recording === "reps-per-side" ? " por lado" : ""}`}
                          </AppText>
                          <AppText color="muted" variant="caption">
                            {completed.includes(set)
                              ? "COMPLETADA"
                              : omitted.includes(set)
                                ? "OMITIDA"
                                : "PENDIENTE"}{" "}
                            · RIR/RPE {set.rir || "—"} · técnica {set.technique}{" "}
                            · molestia {set.pain}/10
                          </AppText>
                          {set.notes ? <AppText>{set.notes}</AppText> : null}
                          {set.skipReason ? (
                            <AppText color="muted">{set.skipReason}</AppText>
                          ) : null}
                          {completed.includes(set) &&
                          workouts.correctHistory &&
                          exercise.recording !== "seconds" ? (
                            <ActionButton
                              accessibilityLabel={`Corregir serie ${setIndex + 1} de ${exerciseName(exercise.exerciseId)}`}
                              disabled={saving}
                              tone="secondary"
                              onPress={() => {
                                setCorrection({
                                  workoutId: selectedSession.id,
                                  exerciseId: exercise.exerciseId,
                                  exerciseIndex,
                                  setIndex,
                                  load: displayLoad(set, unit),
                                  initialLoad: displayLoad(set, unit),
                                  unit,
                                  expectedLoad: set.load,
                                  requestId: `edit-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                                });
                                setReason("");
                                setMessage("");
                              }}
                            >
                              Corregir serie {setIndex + 1}
                            </ActionButton>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  );
                },
              )}
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              <AppText variant="heading">Sesiones recientes</AppText>
              {!filteredHistory.length ? (
                <AppText color="muted">
                  No hay resultados para estos filtros.
                </AppText>
              ) : (
                filteredHistory.map((session) => {
                  const scheduled = plan.find(
                    (item) =>
                      item.sessionPlanId === session.actual.sessionPlanId,
                  );
                  const cycle = cycles.find(
                    (item) => item.value === scheduled?.cycleId,
                  );
                  return (
                    <Pressable
                      key={session.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Ver sesión del ${date(session.completedAt)}`}
                      onPress={() => openSession(session.id)}
                      style={{
                        minHeight: 76,
                        paddingVertical: 16,
                        borderBottomWidth: 1,
                        borderColor: theme.border,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <AppText variant="bodyStrong">
                          {date(session.completedAt)}
                        </AppText>
                        <AppText color="muted">
                          {cycle?.label ?? "Sesión guardada"}
                          {scheduled
                            ? ` · semana ${scheduled.weekIndex}, día ${scheduled.dayIndex}`
                            : ""}
                        </AppText>
                        <AppText color="muted" variant="caption">
                          {
                            session.actual.exercises.filter(
                              (exercise) =>
                                !exerciseFilter ||
                                exercise.exerciseId === exerciseFilter,
                            ).length
                          }{" "}
                          ejercicios
                          {session.actual.completionMode === "early"
                            ? " · cierre anticipado"
                            : ""}
                        </AppText>
                      </View>
                      <ArrowRight size={22} color={theme.text} />
                    </Pressable>
                  );
                })
              )}
            </View>
          )}
          {correction ? (
            <View
              style={{
                borderTopWidth: 2,
                borderColor: theme.text,
                paddingTop: 16,
                gap: 12,
              }}
            >
              <AppText
                accessibilityRole="header"
                aria-level={2}
                variant="heading"
              >
                Confirmar corrección
              </AppText>
              <AppText variant="bodyStrong">
                {exerciseName(correction.exerciseId)} · serie{" "}
                {correction.setIndex + 1} · carga actual{" "}
                {loadText(correction.expectedLoad)}
              </AppText>
              <AppText color="muted">
                La sesión original se conserva. Se registrará la carga corregida
                y su motivo.
              </AppText>
              <TextField
                accessibilityLabel="Carga corregida"
                keyboardType="decimal-pad"
                label={`Carga corregida (${correction.unit})`}
                editable={!saving}
                onChangeText={(load) => setCorrection({ ...correction, load })}
                value={correction.load}
              />
              <TextField
                accessibilityLabel="Motivo de la corrección"
                label="Motivo obligatorio"
                editable={!saving}
                onChangeText={setReason}
                value={reason}
              />
              <ActionButton
                accessibilityLabel="Confirmar corrección del historial"
                busy={saving}
                onPress={submitCorrection}
              >
                Confirmar corrección
              </ActionButton>
              <ActionButton
                accessibilityLabel="Cancelar corrección"
                disabled={saving}
                tone="secondary"
                onPress={() => {
                  setCorrection(null);
                  setReason("");
                  setMessage("");
                }}
              >
                Cancelar corrección
              </ActionButton>
            </View>
          ) : null}
          {message ? (
            <FeedbackBanner
              message={message}
              tone={
                message.startsWith("Corrección registrada")
                  ? "success"
                  : "danger"
              }
            />
          ) : null}
          <View
            style={{
              gap: 8,
              borderTopWidth: 1,
              borderColor: theme.border,
              paddingTop: 16,
            }}
          >
            <View style={{ flexDirection: "row", gap: 8 }}>
              <ShieldCheck size={20} color={theme.cautionText} />
              <AppText variant="bodyStrong">Molestias y correcciones</AppText>
            </View>
            <AppText color="muted" variant="caption">
              {analytics.symptomDisclaimer}
            </AppText>
            {tab === "history" && selectedSession
              ? buildHistoryAnalytics(
                  [selectedSession],
                  1,
                  unit,
                ).corrections.map((item, index) => (
                  <AppText key={`${item.sessionId}-${index}`}>
                    •{" "}
                    {item.exerciseId
                      ? `${exerciseName(item.exerciseId)} · `
                      : ""}
                    {item.detail}
                  </AppText>
                ))
              : null}
          </View>
        </>
      )}
    </Screen>
  );
}
