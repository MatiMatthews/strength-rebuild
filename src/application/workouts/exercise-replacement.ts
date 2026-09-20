import { exerciseCatalog } from '../../data/seeds/exercises';
import { prescribeCatalogExercise, type CyclePrescriptionRequest } from '../../domain/prescriptions/generator';
import type { ReplacementReason } from '../../domain/substitutions';
import { enteredLoad } from './load-entry';
import type { WorkoutDraft, WorkoutExerciseDraft } from './workout-service';

export type ReplacementContext = Pick<CyclePrescriptionRequest, 'type' | 'profile'>;

export function replacementBlocker(draft: WorkoutDraft, index: number): string | null {
  const current = draft.exercises[index];
  if (!current) return 'El ejercicio ya no está disponible.';
  if (current.sets.some(set => set.completed || set.skipped || set.disposition !== 'PENDING')) {
    return 'Este cambio requiere revisión: ya hay trabajo registrado. Conserva este ejercicio para no atribuir sus series a otro movimiento; puedes omitir las series pendientes con un motivo.';
  }
  if (current.sets.some(set => set.pain > 0 || set.technique !== 'Limpia') || draft.safetyModifications.some(item => item.exerciseIndex === index)) {
    return 'Hay una señal de dolor o técnica registrada. Conserva ese registro y revisa la preparación; reemplazar no debe borrar una señal de seguridad. Puedes omitir las series pendientes con un motivo.';
  }
  if (draft.setDeletions?.some(item => item.exerciseIndex === index && !item.restored)) {
    return 'Restaura primero las series eliminadas de este ejercicio. Así conservamos su registro y la posibilidad de deshacer.';
  }
  return null;
}

export function replaceExerciseDraft(draft: WorkoutDraft, index: number, exerciseId: string, reason: ReplacementReason, context: ReplacementContext = { type: 'reentry' }): WorkoutDraft {
  const blocked = replacementBlocker(draft, index);
  if (blocked) throw new Error(blocked);
  const current = draft.exercises[index]!;
  const catalog = exerciseCatalog.find(item => item.id === exerciseId);
  if (!catalog) throw new Error('La alternativa no está disponible en el catálogo local.');
  if (exerciseId === current.exerciseId) return draft;
  const prescription = prescribeCatalogExercise(context, catalog, current.requirement);
  const load = prescription.calculatedLoad === undefined ? '' : String(prescription.calculatedLoad);
  const next: WorkoutExerciseDraft = {
    ...current, exerciseId, recording: prescription.recording!,
    qualityStops: prescription.qualityStops, loadProvenance: prescription.loadProvenance!,
    replacement: { fromExerciseId: current.exerciseId, reason },
    sets: current.sets.map(() => ({
      ...enteredLoad(load, prescription.loadUnit ?? context.profile?.units ?? 'kg'),
      reps: prescription.recording === 'seconds' ? '' : String(Math.round((prescription.target.reps.min + prescription.target.reps.max) / 2)),
      ...(prescription.recording === 'seconds' ? { seconds: String(prescription.target.seconds) } : {}),
      rir: String(prescription.target.rir.max), technique: 'Limpia', pain: 0, notes: '',
      disposition: 'PENDING', completed: false, skipped: false,
    })),
  };
  return { ...draft, activeSetIndex: 0, exercises: draft.exercises.map((item, itemIndex) => itemIndex === index ? next : item) };
}
