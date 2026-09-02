import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { exerciseCatalog, type SeedExercise } from '@/data/seeds/exercises';
import { ActionButton, AppText, Panel, Tag } from '@/design-system/v2.2/primitives';
import { palette, radii, spacing } from '@/design-system/v2.2/tokens';
import { useAppTheme } from '@/design-system/use-app-theme';
import { rankSubstitutions, type ReplacementReason } from '@/domain/substitutions/rank-substitutions';
import { defaultSettings, type TrainingSettings } from '@/features/settings/settings';
import { ImageDiagram } from './ExerciseMedia';

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
const approvedAnchorEquivalents: Readonly<Record<string, readonly string[]>> = {
  'barbell-bench-press': ['incline-dumbbell-press'],
  'strict-pull-up': ['neutral-lat-pulldown'],
};
const equipmentIds: Readonly<Record<string, readonly string[]>> = {
  Barra: ['barbell'], Mancuernas: ['dumbbells'], Banco: ['bench', 'incline-bench'], Bandas: ['bands'],
};

export function exerciseName(id: string) { return exerciseCatalog.find((item) => item.id === id)?.name ?? id; }

export function ReplacementSheet({ exerciseId, requirement, onCancel, onConfirm, settings = defaultSettings }: {
  exerciseId: string; requirement: 'EXACT' | 'PATTERN' | 'CAPABILITY'; onCancel: () => void; onConfirm: (exercise: SeedExercise, reason: ReplacementReason) => void; settings?: TrainingSettings;
}) {
  const theme = useAppTheme();
  const [reason, setReason] = useState<ReplacementReason | null>(null);
  const [candidate, setCandidate] = useState<SeedExercise | null>(null);
  const [visibleMediaId, setVisibleMediaId] = useState<string | null>(null);
  const original = exerciseCatalog.find((item) => item.id === exerciseId);
  const ranked = useMemo(() => original && reason ? rankSubstitutions(exerciseCatalog, {
    originalExerciseId: exerciseId,
    requirement: { type: requirement, value: requirement === 'PATTERN' ? original.pattern : requirement === 'CAPABILITY' ? original.tags[0] ?? original.pattern : exerciseId },
    reason,
    availableEquipment: settings.equipment.flatMap((item) => equipmentIds[item] ?? [item]),
    skillLevel: 'advanced', restrictions: {
      maxImpact: settings.restrictions.includes('no-impact') ? 'none' : 'high',
      maxBraceDemand: settings.restrictions.includes('no-high-brace-demand') ? 'low' : 'high',
      maxLumbarDemand: settings.restrictions.includes('no-high-lumbar-demand') ? 'low' : 'high',
    },
    recentExerciseIds: [], preferredExerciseIds: [],
    ...(requirement === 'EXACT' ? { approvedEquivalentIds: approvedAnchorEquivalents[exerciseId] ?? [] } : {}),
  }) : [], [exerciseId, original, reason, requirement, settings]);

  if (!original) return <Panel><AppText variant="heading">Catálogo no disponible</AppText><AppText color="muted">Este ejercicio no pertenece al catálogo local versionado.</AppText><ActionButton onPress={onCancel} tone="secondary">Volver</ActionButton></Panel>;
  if (candidate && reason && requirement === 'EXACT') return <Panel><Tag>EJERCICIO ANCLA</Tag><AppText variant="heading">Confirma el cambio de ejercicio ancla</AppText><AppText color="muted">El motivo y la alternativa quedarán guardados en la instantánea de esta sesión.</AppText><ActionButton accessibilityLabel="Confirmar reemplazo" onPress={() => onConfirm(candidate, reason)}>Confirmar reemplazo</ActionButton><ActionButton onPress={() => setCandidate(null)} tone="secondary">Revisar alternativas</ActionButton></Panel>;

  return <Panel><AppText accessibilityRole="header" aria-level={2} variant="heading">¿Por qué necesitas un reemplazo?</AppText>
    <View accessibilityRole="radiogroup" style={styles.reasons}>{reasons.map(([value, label]) => <Pressable accessibilityLabel={label} accessibilityRole="radio" accessibilityState={{ checked: reason === value }} aria-checked={reason === value} key={value} onPress={() => setReason(value)} style={({ pressed }) => [styles.reason, { backgroundColor: theme.surface, borderColor: reason === value ? palette.strength : theme.border, opacity: pressed ? 0.78 : 1 }]}><AppText color={reason === value ? 'accent' : 'default'} variant="label">{label}</AppText></Pressable>)}</View>
    {reason && ranked.length === 0 ? <View accessibilityLiveRegion="polite"><AppText variant="bodyStrong">No hay alternativas compatibles</AppText><AppText color="muted">Conserva el ejercicio actual o cambia equipo/restricciones; no se omiten filtros de seguridad.</AppText></View> : null}
    {ranked.map(({ exercise, explanations }) => <Panel key={exercise.id}><AppText variant="heading">{exercise.name}</AppText><AppText color="accent">Mismo patrón: {patternNames[exercise.pattern] ?? 'movimiento compatible'}</AppText>{explanations.filter((item) => item.startsWith('Shares ')).map((item) => { const tags = item.slice('Shares '.length, -' stimulus'.length).split(', ').map((tag) => stimulusNames[tag] ?? 'capacidad compatible'); return <AppText color="muted" key={item}>Comparte estímulo: {tags.join(', ')}</AppText>; })}
      <Tag>MEDIO LOCAL · SIN RED</Tag><Pressable accessibilityHint="Toca para mostrar u ocultar la ilustración" accessibilityLabel={`Medio local de ${exercise.name}`} accessibilityRole="button" onPress={() => setVisibleMediaId((current) => current === exercise.id ? null : exercise.id)} style={styles.media} testID={`exercise-media-${exercise.id}`}><AppText variant="body" color="muted">Instrucciones disponibles sin conexión</AppText>{exercise.instructions.map((instruction) => <AppText key={instruction}>• {instruction}</AppText>)}{visibleMediaId === exercise.id ? <ImageDiagram exerciseId={exercise.id} /> : null}</Pressable>
      <ActionButton accessibilityLabel={`Elegir ${exercise.name}`} onPress={() => requirement === 'EXACT' ? setCandidate(exercise) : onConfirm(exercise, reason!)}>Elegir alternativa</ActionButton></Panel>)}
    <ActionButton onPress={onCancel} tone="secondary">Cancelar</ActionButton>
  </Panel>;
}

const styles = StyleSheet.create({ media: { minHeight: 48 }, reason: { borderRadius: radii.control, borderWidth: 1, justifyContent: 'center', minHeight: 48, minWidth: 120, paddingHorizontal: spacing.md - 1 }, reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs } });
