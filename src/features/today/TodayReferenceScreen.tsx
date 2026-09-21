import { ArrowRight, Settings, ShieldAlert } from "lucide-react-native";
import { prescriptionQuantity } from '@/domain/prescriptions/measurement';
import { useState, type ReactNode, type ComponentType } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  ReadinessGate,
  type ReadinessGateProps,
} from "@/features/readiness/ReadinessGate";
import { ActionButton, Screen } from "@/design-system/v2.2/primitives";
import {
  AppMasthead,
  BrandContent,
  IconCommand,
  OrdinalRow,
  PhaseBand,
  StatusActionBand,
} from "@/design-system/v2.2/components";
import {
  borders,
  palette,
  spacing,
  typography,
} from "@/design-system/v2.2/tokens";
import type { PersistedReadiness, ReadinessInput } from '@/application/workouts/workout-service';
import type { SafetyInput } from "@/domain/safety";
import { exerciseCatalog } from "@/data/seeds/exercises";
import type { TodayState } from "./today-state";
import { useAppTheme } from "@/design-system/use-app-theme";
import { todayCalendar } from './today-calendar';

type Props = {
  recommendations?: ReactNode;
  activeReadiness?: PersistedReadiness | null;
  savedReadiness?: PersistedReadiness | null;
  initialReadinessInput?: SafetyInput | null;
  onApplyReadiness?: (input: ReadinessInput) => void | PersistedReadiness | Promise<void | PersistedReadiness>;
  onOpenSettings: () => void;
  onCreatePlan?: () => void;
  onOpenReview?: () => void;
  onOpenCycle?: () => void;
  onStartWorkout: (exerciseIndex?: number) => void;
  readinessGate?: ComponentType<ReadinessGateProps>;
  state: TodayState;
};
const names: Record<string, string> = {
  "barbell-bench-press": "Press banca",
  "chest-supported-row": "Remo apoyado",
  "pallof-press": "Press Pallof",
  "dead-bug": "Dead bug",
  "smith-box-squat": "Sentadilla Smith a caja",
  "seated-leg-curl": "Curl femoral sentado",
  "bird-dog": "Bird dog",
  "strict-pull-up": "Dominada estricta",
  "seated-dumbbell-press": "Press sentado con mancuernas",
};
const cycleNames = {
  hypertrophy: "hipertrofia",
  strength: "fuerza",
  power: "potencia",
  transition: "transición",
  reentry: "reentrada",
} as const;

function exerciseLabel(id: string): string {
  return names[id] ?? exerciseCatalog.find((exercise) => exercise.id === id)?.name ?? "Ejercicio no disponible en el catálogo";
}

export function TodayReferenceScreen({
  onOpenCycle,
  recommendations,
  initialReadinessInput = null,
  savedReadiness = null,
  onApplyReadiness,
  onOpenSettings,
  onCreatePlan,
  activeReadiness = null,
  onOpenReview,
  onStartWorkout,
  readinessGate: Readiness = ReadinessGate,
  state,
}: Props) {
  const theme = useAppTheme();
  const [gateOpen, setGateOpen] = useState(Boolean(initialReadinessInput));
  const [persistedReadinessDismissed, setPersistedReadinessDismissed] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<number | undefined>();
  const data = "data" in state ? state.data : null;
  const calendar = todayCalendar(data, new Date());
  const preparation = savedReadiness ?? activeReadiness;
  const preparationBlocked = preparation && ['PATTERN_STOPPED', 'ABORTED', 'REVIEW_REQUIRED'].includes(preparation.sessionStatus);
  const exercises = data?.session.blocks
    ? data.session.blocks.filter((block) => block.role !== "finish-review").flatMap((block) => block.exercises)
    : data?.session.exercises ?? [];
  const unknownReferences = exercises.some((exercise) => !exerciseCatalog.some((entry) => entry.id === exercise.exerciseId && entry.pattern !== "review"));
  const emptyCopy =
    state.kind === "review-required"
      ? [
          "Revisión requerida antes de entrenar",
          `Revisa ${state.weekIndex ? `la semana ${state.weekIndex}` : "la semana pendiente"} antes de iniciar otra sesión.`,
        ]
      : state.kind === "cycle-complete"
        ? ["Ciclo completado: confirmación pendiente", "Todas las semanas están revisadas. El siguiente ciclo requiere confirmación."]
      : state.kind === "no-workout"
        ? [
            "Hoy no hay entrenamiento",
            `Descansa. La próxima sesión es ${state.nextSessionLabel}.`,
          ]
        : [
            "Todavía no hay un plan activo",
            "Crea y confirma un ciclo para ver aquí tu próxima sesión.",
          ];
  const enterWorkout = (index?: number) => {
    setSelectedExercise(index);
    if (state.kind === 'resume' && !savedReadiness) onStartWorkout(index);
    else setGateOpen(true);
  };
  if (!data)
    return (
      <Screen testID={`today-${state.kind}`}>
        <AppMasthead
          command={<IconCommand icon={Settings} label="Abrir ajustes" onPress={onOpenSettings} />}
          context={calendar.date}
          testID="brand-masthead"
          title="HOY"
        />
        <PhaseBand label="ESTADO DE HOY" />
        <BrandContent>
          {recommendations}
          {state.kind === 'cycle-complete' && onOpenCycle ? <ActionButton accessibilityLabel="Revisar siguiente ciclo" onPress={onOpenCycle}>Revisar siguiente ciclo</ActionButton> : null}
          <View accessibilityLabel={emptyCopy[0]} testID="today-alternate-state" style={styles.alternate}>
            <Text accessibilityRole="header" aria-level={2} style={[styles.display, { color: theme.text }]}>{emptyCopy[0]}</Text>
            <Text style={[styles.body, { color: theme.textMuted }]}>{emptyCopy[1]}</Text>
            {state.kind === 'empty' && onCreatePlan ? <ActionButton onPress={onCreatePlan}>Crear mi plan</ActionButton> : null}
            {state.kind === "review-required" && onOpenReview ? <ActionButton onPress={onOpenReview}>Abrir revisión semanal</ActionButton> : null}
          </View>
        </BrandContent>
      </Screen>
    );
  return (
    <Screen testID={`today-${state.kind}`}>
      <AppMasthead
        command={<IconCommand icon={Settings} label="Abrir ajustes" onPress={onOpenSettings} />}
        context={calendar.date}
        testID="brand-masthead"
        title="HOY"
      />
      <>
        <PhaseBand
          current={data.weekIndex}
          label={`CICLO DE ${cycleNames[data.cycleType].toUpperCase()} · SEMANA ${data.weekIndex} DE ${data.cycle.weeks.length}`}
          testID="cycle-progress-band"
          total={data.cycle.weeks.length}
        />
        <BrandContent>
          <View testID="session-header" style={styles.sessionHeader}>
            <Text testID="today-calendar-status" style={[styles.eyebrowDark, { color: theme.textMuted }]}>{state.kind === 'resume' ? 'Sesión en curso' : calendar.status} · DÍA {data.dayIndex}</Text>
            <Text
              accessibilityRole="header"
              aria-level={2}
              style={[styles.title, { color: theme.text }]}
            >
              Entrenamiento de {cycleNames[data.cycleType]}
            </Text>
            <Text style={[styles.body, { color: theme.textMuted }]}>
              {calendar.nextSession} · {exercises.length} ejercicios
            </Text>
          </View>
          {state.kind === "restriction" ? (
            <View
              accessibilityLabel="Restricción activa"
              style={styles.restriction}
            >
              <ShieldAlert color={theme.cautionText} size={24} />
              <View style={styles.flex}>
                <Text style={[styles.heading, { color: theme.text }]}>Restricción activa</Text>
                <Text style={[styles.body, { color: theme.textMuted }]}>
                  La preparación aplicará los bloqueos registrados antes de
                  comenzar.
                </Text>
              </View>
            </View>
          ) : null}
          {unknownReferences ? (
            <View accessibilityRole="alert" style={styles.restriction}>
              <Text style={[styles.body, { color: theme.text }]}>
                Esta sesión contiene referencias desconocidas. Consulta el plan; no se han sustituido ejercicios ni modificado tus registros.
              </Text>
            </View>
          ) : null}
          <View testID="readiness-action-band">
            <StatusActionBand
              title={
                preparationBlocked ? 'Preparación detenida' : preparation?.sessionStatus === 'MODIFIED' ? 'Preparación adaptada' : state.kind === "resume"
                  ? "Sesión en curso"
                  : state.kind === "restriction"
                    ? "Preparación con restricciones"
                    : "Preparación de hoy"
              }
              detail={
                preparationBlocked ? 'Revisa el motivo guardado. Este acceso no elimina el bloqueo.' : preparation?.sessionStatus === 'MODIFIED' ? 'Se conservan los ajustes de la preparación guardada.' : state.kind === "resume"
                  ? "Continúa desde el último estado guardado."
                  : "Confirma tu estado antes de abrir el entrenamiento."
              }
              actionLabel={
                state.kind === "resume"
                  ? "Continuar entrenamiento"
                  : "Revisar preparación para entrenar"
              }
              onAction={() => enterWorkout()}
            />
          </View>
          {state.kind === "resume" ? <ActionButton tone="secondary" onPress={() => setGateOpen(true)}>Revisar preparación para entrenar</ActionButton> : null}
          {recommendations}
          <View testID="exercise-run-sheet" style={styles.runSheet}>
            <Text
              accessibilityRole="header"
              aria-level={2}
              style={[styles.heading, { color: theme.text }]}
            >
              ORDEN DE TRABAJO
            </Text>
            {exercises.map((exercise, index) => (
              <OrdinalRow
                key={`${exercise.exerciseId}-${index}`}
                ordinal={index + 1}
                name={exerciseLabel(exercise.exerciseId)}
                detail={prescriptionQuantity(exercise)}
                actionLabel={`Abrir ejercicio ${index + 1}: ${exerciseLabel(exercise.exerciseId)}`}
                icon={ArrowRight}
                trailing={<IconCommand icon={ArrowRight} label={`Abrir ejercicio ${index + 1}: ${exerciseLabel(exercise.exerciseId)}`} onPress={() => enterWorkout(index)} />}
                onPress={() => enterWorkout(index)}
              />
            ))}
          </View>
        </BrandContent>
      </>
      <Readiness
        key={activeReadiness ? JSON.stringify(activeReadiness) : savedReadiness ? JSON.stringify(savedReadiness) : initialReadinessInput ? JSON.stringify(initialReadinessInput) : 'empty-readiness'}
        savedDecision={savedReadiness ?? activeReadiness}
        initialInput={initialReadinessInput ?? activeReadiness?.input ?? null}
        visible={gateOpen || ((Boolean(initialReadinessInput) || Boolean(savedReadiness)) && !persistedReadinessDismissed)}
        onClose={() => { setGateOpen(false); setSelectedExercise(undefined); setPersistedReadinessDismissed(true); }}
        {...(onApplyReadiness ? { onDecision: onApplyReadiness } : {})}
        onReady={async () => {
          setGateOpen(false);
          setPersistedReadinessDismissed(true);
          onStartWorkout(selectedExercise);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  masthead: {
    alignItems: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  flex: { flex: 1, minWidth: 180 },
  eyebrow: { ...typography.caption, color: palette.ink },
  eyebrowDark: { ...typography.caption, color: palette.steel },
  hero: { ...typography.hero, color: palette.ink },
  inkBody: { ...typography.bodyStrong, color: palette.ink },
  iconButton: {
    alignItems: "center",
    backgroundColor: palette.ink,
    justifyContent: "center",
    minHeight: 48,
    minWidth: 48,
  },
  inverseLabel: { ...typography.label, color: palette.paper },
  alternate: {
    borderBottomColor: palette.ink,
    borderBottomWidth: borders.emphasis,
    gap: spacing.md,
    paddingVertical: spacing.xxl,
  },
  title: { ...typography.title, color: palette.ink },
  display: { ...typography.display, color: palette.ink },
  heading: { ...typography.heading, color: palette.ink },
  body: { ...typography.body, color: palette.steel },
  sessionHeader: { gap: spacing.sm, paddingVertical: spacing.md },
  restriction: {
    alignItems: "flex-start",
    borderBottomColor: palette.caution,
    borderBottomWidth: borders.emphasis,
    borderTopColor: palette.caution,
    borderTopWidth: borders.emphasis,
    flexDirection: "row",
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  runSheet: { paddingBottom: spacing.xl, paddingTop: spacing.xl },
});
