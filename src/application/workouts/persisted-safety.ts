import type { RepositoryDatabase, SqlValue } from '../../data/repositories';
import { exerciseCatalog } from '../../data/seeds/exercises';
import { evaluateSafety } from '../../domain/safety';
import type { WorkoutDraft } from './workout-service';

// Compare the same ordered, lossless representation at validation and mutation.
// A restriction arriving between the read and the write invalidates the write.
export const restrictionSnapshotSql = `(SELECT COALESCE(json_group_array(json_object('id', id, 'kind', kind, 'details', details_json)), '[]') FROM (SELECT id, kind, details_json FROM active_restriction WHERE active = 1 ORDER BY id))`;
export const safetyChanged = 'La seguridad o el entrenamiento guardado cambió. Vuelve a Hoy para revisar la preparación y las restricciones. Tu trabajo guardado se conserva.';
export const restrictionRecovery = 'La restricción guardada requiere revisión: no se puede verificar este entrenamiento. Conserva el registro y solicita la revisión de la restricción antes de continuar.';

export async function readRestrictions(db: RepositoryDatabase): Promise<string> {
  return (await db.getFirstAsync<{ snapshot: string }>(`SELECT ${restrictionSnapshotSql} AS snapshot`))!.snapshot;
}

export function enforceRestrictions(draft: WorkoutDraft, snapshot: string) {
  const rows = JSON.parse(snapshot) as { id: string; kind: string; details: string }[];
  const kinds = rows.map(row => {
    // Only the established catalogue constraints have defined semantics. Extra
    // legacy details cannot be translated into clearance or medical advice.
    let details: unknown;
    try { details = JSON.parse(row.details); } catch { throw new Error(restrictionRecovery); }
    if (!details || Array.isArray(details) || typeof details !== 'object' || Object.keys(details).length
      || !['lumbar', 'abdominal', 'sin impacto'].includes(row.kind)) throw new Error(restrictionRecovery);
    return row.kind;
  });
  if (draft.readiness?.input?.abdominalRestrictionActive && !kinds.includes('abdominal')) kinds.push('abdominal');
  for (const kind of kinds) for (const item of draft.exercises) {
    const exercise = exerciseCatalog.find(candidate => candidate.id === item.exerciseId);
    if (!exercise || (kind === 'lumbar' && exercise.lumbarDemand !== 'low')
      || (kind === 'sin impacto' && exercise.impact !== 'none')) throw new Error(restrictionRecovery);
    if (kind === 'abdominal') {
      const policy = evaluateSafety({ pain: 0, painTrend: 'stable', abdominalRestrictionActive: true });
      if (policy.blockedTraining.includes('MAXIMAL_BRACING') && exercise.braceDemand !== 'low'
        || policy.blockedTraining.includes('POWER') && (exercise.pattern === 'power' || exercise.tags.includes('power'))
        // The current log cannot establish whether external load is heavy for
        // this person. Permit verifiable unloaded work; never invent a cutoff.
        || policy.blockedTraining.includes('HEAVY_LOADING') && (!exercise.equipment.every(value => value === 'bodyweight') || item.sets.some(set => Number(set.load.replace(',', '.')) !== 0))
        || policy.blockedTraining.includes('PAINFUL_SET_INTENSIFIERS') && item.sets.some(set => set.pain > 2 || set.technique !== 'Limpia')) throw new Error(restrictionRecovery);
    }
  }
}

export function mutationSafety(draft: WorkoutDraft): { sql: string; params: SqlValue[] } {
  if (!draft.exercises.length || draft.exercises.some(exercise => !exercise.sets.length)) throw new Error('El entrenamiento vacío no puede reemplazar el trabajo guardado.');
  enforceRestrictions(draft, draft.restrictionSnapshot ?? '[]');
  const readiness = draft.readiness;
  if (draft.sessionPlanId && (!readiness || !['READY', 'MODIFIED'].includes(readiness.sessionStatus))) throw new Error(safetyChanged);
  return {
    sql: `AND session_plan_id IS ?
      AND ${restrictionSnapshotSql} = ?
      AND (session_plan_id IS NULL OR (
        EXISTS (SELECT 1 FROM app_setting WHERE key = 'session-readiness:' || workout_session.session_plan_id AND value_json = ?)
        AND EXISTS (SELECT 1 FROM session_plan WHERE id = workout_session.session_plan_id AND status = 'PLANNED')))
      AND COALESCE(json_extract(actual_snapshot_json, '$.revision'), 0) = ?`,
    params: [draft.sessionPlanId ?? null, draft.restrictionSnapshot ?? '[]', readiness ? JSON.stringify(readiness) : null, draft.revision ?? 0],
  };
}
