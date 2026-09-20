import { displayLoad, enteredLoad } from "@/application/workouts/load-entry";
import {
  Check,
  ArrowLeft,
  ArrowRight,
  MessageSquare,
  Undo2,
  Minus,
  Plus,
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
  WorkoutHistoryItem,
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
import { palette, radii, spacing } from "@/design-system/v2.2/tokens";
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
import { MiniRestTimer } from "@/features/workout/components/MiniRestTimer";
import { SetEntryRow } from "@/features/workout/components/SetEntryRow";
import {
  defaultSettings,
  type SettingsStore,
  type TrainingSettings,
} from "@/features/settings/settings";
import { resetTimer, restAfterCompletion } from "@/features/timer/rest-timer";

import { deleteLastSet, undoSetDeletion } from "@/application/workouts/set-deletion";
import { previousRecordedSets } from './previous-performance';
import { validRecordedQuantity } from '@/domain/prescriptions/measurement';
import { replaceExerciseDraft, replacementBlocker, type ReplacementContext } from '@/application/workouts/exercise-replacement';
import { planningProfile } from '@/features/settings/settings';
import { savedAlternatives } from '@/features/exercises/saved-alternatives';

type Props = {
  initialExerciseIndex?: number;
  onEntryApplied?: () => void;
  focused?: boolean;
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
  initialExerciseIndex,
  onEntryApplied,
  focused = true,
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
  const [invalidLoads, setInvalidLoads] = useState<Record<string, string>>({});
  const [savingSet, setSavingSet] = useState(false);
  const [savingNavigation, setSavingNavigation] = useState(false);
  const [navigationError, setNavigationError] = useState("");
  const navigationLock = useRef(false);
  const completionLock = useRef(false);
  const [replacing, setReplacing] = useState(false);
  const [savingReplacement, setSavingReplacement] = useState(false);
  const replacementLock = useRef(false);
  const [cycleType, setCycleType] = useState<ReplacementContext['type']>('reentry');
  const [replacementError, setReplacementError] = useState('');
  const [showingGuidance, setShowingGuidance] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [savingFinish, setSavingFinish] = useState(false);
  const finishLock = useRef(false);
  const [finishError, setFinishError] = useState('');
  const [noteRows, setNoteRows] = useState<ReadonlySet<string>>(new Set());
  const [history, setHistory] = useState<readonly WorkoutHistoryItem[]>([]);
  const [historyError, setHistoryError] = useState(false);
  useEffect(() => {
    let live = true;
    if (workouts?.listHistory) void workouts.listHistory().then(items => {
      if (live) { setHistory(items); setHistoryError(false); }
    }).catch(() => { if (live) setHistoryError(true); });
    return () => { live = false; };
  }, [workouts]);
  const [skipSetIndex, setSkipSetIndex] = useState<number | null>(null);
  const [skipReason, setSkipReason] = useState("");
  const [skipError, setSkipError] = useState("");
  const [savingOmission, setSavingOmission] = useState(false);
  const omissionLock = useRef(false);
  const [deleting, setDeleting] = useState(false);
  const [deletionError, setDeletionError] = useState("");
  const [savingDeletion, setSavingDeletion] = useState(false);
  const deletionLock = useRef(false);
  const [now, setNow] = useState(() => Date.now());
  // A restored native route must explicitly transition to its persisted index
  // so the scroll reset runs; otherwise Android can reopen at the pre-kill
  // offset and make the active set fields unreachable to directional tooling.
  const [exerciseIndex, setExerciseIndex] = useState(workouts ? -1 : 0);
  const scrollRef = useRef<ScrollView>(null);
  const latestDraftRef = useRef<WorkoutDraft | null>(draft);
  const entryAppliedRef = useRef(onEntryApplied);
  useEffect(() => { entryAppliedRef.current = onEntryApplied; }, [onEntryApplied]);
  useEffect(() => {
    latestDraftRef.current = draft;
  }, [draft]);
  useEffect(() => {
    if (!workouts || !focused) return;
    if (latestDraftRef.current) {
      setNow(Date.now());
      void workouts.saveDraftSnapshot(latestDraftRef.current)
        .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "No se pudo comprobar la preparación guardada."));
    }
    const subscription = AppState.addEventListener("change", (state) => {
      if (!latestDraftRef.current) return;
      if (state === "active") {
        setNow(Date.now());
        // An unchanged save verifies persisted readiness and restrictions too.
        void workouts.saveDraftSnapshot(latestDraftRef.current)
          .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "No se pudo comprobar la preparación guardada. Vuelve a Hoy para revisarla."));
        return;
      }
      try {
        if (!workouts.saveDraftSnapshotBeforeProcessStop(latestDraftRef.current)) {
          void workouts.saveDraftSnapshot(latestDraftRef.current)
            .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "No se pudieron guardar los cambios"));
        }
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "No se pudieron guardar los cambios");
      }
    });
    return () => subscription.remove();
  }, [workouts, focused]);
  const [settings, setSettings] = useState<TrainingSettings>(defaultSettings);
  useEffect(() => {
    if (settingsStore) void settingsStore.load().then(setSettings);
  }, [settingsStore]);
  useEffect(() => {
    if (!workouts || !programs) return;
    // Clearing a consumed route parameter must not reload an older position
    // while the user is already navigating the live draft.
    if (latestDraftRef.current && initialExerciseIndex === undefined) return;
    let live = true;
    void loadConfirmedToday(programs)
      .then((today) => {
        setCycleType(today.cycleType ?? 'reentry');
        return workouts.startOrResume(requireReadiness ? today : today.session);
      })
      .then(async (restored) => {
        if (!live) return;
        const index = initialExerciseIndex;
        const selected = index !== undefined && Number.isInteger(index) && index >= 0 && index < restored.exercises.length
          ? { ...restored, activeExerciseIndex: index, activeSetIndex: 0 } : restored;
        if (selected !== restored) await workouts.saveDraftSnapshot(selected);
        if (!live) return;
        latestDraftRef.current = selected;
        setExerciseIndex(selected.activeExerciseIndex ?? 0);
        setDraft(selected);
        if (index !== undefined) entryAppliedRef.current?.();
      })
      .catch((reason: unknown) => {
        if (live) setError(
          reason instanceof Error
            ? reason.message
            : "No se pudo abrir la sesión",
        );
      });
    return () => { live = false; };
  }, [programs, requireReadiness, workouts, initialExerciseIndex]);
  useEffect(() => {
    if (!draft || !workouts || savingReplacement || savingOmission || savingDeletion || savingSet || savingNavigation || navigationError || error) return;
    const timer = setTimeout(
      () =>
        void workouts
          .saveDraftSnapshot(latestDraftRef.current ?? draft)
          .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "No se pudieron guardar los cambios")),
      250,
    );
    return () => clearTimeout(timer);
  }, [draft, workouts, savingReplacement, savingOmission, savingDeletion, savingSet, savingNavigation, navigationError, error]);
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
  const closeWorkout = async () => {
    if (navigationLock.current || completionLock.current || omissionLock.current || deletionLock.current || replacementLock.current) return;
    navigationLock.current = true;
    setSavingNavigation(true);
    setNavigationError("");
    try {
      if (workouts && latestDraftRef.current) await workouts.saveDraftSnapshot(latestDraftRef.current);
      onClose();
    } catch {
      navigationLock.current = false;
      setSavingNavigation(false);
      setNavigationError("No se pudo guardar antes de salir. Conservamos tus cambios; vuelve a intentar cerrar.");
    }
  };
  const change = (
    index: number,
    field: "load" | "reps" | "seconds" | "rir" | "notes",
    value: string,
  ) => {
      const current = latestDraftRef.current;
      if (!current) return;
      let loadPatch = {};
      if (field === "load") {
        try { loadPatch = enteredLoad(value, settings.units); setInvalidLoads(current => { const next = { ...current }; delete next[`${exerciseIndex}:${index}`]; return next; }); }
        catch { setInvalidLoads(current => ({ ...current, [`${exerciseIndex}:${index}`]: value })); return; }
      }
      const next = {
          ...current,
          exercises: current.exercises.map((item, itemIndex) =>
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
                          ...loadPatch,
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
              .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "No se pudieron guardar los cambios"));
          }
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : "No se pudieron guardar los cambios");
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
  const removeSet = () => {
    setDeletionError("");
    setSkipSetIndex(null);
    setDeleting(true);
  };
  const persistDeletion = async (undoId?: number) => {
    if (deletionLock.current) return;
    const current = latestDraftRef.current;
    if (!current) return;
    deletionLock.current = true;
    setSavingDeletion(true);
    setDeletionError("");
    try {
      const next = undoId === undefined
        ? deleteLastSet(current, exerciseIndex)
        : undoSetDeletion(current, undoId);
      // All controls are locked until persistence acknowledges this transaction.
      latestDraftRef.current = next;
      if (workouts) await workouts.saveDraftSnapshot(next);
      setDraft(next);
      setDeleting(false);
    } catch (reason) {
      latestDraftRef.current = current;
      setDeletionError(reason instanceof Error && !workouts ? reason.message : "No se pudo guardar el cambio. Tu trabajo sigue disponible; inténtalo de nuevo.");
    } finally {
      deletionLock.current = false;
      setSavingDeletion(false);
    }
  };
  const lastDeletion = draft.setDeletions?.filter((item) => !item.restored).at(-1);
  const activeSet = Math.min(draft.activeSetIndex ?? 0, Math.max(0, exercise.sets.length - 1));
  const previousSets = previousRecordedSets(history, exercise.exerciseId, exercise.recording);
  const timed = exercise.recording === 'seconds';
  const perSide = exercise.recording === 'reps-per-side';
  const showLoad = !exercise.recording || exercise.recording === 'load-reps'
    || (perSide && exercise.exerciseId === 'pallof-press') || exercise.sets.some(set => set.load.trim() !== '');
  const quantityFields = timed ? ['seconds'] as const : showLoad ? ['load', 'reps'] as const : ['reps'] as const;
  const selectSet = (index: number) => {
    if (savingSet || savingOmission || savingDeletion || savingNavigation) return;
    const current = latestDraftRef.current;
    if (!current) return;
    if ((current.activeSetIndex ?? 0) === index) return;
    const next = { ...current, activeSetIndex: index };
    latestDraftRef.current = next;
    setDraft(next);
  };
  const navigateExercise = async (delta: number) => {
    const current = latestDraftRef.current;
    if (!current || navigationLock.current || completionLock.current || omissionLock.current || deletionLock.current || replacementLock.current) return;
    const index = Math.max(0, Math.min(current.exercises.length - 1, exerciseIndex + delta));
    const next = { ...current, activeExerciseIndex: index, activeSetIndex: 0 };
    navigationLock.current = true;
    setSavingNavigation(true);
    setNavigationError('');
    try {
      await workouts?.saveDraftSnapshot(next);
      latestDraftRef.current = next;
      setSkipSetIndex(null); setSkipReason(''); setSkipError('');
      setDraft(next); setExerciseIndex(index);
    } catch {
      setNavigationError('No se pudo guardar el cambio de ejercicio. Se conserva tu posición; inténtalo de nuevo.');
    } finally {
      navigationLock.current = false;
      setSavingNavigation(false);
    }
  };
  const completeSetAt = async (index: number, undo = false) => {
    if (completionLock.current) return;
    const current = latestDraftRef.current;
    if (!current) return;
    completionLock.current = true;
    setSavingSet(true);
    try {
      let next = workouts && !undo
        ? await workouts.completeSetAndSave(current, exerciseIndex, index)
        : { ...current, exercises: current.exercises.map((item, itemIndex) => itemIndex !== exerciseIndex ? item : {
          ...item, sets: item.sets.map((candidate, setIndex) => setIndex !== index ? candidate : {
            ...candidate, completed: !undo, skipped: false, disposition: undo ? 'PENDING' as const : 'COMPLETED' as const, skipReason: undefined,
          }),
        }) };
      if (!workouts && !undo && current.exercises[exerciseIndex]?.sets[index]?.disposition !== 'COMPLETED') next = restAfterCompletion(next, Date.now());
      if (undo && workouts) await workouts.saveDraftSnapshot(next);
      latestDraftRef.current = next;
      setNow(Date.now());
      setDraft(next);
      if (!undo) void playContractedHaptic('setCompleted');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar la serie. Tu trabajo guardado se conserva.');
    } finally { completionLock.current = false; setSavingSet(false); }
  };
  if (deleting) {
    const last = exercise.sets.at(-1)!;
    return <Screen><Panel>
      <AppText accessibilityRole="header" aria-level={1} variant="title">¿Eliminar esta serie?</AppText>
      <AppText>{exerciseName(exercise.exerciseId)} · Serie {exercise.sets.length}</AppText>
      <AppText>{timed ? `${last.seconds} s` : `${displayLoad(last, settings.units) || "Sin carga"} ${last.load ? settings.units : ""} × ${last.reps}${perSide ? ' por lado' : ''}`} · {last.disposition === "COMPLETED" ? "Completada" : last.disposition === "SKIPPED" ? "Omitida" : "Pendiente"}</AppText>
      {last.notes ? <AppText>{last.notes}</AppText> : null}
      {last.skipReason ? <AppText>{last.skipReason}</AppText> : null}
      <AppText>Podrás deshacer la eliminación, incluso al volver a abrir este entrenamiento.</AppText>
      {exercise.sets.length === 1 ? <AppText>Conserva al menos una serie. Puedes omitirla con un motivo.</AppText> : null}
      {deletionError ? <AppText accessibilityRole="alert">{deletionError}</AppText> : null}
      <ActionButton accessibilityLabel="Confirmar eliminación" disabled={savingDeletion || exercise.sets.length === 1} onPress={() => persistDeletion()}>{savingDeletion ? "Guardando…" : "Eliminar serie"}</ActionButton>
      <ActionButton accessibilityLabel="Cancelar eliminación" disabled={savingDeletion} tone="secondary" onPress={() => setDeleting(false)}>Cancelar</ActionButton>
    </Panel></Screen>;
  }
  const timer = draft.timer ?? resetTimer();
  const updateTimer = (next: typeof timer) => {
    const current = latestDraftRef.current;
    if (!current) return;
    const updated = { ...current, timer: next, ...([60, 90, 120].includes(next.durationSeconds) ? { restSeconds: next.durationSeconds } : {}) };
    latestDraftRef.current = updated;
    setNow(Date.now());
    setDraft(updated);
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
            {pending ? 'Las series pendientes se conservarán como pendientes, sin marcarlas completadas ni omitidas.' : 'Confirma para guardar una sesión inmutable en este dispositivo.'}
          </AppText>
          {finishError ? <AppText accessibilityRole="alert" color="danger">{finishError}</AppText> : null}
          <ActionButton
            accessibilityLabel="Confirmar fin de entrenamiento"
            busy={savingFinish}
            onPress={async () => {
              if (finishLock.current) return;
              finishLock.current = true;
              setSavingFinish(true);
              setFinishError('');
              try {
                if (workouts) {
                  const current = latestDraftRef.current ?? draft;
                  await workouts.saveDraftSnapshot(current);
                  await workouts.complete(current, { finishEarly: pending > 0 });
                }
                onClose();
              } catch {
                setFinishError('No se pudo terminar la sesión. Tu registro sigue disponible; vuelve a intentar o sigue entrenando.');
              } finally { finishLock.current = false; setSavingFinish(false); }
            }}
          >
            Confirmar y terminar
          </ActionButton>
          <ActionButton disabled={savingFinish} onPress={() => setFinishing(false)} tone="secondary">
            Seguir entrenando
          </ActionButton>
        </Panel>
      </Screen>
    );
  }
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.flex}
      testID="keyboard-avoiding-workout"
    >
      <View collapsable={false} style={styles.flex} pointerEvents={savingReplacement || savingOmission || savingDeletion || savingNavigation || savingSet ? "none" : "auto"}>
      <View style={styles.flex}>
        <View collapsable={false} style={{ display: navigationError || savingNavigation ? "flex" : "none" }} testID="workout-navigation-feedback">
        {navigationError ? <AppText accessibilityRole="alert" color="danger">{navigationError}</AppText> : null}
        {savingNavigation ? <AppText accessibilityLiveRegion="polite">Guardando cambios…</AppText> : null}
        </View>
        {lastDeletion ? <Panel>
          <AppText>Serie {lastDeletion.setIndex + 1} eliminada · {exerciseName(lastDeletion.exerciseId)}</AppText>
          <ActionButton accessibilityLabel="Deshacer eliminación" disabled={savingDeletion} onPress={() => persistDeletion(lastDeletion.id)}>{savingDeletion ? "Guardando…" : "Deshacer"}</ActionButton>
          {deletionError ? <AppText accessibilityRole="alert">{deletionError}</AppText> : null}
        </Panel> : null}
        <WorkoutFrame
          scrollRef={scrollRef}
          rest={<MiniRestTimer timer={timer} now={now} onChange={updateTimer} />}
          commands={
              <View style={styles.commands}>
                <IconButton
                  accessibilityLabel="Ejercicio anterior"
                  icon={ArrowLeft}
                  disabled={savingSet || savingNavigation || exerciseIndex === 0}
                  onPress={() => navigateExercise(-1)}
                />
                <IconButton
                  accessibilityLabel="Siguiente ejercicio"
                  icon={ArrowRight}
                  disabled={savingSet || savingNavigation || exerciseIndex === draft.exercises.length - 1}
                  onPress={() => navigateExercise(1)}
                />
              <View style={styles.flex}>
              <ActionButton
                accessibilityLabel="Revisar y terminar entrenamiento"
                disabled={
                  savingSet || savingNavigation || savingOmission || savingDeletion || Object.keys(invalidLoads).length > 0 || (workouts
                    ? !(workouts.canComplete(draft) || workouts.canFinishEarly?.(draft))
                    : !draft.exercises.some(item => item.sets.some(set => set.disposition === 'COMPLETED')))
                }
                icon={Check}
                onPress={() => { setFinishError(''); setFinishing(true); }}
              >
                Terminar
              </ActionButton>
              </View></View>
          }
          current={exerciseIndex + 1}
          exerciseName={guidance?.name ?? "Ejercicio no disponible en el catálogo"}
          nextName={
            draft.exercises[exerciseIndex + 1]
              ? exerciseName(draft.exercises[exerciseIndex + 1]!.exerciseId)
              : undefined
          }
          busy={savingReplacement || savingSet || savingOmission || savingDeletion || savingNavigation}
          onClose={() => void closeWorkout()}
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
          {replacementError ? <AppText accessibilityRole="alert">{replacementError}</AppText> : null}
          {guidance && replacing ? (
            <ReplacementSheet
              exerciseId={exercise.exerciseId}
              requirement={exercise.requirement}
              onCancel={() => setReplacing(false)}
              blocked={replacementBlocker(draft, exerciseIndex)}
              busy={savingReplacement}
              history={history}
              context={{ type: cycleType, profile: planningProfile(settings) }}
              onConfirm={async (selected, reason) => {
                if (replacementLock.current) return;
                replacementLock.current = true;
                setSavingReplacement(true);
                const current = latestDraftRef.current ?? draft;
                try {
                  const fresh = settingsStore ? await settingsStore.load() : settings;
                  const recent = workouts?.listHistory ? await workouts.listHistory() : history;
                  if (!savedAlternatives(exercise.exerciseId, exercise.requirement, reason, fresh, recent).some(item => item.exercise.id === selected.id)) throw new Error('La alternativa ya no es compatible con tus preferencias. Vuelve a revisar las opciones.');
                  const context = { type: cycleType, profile: planningProfile(fresh) };
                  const next = workouts ? workouts.replaceExercise(current, exerciseIndex, selected.id, reason, context) : replaceExerciseDraft(current, exerciseIndex, selected.id, reason, context);
                  if (workouts) await workouts.saveDraftSnapshot(next);
                  latestDraftRef.current = next;
                  setDraft(next); setSettings(fresh); setHistory(recent);
                  setReplacementError('');
                  setReplacing(false);
                  setShowingGuidance(false);
                } catch (cause) {
                  latestDraftRef.current = current;
                  setReplacementError(cause instanceof Error ? cause.message : 'No se pudo cambiar el ejercicio. El registro se conserva.');
                } finally {
                  replacementLock.current = false;
                  setSavingReplacement(false);
                }
              }}
              settings={settings}
            />
          ) : guidance ? (
            <ActionButton
              accessibilityLabel="Reemplazar ejercicio"
              onPress={async () => {
                try {
                  if (settingsStore) setSettings(await settingsStore.load());
                  if (workouts?.listHistory) setHistory(await workouts.listHistory());
                  setReplacementError('');
                  setReplacing(true);
                } catch { setError("No se pudieron cargar las preferencias. Vuelve a intentar abrir las alternativas."); }
              }}
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
          {Object.keys(invalidLoads).length > 0 ? <AppText accessibilityRole="alert">Escribe una carga válida, sin valores negativos. Tu carga guardada se conserva.</AppText> : null}
          {exercise.sets.map((set, index) => (
            <SetEntryRow key={index}>
              <View style={styles.fields}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Editar serie ${index + 1}`} accessibilityState={{ expanded: activeSet === index }} onPress={() => selectSet(index)} style={{ minWidth: 36, minHeight: 48, justifyContent: 'center' }}>
                  <AppText variant="bodyStrong">{String(index + 1).padStart(2, '0')}</AppText>
                </Pressable>
                {quantityFields.map((field) => (
                  <SetField
                    key={field}
                    label={`${field === 'seconds' ? 'Segundos' : field === "load" ? "Carga" : "Repeticiones"} de la serie ${index + 1}`}
                    visibleLabel={
                      field === "load"
                        ? `Carga (${settings.units})`
                        : field === 'seconds' ? 'Segundos' : perSide ? 'Reps / lado' : "Reps"
                    }
                    value={field === "load" ? invalidLoads[`${exerciseIndex}:${index}`] ?? displayLoad(set, settings.units) : set[field] ?? ''}
                    disabled={savingSet}
                    onChangeText={(value) => change(index, field, value)}
                    onFocus={() => selectSet(index)}
                  />
                ))}
                <View style={{ justifyContent: 'flex-end' }}><IconButton
                  accessibilityLabel={`Completar serie ${index + 1}`} icon={Check}
                  selected={set.disposition === 'COMPLETED'}
                  disabled={set.pain >= 5 || savingSet || Object.keys(invalidLoads).length > 0 || !validRecordedQuantity(exercise.recording, set)}
                  onPress={() => void completeSetAt(index)}
                /></View>
              </View>
              <AppText color="muted" variant="caption">Anterior: {historyError ? 'no disponible' : previousSets[index]
                ? timed ? `${previousSets[index]!.seconds} s`
                  : `${showLoad ? `${displayLoad(previousSets[index]!, settings.units) || 'Sin carga'}${previousSets[index]!.load ? ` ${settings.units}` : ''} × ` : ''}${previousSets[index]!.reps} reps${perSide ? ' / lado' : ''}` : 'sin registro'}</AppText>
              {set.pain > 0 && activeSet !== index ? <AppText accessibilityRole="alert">Molestia registrada: {set.pain}/10</AppText> : null}
              {activeSet === index ? <>
              {set.disposition === 'COMPLETED' ? <IconButton accessibilityLabel={`Deshacer completado de la serie ${index + 1}`} icon={Undo2} disabled={savingSet} onPress={() => void completeSetAt(index, true)} /> : null}
              <SetField disabled={savingSet} label={`RIR de la serie ${index + 1}`} visibleLabel="RIR" value={set.rir} onChangeText={value => change(index, 'rir', value)} />
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
                      accessibilityState={{ checked: set.technique === option, disabled: savingSet }}
                      disabled={savingSet}
                      aria-checked={set.technique === option}
                      key={option}
                      onPress={() => {
                        setMeta(index, { technique: option });
                      }}
                      style={({ pressed }) => [styles.segment, { backgroundColor: set.technique === option ? palette.signal : theme.surface, borderColor: set.technique === option ? palette.ink : theme.textMuted, borderWidth: pressed && !savingSet ? 2 : 1 }]}
                    >
                      <AppText
                        style={{ color: set.technique === option ? palette.ink : theme.text }}
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
              <IconButton accessibilityLabel={`Mostrar notas de la serie ${index + 1}`} icon={MessageSquare} onPress={() => setNoteRows(current => new Set([...current, `${exerciseIndex}:${index}`]))} />
              {noteRows.has(`${exerciseIndex}:${index}`) || set.notes.length > 0 ? <TextInput
                accessibilityLabel={`Notas de la serie ${index + 1}`}
                multiline
                editable={!savingSet}
                onChangeText={(value) => change(index, "notes", value)}
                placeholder="Notas opcionales"
                placeholderTextColor={theme.textMuted}
                style={[
                  styles.notes,
                  { backgroundColor: theme.surface, borderColor: theme.textMuted, color: theme.text },
                ]}
                value={set.notes}
              /> : null}
              </> : null}
              <View style={styles.commands}>
                {activeSet === index ?
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
                </ActionButton> : null}
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
                      { backgroundColor: theme.surface, borderColor: theme.textMuted, color: theme.text },
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
          <RestDock timer={timer} now={now} onChange={updateTimer} autoStart={draft.autoRestEnabled ?? false} onAutoStartChange={autoRestEnabled => {
            const current = latestDraftRef.current;
            if (!current) return;
            const next = { ...current, autoRestEnabled };
            latestDraftRef.current = next;
            setDraft(next);
          }} />
        </WorkoutFrame>
      </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function SetField({
  label,
  visibleLabel,
  value,
  onChangeText,
  onFocus,
  disabled = false,
}: {
  label: string;
  visibleLabel: string;
  value: string;
  onChangeText: (value: string) => void;
  onFocus?: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.flex}>
      <TrainingField
        accessibilityLabel={label}
        label={visibleLabel}
        keyboardType="decimal-pad"
        maxFontSizeMultiplier={1.4}
        onChangeText={onChangeText}
        onFocus={onFocus}
        value={value}
        editable={!disabled}
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
  fields: { alignItems: 'flex-end', flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
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
