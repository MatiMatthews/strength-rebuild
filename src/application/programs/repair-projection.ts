import type { TodayData } from './program-service';
import type { LegacyRepairProposal } from './legacy-repair';

type Session = TodayData['session'];
export type RepairAudit = { id: string; created_at: string; inputs_json: string; output_json: string };

/** Apply bound repair choices before any later target layer, never transferring the old load. */
export function composeLegacyRepairs(rows: readonly RepairAudit[], sessionPlanId: string, original: Session, verifySource = true): Session {
  let result = original;
  for (const row of rows) {
    const proposal = JSON.parse(row.inputs_json) as LegacyRepairProposal;
    if (proposal.sessionPlanId !== sessionPlanId) continue;
    if (verifySource && (proposal.source !== JSON.stringify(original) || row.id !== `legacy-repair:${JSON.stringify([sessionPlanId, proposal.originalExerciseId])}` || ![...original.exercises,...(original.blocks??[]).filter(b=>b.role!=='finish-review').flatMap(b=>b.exercises)].some(e=>e.exerciseId===proposal.originalExerciseId))) throw new Error('La auditoría de referencias reparadas cambió. Se conserva el plan para revisión.');
    const replacement = JSON.parse(row.output_json) as Session['exercises'][number];
    if (JSON.stringify(replacement) !== JSON.stringify(proposal.replacement)) throw new Error('La referencia reparada no coincide con su auditoría.');
    const replace = (exercise: Session['exercises'][number]) => exercise.exerciseId === proposal.originalExerciseId ? replacement : exercise;
    result = { ...result, exercises: result.exercises.map(replace),
      ...(result.blocks ? { blocks: result.blocks.map(block => block.role === 'finish-review' ? block : { ...block, exercises: block.exercises.map(replace) }) } : {}) };
  }
  return result;
}
