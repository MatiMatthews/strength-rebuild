import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { exerciseCatalog, type SeedExercise } from '@/data/seeds/exercises';
import { ActionButton, AppText, Panel, Tag } from '@/design-system/v2.2/primitives';
import { spacing } from '@/design-system/v2.2/tokens';
import { ChoiceControl } from '@/design-system/v2.2/components';
import type { ReplacementReason } from '@/domain/substitutions/rank-substitutions';
import { defaultSettings, type TrainingSettings } from '@/features/settings/settings';
import { ImageDiagram } from './ExerciseMedia';
import { savedAlternatives } from './saved-alternatives';
import type { WorkoutHistoryItem } from '@/application/workouts/workout-service';
import type { ReplacementContext } from '@/application/workouts/exercise-replacement';
import { prescribeCatalogExercise } from '@/domain/prescriptions/generator';

const reasons: readonly [ReplacementReason, string][] = [
  ['equipment-unavailable', 'Equipo no disponible'], ['discomfort', 'Molestia'], ['boredom', 'Quiero variar'],
  ['skill-mismatch', 'Nivel técnico'], ['other', 'Otro motivo'],
];

const patternNames: Readonly<Record<string, string>> = {
  'horizontal-push': 'empuje horizontal', 'horizontal-pull': 'tirón horizontal',
  'vertical-push': 'empuje vertical', 'vertical-pull': 'tirón vertical', squat: 'sentadilla', hinge: 'bisagra',
};
const stimulusNames: Readonly<Record<string, string>> = {
  anchor: 'ejercicio principal', back: 'espalda', chest: 'pecho', core: 'zona media', hamstrings: 'isquiotibiales',
  legs: 'piernas', 'posterior-chain': 'cadena posterior', quadriceps: 'cuádriceps', shoulders: 'hombros',
};
export function exerciseName(id: string) { return exerciseCatalog.find((item) => item.id === id)?.name ?? id; }

export function ReplacementSheet({ exerciseId, requirement, onCancel, onConfirm, settings = defaultSettings, history = [], context = { type: 'reentry' }, blocked, busy = false }: {
  exerciseId: string; requirement: 'EXACT' | 'PATTERN' | 'CAPABILITY'; onCancel: () => void; onConfirm: (exercise: SeedExercise, reason: ReplacementReason) => void; settings?: TrainingSettings;
  history?: readonly WorkoutHistoryItem[]; context?: ReplacementContext; blocked?: string | null; busy?: boolean;
}) {
  const [reason, setReason] = useState<ReplacementReason | null>(null);
  const [candidate, setCandidate] = useState<SeedExercise | null>(null);
  const [visibleMediaId, setVisibleMediaId] = useState<string | null>(null);
  const original = exerciseCatalog.find((item) => item.id === exerciseId);
  const ranked = useMemo(() => savedAlternatives(exerciseId, requirement, reason, settings, history), [exerciseId, reason, requirement, settings, history]);

  if (!original) return <Panel><AppText variant="heading">Catálogo no disponible</AppText><AppText color="muted">Este ejercicio no pertenece al catálogo local versionado.</AppText><ActionButton onPress={onCancel} tone="secondary">Volver</ActionButton></Panel>;
  if (candidate && reason && ranked.some(item => item.exercise.id === candidate.id)) {
    const target = prescribeCatalogExercise(context, candidate, requirement);
    return <Panel>
      {requirement === 'EXACT' ? <Tag>EJERCICIO ANCLA</Tag> : null}
      <AppText accessibilityRole="header" aria-level={2} variant="heading">{requirement === 'EXACT' ? 'Confirma el cambio de ejercicio ancla' : 'Confirma el reemplazo'}</AppText>
      <AppText variant="bodyStrong">{original.name} → {candidate.name}</AppText>
      <AppText>{target.recording === 'seconds' ? `${target.target.seconds} segundos` : `${target.target.reps.min}–${target.target.reps.max} repeticiones${target.recording === 'reps-per-side' ? ' por lado' : ''}`} · RIR {target.target.rir.max}</AppText>
      <AppText>{target.calculatedLoad === undefined ? 'Carga por definir, sin copiar la anterior.' : `Referencia propia de la alternativa: ${target.calculatedLoad} ${target.loadUnit}`}</AppText>
      <AppText color="muted">Se conserva la cantidad de series pendientes, con objetivos nuevos. Las cargas, notas y esfuerzo escritos para el ejercicio anterior no se copian.</AppText>
      {blocked ? <AppText accessibilityRole="alert">{blocked}</AppText> : null}
      <ActionButton disabled={busy || !!blocked} busy={busy} accessibilityLabel="Confirmar reemplazo" onPress={() => onConfirm(candidate, reason)}>Confirmar reemplazo</ActionButton>
      <ActionButton disabled={busy} onPress={() => setCandidate(null)} tone="secondary">Revisar alternativas</ActionButton>
      <ActionButton disabled={busy} onPress={onCancel} tone="secondary">Cancelar</ActionButton>
    </Panel>;
  }

  return <Panel><AppText accessibilityRole="header" aria-level={2} variant="heading">¿Por qué necesitas un reemplazo?</AppText>
    {blocked ? <AppText accessibilityRole="alert">{blocked}</AppText> : null}
    <View accessibilityRole="radiogroup" style={styles.reasons}>{reasons.map(([value, label]) => <ChoiceControl key={value} disabled={busy} label={label} selected={reason === value} onPress={() => setReason(value)} />)}</View>
    {reason && ranked.length === 0 ? <View accessibilityLiveRegion="polite"><AppText variant="bodyStrong">No hay alternativas compatibles</AppText><AppText color="muted">Conserva el ejercicio actual o cambia equipo/restricciones; no se omiten filtros de seguridad.</AppText></View> : null}
    {ranked.map(({ exercise, explanations }) => <Panel key={exercise.id}><AppText variant="heading">{exercise.name}</AppText><AppText color="accent">Mismo patrón: {patternNames[exercise.pattern] ?? 'movimiento compatible'}</AppText>{explanations.filter((item) => item.startsWith('Shares ')).map((item) => { const tags = item.slice('Shares '.length, -' stimulus'.length).split(', ').map((tag) => stimulusNames[tag] ?? 'capacidad compatible'); return <AppText color="muted" key={item}>Comparte estímulo: {tags.join(', ')}</AppText>; })}
      <Tag>MEDIO LOCAL · SIN RED</Tag><Pressable accessibilityHint="Toca para mostrar u ocultar la ilustración" accessibilityLabel={`Medio local de ${exercise.name}`} accessibilityRole="button" onPress={() => setVisibleMediaId((current) => current === exercise.id ? null : exercise.id)} style={styles.media} testID={`exercise-media-${exercise.id}`}><AppText variant="body" color="muted">Instrucciones disponibles sin conexión</AppText>{exercise.instructions.map((instruction) => <AppText key={instruction}>• {instruction}</AppText>)}{visibleMediaId === exercise.id ? <ImageDiagram exerciseId={exercise.id} /> : null}</Pressable>
      {explanations.includes('Matches your saved preference') ? <AppText color="muted">Coincide con tus preferencias guardadas</AppText> : null}
      {explanations.includes('Ranked lower because it was used recently') ? <AppText color="muted">Usado en tus últimas sesiones</AppText> : null}
      <ActionButton disabled={busy} accessibilityLabel={`Elegir ${exercise.name}`} onPress={() => setCandidate(exercise)}>Elegir alternativa</ActionButton></Panel>)}
    <ActionButton disabled={busy} onPress={onCancel} tone="secondary">Cancelar</ActionButton>
  </Panel>;
}

const styles = StyleSheet.create({ media: { minHeight: 48 }, reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs } });
