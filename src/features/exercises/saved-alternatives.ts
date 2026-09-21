import { exerciseCatalog } from '@/data/seeds/exercises';
import { catalogCompatibility } from '@/domain/prescriptions/catalog-requirements';
import { normalizeEquipment, normalizeRequirement } from '@/domain/prescriptions/catalog-options';
import { rankSubstitutions, type ReplacementReason } from '@/domain/substitutions/rank-substitutions';
import type { WorkoutHistoryItem } from '@/application/workouts/workout-service';
import type { TrainingSettings, RequirementKind } from '@/features/settings/settings';

const approvedAnchorEquivalents: Readonly<Record<string, readonly string[]>> = {
  'barbell-bench-press': ['incline-dumbbell-press'],
  'strict-pull-up': ['neutral-lat-pulldown'],
};

export function savedAlternatives(exerciseId: string, requirement: RequirementKind, reason: ReplacementReason | null, settings: TrainingSettings, history: readonly WorkoutHistoryItem[] = []) {
  const original = exerciseCatalog.find(item => item.id === exerciseId);
  if (!original || !reason) return [];
  return rankSubstitutions(exerciseCatalog.filter(exercise => exercise.id === exerciseId || catalogCompatibility({ id: 'alternatives', type: 'strength', weeks: 1, equipment: settings.equipment, restrictions: settings.restrictions })(exercise)), {
    originalExerciseId: exerciseId,
    requirement: { type: requirement, value: requirement === 'PATTERN' ? original.pattern : requirement === 'CAPABILITY' ? original.tags[0] ?? original.pattern : exerciseId },
    reason, availableEquipment: ['bodyweight', ...settings.equipment.map(normalizeEquipment)],
    skillLevel: settings.skillLevel ?? 'beginner',
    restrictions: { maxImpact: 'high', maxBraceDemand: 'high', maxLumbarDemand: 'high' },
    recentExerciseIds: [...history].sort((a, b) => b.completedAt.localeCompare(a.completedAt)).slice(0, 3).flatMap(item => item.actual.exercises.filter(exercise => exercise.sets.some(set => set.disposition === 'COMPLETED')).map(exercise => exercise.exerciseId)),
    preferredExerciseIds: settings.requirements.filter(item => item.kind === 'EXACT').map(item => normalizeRequirement('EXACT', item.value)),
    ...(requirement === 'EXACT' ? { approvedEquivalentIds: approvedAnchorEquivalents[exerciseId] ?? [] } : {}),
  });
}
