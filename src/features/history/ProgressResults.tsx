import { ArrowLeft, ArrowRight, ChevronDown } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { POUNDS_TO_KG, type LoadUnit } from "@/application/workouts/load-entry";
import {
  AppSheet,
  AppText,
  ChoiceControl,
  IconButton,
} from "@/design-system/v2.2/primitives";
import { OrdinalRow } from "@/design-system/v2.2/components";
import { useAppTheme } from "@/design-system/use-app-theme";
import type { buildHistoryAnalytics } from "@/domain/analytics/workout-history";
import type { ProgressPlanSession } from "@/application/workouts/progress-plan";

export function ProgressFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange(value: string): void;
}) {
  const theme = useAppTheme();
  const { fontScale } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ flexGrow: 1, flexBasis: 140 * fontScale, minWidth: 0 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Filtrar por ${label.toLocaleLowerCase("es")}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        style={{
          borderBottomWidth: 1,
          borderColor: theme.border,
          paddingVertical: 12,
          minHeight: 56,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          <AppText variant="caption" color="muted">
            {label}
          </AppText>
          <AppText variant="bodyStrong">
            {options.find((option) => option.value === value)?.label ?? "Todos"}
          </AppText>
        </View>
        <ChevronDown size={20} color={theme.text} />
      </Pressable>
      <AppSheet
        visible={open}
        title={label}
        closeLabel={`Cerrar filtro ${label.toLocaleLowerCase("es")}`}
        onDismiss={() => setOpen(false)}
      >
        <ScrollView style={{ maxHeight: 360 }}>
          {options.map((option) => (
            <ChoiceControl
              key={option.value}
              label={option.label}
              selected={value === option.value}
              onPress={() => {
                onChange(option.value);
                setOpen(false);
              }}
            />
          ))}
        </ScrollView>
      </AppSheet>
    </View>
  );
}

export function ProgressResults({
  analytics,
  plan,
  planKnown,
  unit,
  name,
  onSession,
}: {
  analytics: ReturnType<typeof buildHistoryAnalytics>;
  plan: readonly ProgressPlanSession[];
  planKnown: boolean;
  unit: LoadUnit;
  name(id: string): string;
  onSession(id: string): void;
}) {
  const theme = useAppTheme();
  const [detail, setDetail] = useState<string | null>(null);
  const exercise = analytics.exercises.find(
    (item) => item.exerciseId === detail,
  );
  const completed = plan.filter((item) => item.completed).length;
  const quantity = (value: number, metric: "e1rm" | "seconds" | "reps") =>
    `${Number((metric === "e1rm" && unit === "lb" ? value / POUNDS_TO_KG : value).toFixed(1)).toLocaleString("es-CL")} ${metric === "e1rm" ? unit : metric === "seconds" ? "s" : "rep"}`;
  const date = (value: string) =>
    new Date(value).toLocaleDateString("es-CL", {
      day: "numeric",
      month: "short",
    });
  const points = exercise?.datedPoints.filter((point) => point.value > 0) ?? [];
  const max = Math.max(1, ...points.map((point) => point.value));
  return (
    <View style={{ gap: 24 }}>
      <View
        testID="progress-metric-strip"
        style={{
          borderBottomWidth: 1,
          borderColor: theme.border,
          paddingBottom: 20,
          gap: 12,
        }}
      >
        <AppText variant="heading">Constancia del plan</AppText>
        <AppText variant="title">
          {planKnown && plan.length
            ? `${completed} / ${plan.length}`
            : `${analytics.sessions.length} sesiones`}
        </AppText>
        <AppText color="muted">
          {planKnown && plan.length
            ? `${Math.round((completed / plan.length) * 100)}% de sesiones completadas · plan completo del ciclo seleccionado`
            : "Sesiones terminadas. Sin un plan asociado no se calcula adherencia."}
        </AppText>
        <AppText variant="caption" color="muted">
          {analytics.completedSetCount} series completadas de{" "}
          {analytics.completedSetCount +
            analytics.skippedSetCount +
            analytics.pendingSetCount}{" "}
          registradas en el período ·{" "}
          {Math.round(analytics.setCompletion * 100)}%
        </AppText>
        {analytics.totalVolume > 0 ? (
          <AppText color="muted">
            Volumen registrado ·{" "}
            {Number(
              (
                analytics.totalVolume / (unit === "lb" ? POUNDS_TO_KG : 1)
              ).toFixed(3),
            ).toLocaleString("es-CL")}{" "}
            {unit}
          </AppText>
        ) : null}
      </View>
      <View testID="progress-training-outcomes" style={{ gap: 12 }}>
        {exercise ? (
          <>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              <IconButton
                accessibilityLabel="Volver a resultados"
                icon={ArrowLeft}
                onPress={() => setDetail(null)}
              />
              <AppText variant="heading" style={{ flex: 1 }}>
                {name(exercise.exerciseId)}
              </AppText>
            </View>
            <AppText variant="bodyStrong">
              {exercise.metric === "e1rm"
                ? "Fuerza estimada · e1RM"
                : exercise.metric === "seconds"
                  ? "Mayor duración por serie"
                  : "Mayor cantidad por serie"}
            </AppText>
            {points.length ? (
              <>
                <AppText variant="title">
                  {quantity(points.at(-1)!.value, exercise.metric)}
                </AppText>
                <AppText color="muted">
                  Último registro · {date(points.at(-1)!.at)}
                </AppText>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator
                  contentContainerStyle={{ gap: 12, paddingVertical: 12 }}
                >
                  {points.map((point) => (
                    <Pressable
                      key={point.workoutId}
                      accessibilityRole="button"
                      accessibilityLabel={`Ver sesión del ${date(point.at)}, ${quantity(point.value, exercise.metric)}`}
                      onPress={() => onSession(point.workoutId)}
                      style={{
                        width: 88,
                        minHeight: 156,
                        justifyContent: "flex-end",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <AppText variant="caption">
                        {quantity(point.value, exercise.metric)}
                      </AppText>
                      <View
                        style={{
                          width: 24,
                          height: Math.max(4, (point.value / max) * 80),
                          backgroundColor: theme.text,
                        }}
                      />
                      <AppText variant="caption" color="muted">
                        {date(point.at)}
                      </AppText>
                    </Pressable>
                  ))}
                </ScrollView>
                <AppText color="muted" variant="caption">
                  {exercise.metric === "e1rm"
                    ? "Estimación según carga y repeticiones registradas; no es un máximo probado."
                    : "Cantidades registradas, sin estimar fuerza máxima."}
                </AppText>
              </>
            ) : (
              <AppText color="muted">
                Este ejercicio aún no tiene cantidades completas para una
                tendencia.
              </AppText>
            )}
          </>
        ) : (
          analytics.exercises.map((item, index) => (
            <OrdinalRow
              key={item.exerciseId}
              ordinal={index + 1}
              name={name(item.exerciseId)}
              detail={`${item.datedPoints.length} sesiones · ${date(item.datedPoints.at(-1)!.at)}`}
              actionLabel={`Ver resultado de ${name(item.exerciseId)}`}
              onPress={() => setDetail(item.exerciseId)}
              trailing={
                <IconButton
                  accessibilityLabel={`Ver resultado de ${name(item.exerciseId)}`}
                  icon={ArrowRight}
                  onPress={() => setDetail(item.exerciseId)}
                />
              }
            />
          ))
        )}
        {!analytics.exercises.length ? (
          <AppText color="muted">No hay resultados para estos filtros.</AppText>
        ) : null}
      </View>
    </View>
  );
}
