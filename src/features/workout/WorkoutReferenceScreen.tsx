import {
  Check,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
} from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import type { ProgramService } from "@/application/programs/program-service";
import type {
  Technique,
  WorkoutDraft,
  WorkoutService,
} from "@/application/workouts/workout-service";
import {
  ActionButton,
  AppText,
  IconButton,
  Panel,
  Screen,
  Tag,
} from "@/design-system/v2.2/primitives";
import { radii, spacing } from "@/design-system/v2.2/tokens";
import { useAppTheme } from "@/design-system/use-app-theme";
import { playContractedHaptic } from "@/design-system/v2.2/haptics";
import { useMotionPolicy } from "@/design-system/v2.2/use-motion-policy";
import { TrainingField } from "@/design-system/v2.2/components";
import { exerciseCatalog } from "@/data/seeds/exercises";
import { ImageDiagram } from "@/features/exercises/ExerciseMedia";
import {
  exerciseName,
  ReplacementSheet,
} from "@/features/exercises/ReplacementSheet";
import { WorkoutFrame } from "@/features/workout/components/WorkoutFrame";
import { RestDock } from "@/features/workout/components/RestDock";
import { SetEntryRow } from "@/features/workout/components/SetEntryRow";
import {
  defaultSettings,
  type SettingsStore,
  type TrainingSettings,
} from "@/features/settings/settings";
import {
  addTime,
  pauseTimer,
  remainingSeconds,
  resetTimer,
  startTimer,
} from "@/features/timer/rest-timer";

type Props = {
  onClose: () => void;
  programs?: ProgramService;
  workouts?: WorkoutService;
  settingsStore?: SettingsStore;
  requireReadiness?: boolean;
};
const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function loadConfirmedToday(programs: ProgramService) {
  // Expo Router can mount Workout while the focused Today refresh is still settling.
  // Retry the durable active-plan lookup briefly instead of falling back to preview data.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const today = await programs.getToday();
    if (today) return today;
    if (attempt < 9) await wait(50);
  }
  throw new Error("No hay una sesión planificada");
}

const preview: WorkoutDraft = {
  id: "preview",
  safetyModifications: [],
  exercises: [
    {
      exerciseId: "barbell-bench-press",
      originalExerciseId: "barbell-bench-press",
      requirement: "EXACT",
      sets: [
        {
          load: "20",
          reps: "10",
          rir: "3",
          technique: "Limpia",
          pain: 0,
          notes: "",
          completed: false,
          skipped: false,
          disposition: "PENDING",
        },
        {
          load: "20",
          reps: "10",
          rir: "3",
          technique: "Limpia",
          pain: 0,
          notes: "",
          completed: false,
          skipped: false,
          disposition: "PENDING",
        },
        {
          load: "20",
          reps: "10",
          rir: "3",
          technique: "Limpia",
          pain: 0,
          notes: "",
          completed: false,
          skipped: false,
          disposition: "PENDING",
        },
      ],
    },
  ],
};

export function WorkoutReferenceScreen({
  onClose,
  programs,
  workouts,
  settingsStore,
  requireReadiness = false,
}: Props) {
  const theme = useAppTheme();
  const { reducedMotion } = useMotionPolicy();
  const [draft, setDraft] = useState<WorkoutDraft | null>(
    workouts ? null : preview,
  );
  const [error, setError] = useState("");
  const [replacing, setReplacing] = useState(false);
  const [showingGuidance, setShowingGuidance] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [skipSetIndex, setSkipSetIndex] = useState<number | null>(null);
  const [skipReason, setSkipReason] = useState("");
  const [skipError, setSkipError] = useState("");
  const [savingOmission, setSavingOmission] = useState(false);
  const omissionLock = useRef(false);
  const [now, setNow] = useState(0);
  // A restored native route must explicitly transition to its persisted index
  // so the scroll reset runs; otherwise Android can reopen at the pre-kill
  // offset and make the active set fields unreachable to directional tooling.
  const [exerciseIndex, setExerciseIndex] = useState(workouts ? -1 : 0);
  const scrollRef = useRef<ScrollView>(null);
  const latestDraftRef = useRef<WorkoutDraft | null>(draft);
  useEffect(() => {
    latestDraftRef.current = draft;
  }, [draft]);
  useEffect(() => {
    if (!workouts) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" || !latestDraftRef.current) return;
      try {
        workouts.saveDraftSnapshotBeforeProcessStop(latestDraftRef.current);
      } catch {
        setError("No se pudieron guardar los cambios");
      }
    });
    return () => subscription.remove();
  }, [workouts]);
  const [settings, setSettings] = useState<TrainingSettings>(defaultSettings);
  useEffect(() => {
    if (settingsStore) void settingsStore.load().then(setSettings);
  }, [settingsStore]);
  useEffect(() => {
    if (!workouts || !programs) return;
    void loadConfirmedToday(programs)
      .then((today) => {
        return workouts.startOrResume(requireReadiness ? today : today.session);
      })
      .then((restored) => {
        setExerciseIndex(restored.activeExerciseIndex ?? 0);
        setDraft(restored);
      })
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "No se pudo abrir la sesión",
        ),
      );
  }, [programs, requireReadiness, workouts]);
  useEffect(() => {
    if (!draft || !workouts || savingOmission) return;
    const timer = setTimeout(
      () =>
        void workouts
          .saveDraftSnapshot(latestDraftRef.current ?? draft)
          .catch(() => setError("No se pudieron guardar los cambios")),
      250,
    );
    return () => clearTimeout(timer);
  }, [draft, workouts, savingOmission]);
  useEffect(() => {
    if (!draft?.timer?.runningSince) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [draft?.timer?.runningSince]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ animated: !reducedMotion, y: 0 });
  }, [exerciseIndex, reducedMotion]);
  if (error)
    return (
      <Screen>
        <Panel>
          <AppText variant="heading">No se pudo abrir el entrenamiento</AppText>
          <AppText color="muted">{error}</AppText>
          <ActionButton onPress={onClose}>Volver</ActionButton>
        </Panel>
      </Screen>
    );
  if (!draft)
    return (
      <Screen>
        <ActivityIndicator accessibilityLabel="Cargando entrenamiento" />
      </Screen>
    );
  const exercise = draft.exercises[exerciseIndex];
  if (!exercise)
    return (
      <Screen>
        <AppText>No hay ejercicios en esta sesión.</AppText>
      </Screen>
    );
  const change = (
    index: number,
    field: "load" | "reps" | "rir" | "notes",
    value: string,
  ) => {
      const next = {
          ...draft,
          exercises: draft.exercises.map((item, itemIndex) =>
            itemIndex !== exerciseIndex
              ? item
              : {
                  ...item,
                  sets: item.sets.map((set, setIndex) =>
                    setIndex === index
                      ? {
                          ...set,
                          [field]:
                            field === "notes"
                              ? value
                              : value.replace(/[^0-9,.]/g, ""),
                        }
                      : set,
                  ),
                },
          ),
        };
      latestDraftRef.current = next;
      // Text entry must reach durable storage before the OS can terminate the
      // process; the general UI debounce is only a fallback for other edits.
      if (next && workouts) {
        try {
          if (!workouts.saveDraftSnapshotBeforeProcessStop(next)) {
            void workouts
              .saveDraftSnapshot(next)
              .catch(() => setError("No se pudieron guardar los cambios"));
          }
        } catch {
          setError("No se pudieron guardar los cambios");
        }
      }
      setDraft(next);
    };
  const setMeta = (
    index: number,
    patch: Partial<(typeof exercise.sets)[number]>,
  ) =>
    setDraft((current) => {
      if (!current) return null;
      return workouts
        ? workouts.recordSet(current, exerciseIndex, index, patch)
        : {
            ...current,
            exercises: current.exercises.map((item, itemIndex) =>
              itemIndex !== exerciseIndex
                ? item
                : {
                    ...item,
                    sets: item.sets.map((set, setIndex) =>
                      setIndex === index ? { ...set, ...patch } : set,
                    ),
                  },
            ),
          };
    });
  const addSet = () =>
    setDraft(
      (current) =>
        current && {
          ...current,
          exercises: current.exercises.map((item, index) =>
            index !== exerciseIndex
              ? item
              : {
                  ...item,
                  sets: [
                    ...item.sets,
                    {
                      ...(item.sets.at(-1) ?? preview.exercises[0]!.sets[0]!),
                      notes: "",
                      completed: false,
                      skipped: false,
                      disposition: "PENDING",
                      skipReason: undefined,
                    },
                  ],
                },
          ),
        },
    );
  const removeSet = () =>
    setDraft(
      (current) =>
        current && {
          ...current,
          exercises: current.exercises.map((item, index) =>
            index !== exerciseIndex || item.sets.length === 1
              ? item
              : { ...item, sets: item.sets.slice(0, -1) },
          ),
        },
    );
  const timer = draft.timer ?? resetTimer();
  const seconds = remainingSeconds(timer, now || timer.runningSince || 0);
  const updateTimer = (next: typeof timer) => {
    setNow(next.runningSince ?? 0);
    setDraft((current) => current && { ...current, timer: next });
  };
  const guidance = exerciseCatalog.find(
    (item) => item.id === exercise.exerciseId,
  );
  if (finishing) {
    const sets = draft.exercises.flatMap((exercise) => exercise.sets);
    const completed = sets.filter(
      (set) => set.disposition === "COMPLETED",
    ).length;
    const skipped = sets.filter((set) => set.disposition === "SKIPPED").length;
    const pending = sets.length - completed - skipped;
    return (
      <Screen testID="finish-review">
        <Panel>
          <Tag>REVISIÓN FINAL</Tag>
          <AppText accessibilityRole="header" aria-level={1} variant="title">
            Terminar entrenamiento
          </AppText>
          <AppText>
            {completed} completada{completed === 1 ? "" : "s"} · {skipped}{" "}
            omitida{skipped === 1 ? "" : "s"} · {pending} pendiente
            {pending === 1 ? "" : "s"}
          </AppText>
          <AppText color="muted">
            Confirma para guardar una sesión inmutable en este dispositivo.
          </AppText>
          <ActionButton
            accessibilityLabel="Confirmar fin de entrenamiento"
            onPress={() => {
              if (!workouts) {
                onClose();
                return;
              }
              void workouts
                .complete(draft)
                .then(onClose)
                .catch(() => setError("No se pudo terminar la sesión"));
            }}
          >
            Confirmar y terminar
          </ActionButton>
          <ActionButton onPress={() => setFinishing(false)} tone="secondary">
            Seguir entrenando
          </ActionButton>
        </Panel>
      </Screen>
    );
  }
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.flex}
      testID="keyboard-avoiding-workout"
    >
      <View style={styles.flex} pointerEvents={savingOmission ? "none" : "auto"}>
      <Screen scrollRef={scrollRef} testID="workout-screen">
        <WorkoutFrame
          commands={
            <>
              <View style={styles.between}>
                <ActionButton
                  accessibilityLabel="Ejercicio anterior"
                  disabled={exerciseIndex === 0}
                  onPress={() =>
                    setExerciseIndex((index) => {
                      setSkipSetIndex(null);
                      setSkipReason("");
                      setSkipError("");
                      const next = Math.max(0, index - 1);
                      setDraft(
                        (current) =>
                          current && { ...current, activeExerciseIndex: next },
                      );
                      return next;
                    })
                  }
                  tone="secondary"
                >
                  Anterior
                </ActionButton>
                <ActionButton
                  accessibilityLabel="Siguiente ejercicio"
                  disabled={exerciseIndex === draft.exercises.length - 1}
                  onPress={() =>
                    setExerciseIndex((index) => {
                      setSkipSetIndex(null);
                      setSkipReason("");
                      setSkipError("");
                      const next = Math.min(
                        draft.exercises.length - 1,
                        index + 1,
                      );
                      setDraft(
                        (current) =>
                          current && { ...current, activeExerciseIndex: next },
                      );
                      return next;
                    })
                  }
                  tone="secondary"
                >
                  Siguiente
                </ActionButton>
              </View>
              <ActionButton
                accessibilityLabel="Revisar y terminar entrenamiento"
                disabled={
                  workouts
                    ? !workouts.canComplete(draft)
                    : !draft.exercises.every((item) =>
                        item.sets.every((set) => set.disposition !== "PENDING"),
                      )
                }
                icon={Check}
                onPress={() => setFinishing(true)}
              >
                Revisar y terminar
              </ActionButton>
              <AppText color="muted" variant="caption">
                Completa u omite explícitamente cada serie. Tus datos permanecen
                en este dispositivo.
              </AppText>
            </>
          }
          current={exerciseIndex + 1}
          exerciseName={guidance?.name ?? "Ejercicio no disponible en el catálogo"}
          nextName={
            draft.exercises[exerciseIndex + 1]
              ? exerciseName(draft.exercises[exerciseIndex + 1]!.exerciseId)
              : undefined
          }
          onClose={onClose}
          onShowGuidance={() => setShowingGuidance(true)}
          total={draft.exercises.length}
        >
          {!guidance ? (
            <Panel>
              <AppText accessibilityLiveRegion="polite" color="danger">
                No se puede sustituir una referencia desconocida en una sesión iniciada.
                Se conservan las series y cargas con su referencia original.
              </AppText>
              <AppText color="muted">
                Este ejercicio no pertenece al catálogo local. No lo realices sin instrucciones.
              </AppText>
            </Panel>
          ) : null}
          {showingGuidance ? (
            <Panel>
              <Tag>GUÍA LOCAL · SIN RED</Tag>
              <AppText
                accessibilityRole="header"
                aria-level={2}
                variant="heading"
              >
                {guidance?.name ?? "Guía no disponible"}
              </AppText>
              {guidance ? (
                <>
                  <ImageDiagram exerciseId={guidance.id} />
                  {guidance.instructions.map((instruction) => (
                    <AppText key={instruction}>• {instruction}</AppText>
                  ))}
                </>
              ) : (
                <AppText accessibilityLiveRegion="assertive" color="danger">
                  Este ejercicio no pertenece al catálogo local. No lo realices
                  sin instrucciones.
                </AppText>
              )}
              <ActionButton
                accessibilityLabel="Cerrar guía del ejercicio"
                onPress={() => setShowingGuidance(false)}
                tone="secondary"
              >
                Volver al entrenamiento
              </ActionButton>
            </Panel>
          ) : null}
          {guidance && replacing ? (
            <ReplacementSheet
              exerciseId={exercise.exerciseId}
              requirement={exercise.requirement}
              onCancel={() => setReplacing(false)}
              onConfirm={(selected, reason) => {
                setDraft((current) => {
                  if (!current) return null;
                  return workouts
                    ? workouts.replaceExercise(
                        current,
                        exerciseIndex,
                        selected.id,
                        reason,
                      )
                    : {
                        ...current,
                        exercises: current.exercises.map((item, index) =>
                          index !== exerciseIndex
                            ? item
                            : {
                                ...item,
                                exerciseId: selected.id,
                                replacement: {
                                  fromExerciseId: item.exerciseId,
                                  reason,
                                },
                              },
                        ),
                      };
                });
                setReplacing(false);
                setShowingGuidance(false);
              }}
              settings={settings}
            />
          ) : guidance ? (
            <ActionButton
              accessibilityLabel="Reemplazar ejercicio"
              onPress={() => setReplacing(true)}
              tone="secondary"
            >
              Reemplazar ejercicio
            </ActionButton>
          ) : null}
          {draft.safetyModifications.at(-1) ? (
            <View accessibilityLiveRegion="polite">
              <Panel>
                <Tag>MODIFICACIÓN DE SEGURIDAD</Tag>
                <AppText variant="bodyStrong">
                  Detén la serie y ajusta carga, rango o ejercicio una vez.
                </AppText>
                <AppText color="muted">
                  {draft.safetyModifications.at(-1)?.explanation}
                </AppText>
              </Panel>
            </View>
          ) : null}
          <Panel>
            <Tag>OBJETIVOS PREFILLADOS</Tag>
            <AppText color="muted">
              Edita carga, repeticiones y RIR. Los cambios quedan guardados sin
              conexión.
            </AppText>
          </Panel>
          <RestDock>
            <View style={styles.between}>
              <View>
                <Tag>DESCANSO</Tag>
                <AppText
                  accessibilityLabel={`Temporizador ${seconds} segundos`}
                  variant="title"
                >
                  {String(Math.floor(seconds / 60)).padStart(2, "0")}:
                  {String(seconds % 60).padStart(2, "0")}
                </AppText>
              </View>
              <View style={styles.commands}>
                {timer.runningSince === null ? (
                  <IconButton
                    accessibilityLabel="Iniciar temporizador"
                    icon={Play}
                    onPress={() =>
                      updateTimer(startTimer(seconds || 90, Date.now()))
                    }
                  />
                ) : (
                  <IconButton
                    accessibilityLabel="Pausar temporizador"
                    icon={Pause}
                    onPress={() => updateTimer(pauseTimer(timer, Date.now()))}
                  />
                )}
                <IconButton
                  accessibilityLabel="Añadir 30 segundos"
                  icon={Plus}
                  onPress={() => updateTimer(addTime(timer, 30, Date.now()))}
                />
                <IconButton
                  accessibilityLabel="Reiniciar temporizador"
                  icon={RotateCcw}
                  onPress={() => updateTimer(resetTimer())}
                />
              </View>
            </View>
            <View style={styles.commands}>
              {[60, 90, 120].map((preset) => (
                <Pressable
                  accessibilityLabel={`Descanso ${preset} segundos`}
                  key={preset}
                  onPress={() => updateTimer(startTimer(preset, Date.now()))}
                  style={[styles.preset, { borderColor: theme.border }]}
                >
                  <AppText>{preset}s</AppText>
                </Pressable>
              ))}
            </View>
          </RestDock>
          <View style={styles.between}>
            <AppText
              accessibilityRole="header"
              aria-level={2}
              variant="heading"
            >
              Series
            </AppText>
            <View style={styles.commands}>
              <IconButton
                accessibilityLabel="Quitar última serie"
                icon={Minus}
                onPress={removeSet}
              />
              <IconButton
                accessibilityLabel="Añadir serie"
                icon={Plus}
                onPress={addSet}
              />
            </View>
          </View>
          {exercise.sets.map((set, index) => (
            <SetEntryRow key={index}>
              <AppText variant="bodyStrong">Serie {index + 1}</AppText>
              <View style={styles.fields}>
                {(["load", "reps", "rir"] as const).map((field) => (
                  <SetField
                    key={field}
                    label={`${field === "load" ? "Carga" : field === "reps" ? "Repeticiones" : "RIR"} de la serie ${index + 1}`}
                    visibleLabel={
                      field === "load"
                        ? "Carga"
                        : field === "reps"
                          ? "Reps"
                          : "RIR"
                    }
                    value={set[field]}
                    onChangeText={(value) => change(index, field, value)}
                  />
                ))}
              </View>
              <View
                accessibilityRole="radiogroup"
                style={[
                  styles.segmented,
                  { backgroundColor: theme.surfaceMuted },
                ]}
              >
                {(["Limpia", "Regular", "Mala"] as Technique[]).map(
                  (option) => (
                    <Pressable
                      accessibilityLabel={`${option}, serie ${index + 1}`}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: set.technique === option }}
                      aria-checked={set.technique === option}
                      key={option}
                      onPress={() => {
                        setMeta(index, { technique: option });
                      }}
                      style={styles.segment}
                    >
                      <AppText
                        color={set.technique === option ? "accent" : "muted"}
                        variant="label"
                      >
                        {option}
                      </AppText>
                    </Pressable>
                  ),
                )}
              </View>
              <View style={styles.between}>
                <AppText>Molestia: {set.pain}/10</AppText>
                <View style={styles.commands}>
                  <IconButton
                    accessibilityLabel={`Disminuir molestia de la serie ${index + 1}`}
                    icon={Minus}
                    onPress={() =>
                      setMeta(index, { pain: Math.max(0, set.pain - 1) })
                    }
                  />
                  <IconButton
                    accessibilityLabel={`Aumentar molestia de la serie ${index + 1}`}
                    icon={Plus}
                    onPress={() =>
                      setMeta(index, { pain: Math.min(10, set.pain + 1) })
                    }
                  />
                </View>
              </View>
              <TextInput
                accessibilityLabel={`Notas de la serie ${index + 1}`}
                multiline
                onChangeText={(value) => change(index, "notes", value)}
                placeholder="Notas opcionales"
                placeholderTextColor={theme.textMuted}
                style={[
                  styles.notes,
                  { borderColor: theme.border, color: theme.text },
                ]}
                value={set.notes}
              />
              <View style={styles.commands}>
                <ActionButton
                  accessibilityLabel={`Completar serie ${index + 1}`}
                  disabled={set.pain >= 5}
                  onPress={() => {
                    setDraft(
                      (current) =>
                        current &&
                        (workouts
                          ? workouts.completeSet(current, exerciseIndex, index)
                          : {
                              ...current,
                              exercises: current.exercises.map(
                                (item, itemIndex) =>
                                  itemIndex !== exerciseIndex
                                    ? item
                                    : {
                                        ...item,
                                        sets: item.sets.map(
                                          (candidate, setIndex) =>
                                            setIndex === index
                                              ? {
                                                  ...candidate,
                                                  completed: true,
                                                  skipped: false,
                                                  disposition: "COMPLETED",
                                                  skipReason: undefined,
                                                }
                                              : candidate,
                                        ),
                                      },
                              ),
                            }),
                    );
                    void playContractedHaptic("setCompleted");
                  }}
                  tone={
                    set.disposition === "COMPLETED" ? "primary" : "secondary"
                  }
                >
                  Completar
                </ActionButton>
                <ActionButton
                  accessibilityLabel={`Omitir serie ${index + 1}`}
                  disabled={set.completed || savingOmission}
                  onPress={() => {
                    const initialReason = set.skipReason ?? "Omitida por el usuario";
                    setSkipSetIndex(index);
                    setSkipReason(initialReason);
                    setSkipError("");
                  }}
                  tone={set.disposition === "SKIPPED" ? "primary" : "secondary"}
                >
                  Omitir
                </ActionButton>
                {set.disposition !== "PENDING" ? (
                  <Tag>
                    {set.disposition === "COMPLETED" ? "COMPLETADA" : "OMITIDA"}
                  </Tag>
                ) : null}
              </View>
              {skipSetIndex === index ? (
                <View style={styles.skipReason}>
                  <AppText variant="label">Motivo de omisión</AppText>
                  <TextInput
                    accessibilityLabel={`Motivo para omitir la serie ${index + 1}`}
                    multiline
                    onChangeText={setSkipReason}
                    placeholder="Describe dolor, equipo u otro motivo"
                    placeholderTextColor={theme.textMuted}
                    style={[
                      styles.notes,
                      { borderColor: theme.border, color: theme.text },
                    ]}
                    value={skipReason}
                  />
                  {skipError ? <AppText accessibilityRole="alert">{skipError}</AppText> : null}
                  <View style={styles.commands}>
                    <ActionButton
                      accessibilityLabel={`Confirmar omisión de la serie ${index + 1}`}
                      disabled={savingOmission}
                      onPress={async () => {
                        if (omissionLock.current) return;
                        if (!skipReason.trim()) {
                          setSkipError("Escribe un motivo para omitir la serie.");
                          return;
                        }
                        const current = latestDraftRef.current;
                        if (!current) return;
                        omissionLock.current = true;
                        setSavingOmission(true);
                        setSkipError("");
                        try {
                          const next = workouts
                            ? workouts.skipSet(current, exerciseIndex, index, skipReason)
                            : {
                                ...current,
                                exercises: current.exercises.map((item, itemIndex) =>
                                  itemIndex !== exerciseIndex ? item : {
                                    ...item,
                                    sets: item.sets.map((candidate, setIndex) =>
                                      setIndex !== index ? candidate : {
                                        ...candidate, completed: false, skipped: true,
                                        disposition: "SKIPPED" as const,
                                        skipReason: skipReason.trim(),
                                      }),
                                  }),
                              };
                          latestDraftRef.current = next;
                          if (workouts) await workouts.saveDraftSnapshot(next);
                          setDraft(next);
                          setSkipSetIndex(null);
                          setSkipReason("");
                        } catch {
                          latestDraftRef.current = current;
                          setSkipError("No se pudo guardar la omisión. Inténtalo de nuevo.");
                        } finally {
                          omissionLock.current = false;
                          setSavingOmission(false);
                        }
                      }}
                    >
                      {savingOmission ? "Guardando…" : "Confirmar omisión"}
                    </ActionButton>
                    <ActionButton
                      disabled={savingOmission}
                      onPress={() => {
                        setSkipError("");
                        setSkipSetIndex(null);
                        setSkipReason("");
                      }}
                      tone="secondary"
                    >
                      Cancelar
                    </ActionButton>
                  </View>
                </View>
              ) : null}
            </SetEntryRow>
          ))}
        </WorkoutFrame>
      </Screen>
      </View>
    </KeyboardAvoidingView>
  );
}

function SetField({
  label,
  visibleLabel,
  value,
  onChangeText,
}: {
  label: string;
  visibleLabel: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={styles.flex}>
      <TrainingField
        accessibilityLabel={label}
        label={visibleLabel}
        keyboardType="decimal-pad"
        maxFontSizeMultiplier={1.4}
        onChangeText={onChangeText}
        value={value}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  between: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  commands: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  preset: {
    alignItems: "center",
    borderRadius: radii.control,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
    minWidth: 64,
  },
  field: {
    borderRadius: radii.control,
    borderWidth: 1,
    fontSize: 18,
    minHeight: 52,
    paddingHorizontal: spacing.sm,
  },
  fields: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  flex: { flex: 1 },
  notes: {
    borderRadius: radii.control,
    borderWidth: 1,
    minHeight: 52,
    padding: spacing.md,
  },
  segment: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
  },
  segmented: { borderRadius: radii.control, flexDirection: "row" },
  skipReason: { gap: spacing.sm },
});
