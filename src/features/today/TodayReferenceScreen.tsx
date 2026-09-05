import { ArrowRight, Settings, ShieldAlert } from "lucide-react-native";
import { useState, type ComponentType } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  ReadinessGate,
  type ReadinessGateProps,
} from "@/features/readiness/ReadinessGate";
import { Screen } from "@/design-system/v2.2/primitives";
import {
  AppMasthead,
  BrandContent,
  IconCommand,
  MetricStrip,
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
import type { SafetyInput } from "@/domain/safety";
import { exerciseCatalog } from "@/data/seeds/exercises";
import type { TodayState } from "./today-state";
import { useAppTheme } from "@/design-system/use-app-theme";

type Props = {
  initialReadinessInput?: SafetyInput | null;
  onApplyReadiness?: (input: SafetyInput) => void | Promise<void>;
  onOpenSettings: () => void;
  onStartWorkout: () => void;
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
  initialReadinessInput = null,
  onApplyReadiness,
  onOpenSettings,
  onStartWorkout,
  readinessGate: Readiness = ReadinessGate,
  state,
}: Props) {
  const theme = useAppTheme();
  const [gateOpen, setGateOpen] = useState(Boolean(initialReadinessInput));
  const [persistedReadinessDismissed, setPersistedReadinessDismissed] = useState(false);
  const data = "data" in state ? state.data : null;
  const exercises = data?.session.blocks
    ? data.session.blocks.filter((block) => block.role !== "finish-review").flatMap((block) => block.exercises)
    : data?.session.exercises ?? [];
  const unknownReferences = exercises.some((exercise) => !exerciseCatalog.some((entry) => entry.id === exercise.exerciseId && entry.pattern !== "review"));
  const emptyCopy =
    state.kind === "review-required"
      ? [
          "Revisión requerida antes de entrenar",
          "Revisa el ciclo pendiente antes de iniciar otra sesión.",
        ]
      : state.kind === "no-workout"
        ? [
            "Hoy no hay entrenamiento",
            `Descansa. La próxima sesión es ${state.nextSessionLabel}.`,
          ]
        : [
            "Todavía no hay un plan activo",
            "Crea y confirma un ciclo para ver aquí tu próxima sesión.",
          ];
  const enterWorkout =
    state.kind === "resume" ? onStartWorkout : () => setGateOpen(true);
  if (!data)
    return (
      <Screen testID={`today-${state.kind}`}>
        <AppMasthead
          command={<IconCommand icon={Settings} label="Abrir ajustes" onPress={onOpenSettings} />}
          context="Preparación de hoy y sesión disponibles sin conexión"
          testID="brand-masthead"
          title="HOY"
        />
        <PhaseBand label="ESTADO DE HOY" />
        <BrandContent>
          <View accessibilityLabel={emptyCopy[0]} testID="today-alternate-state" style={styles.alternate}>
            <Text accessibilityRole="header" aria-level={2} style={[styles.display, { color: theme.text }]}>{emptyCopy[0]}</Text>
            <Text style={[styles.body, { color: theme.textMuted }]}>{emptyCopy[1]}</Text>
          </View>
        </BrandContent>
      </Screen>
    );
  return (
    <Screen testID={`today-${state.kind}`}>
      <AppMasthead
        command={<IconCommand icon={Settings} label="Abrir ajustes" onPress={onOpenSettings} />}
        context="Preparación de hoy y entrenamiento disponibles sin conexión"
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
            <Text style={[styles.eyebrowDark, { color: theme.textMuted }]}>DÍA {data.dayIndex}</Text>
            <Text
              accessibilityRole="header"
              aria-level={2}
              style={[styles.display, { color: theme.text }]}
            >
              Entrenamiento de {cycleNames[data.cycleType]}
            </Text>
            <Text style={[styles.body, { color: theme.textMuted }]}>
              {exercises.length} ejercicios en el orden del
              entrenamiento
            </Text>
            <MetricStrip
              metrics={[
                {
                  label: "EJERCICIOS",
                  value: String(exercises.length),
                },
                {
                  label: "RIR OBJETIVO",
                  value: `${exercises[0]?.target.rir.min ?? "—"}–${exercises[0]?.target.rir.max ?? "—"}`,
                },
              ]}
            />
          </View>
          {state.kind === "restriction" ? (
            <View
              accessibilityLabel="Restricción activa"
              style={styles.restriction}
            >
              <ShieldAlert color={palette.caution} size={24} />
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
                state.kind === "resume"
                  ? "Sesión en curso"
                  : state.kind === "restriction"
                    ? "Preparación con restricciones"
                    : "Preparación de hoy"
              }
              detail={
                state.kind === "resume"
                  ? "Continúa desde el último estado guardado."
                  : "Confirma tu estado antes de abrir el entrenamiento."
              }
              actionLabel={
                state.kind === "resume"
                  ? "Continuar entrenamiento"
                  : "Revisar preparación para entrenar"
              }
              onAction={enterWorkout}
            />
          </View>
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
                detail={`${exercise.target.sets} series · ${exercise.target.reps.min}–${exercise.target.reps.max} repeticiones`}
                actionLabel={`Abrir ejercicio ${index + 1}: ${exerciseLabel(exercise.exerciseId)}`}
                icon={ArrowRight}
                onPress={enterWorkout}
              />
            ))}
          </View>
        </BrandContent>
      </>
      <Readiness
        key={initialReadinessInput ? JSON.stringify(initialReadinessInput) : 'empty-readiness'}
        initialInput={initialReadinessInput}
        visible={gateOpen || (Boolean(initialReadinessInput) && !persistedReadinessDismissed)}
        onClose={() => { setGateOpen(false); setPersistedReadinessDismissed(true); }}
        {...(onApplyReadiness ? { onDecision: onApplyReadiness } : {})}
        onReady={async () => {
          setGateOpen(false);
          setPersistedReadinessDismissed(true);
          onStartWorkout();
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
  sessionHeader: { gap: spacing.md, paddingVertical: spacing.xl },
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
