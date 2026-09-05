import { exerciseCatalog } from '../../data/seeds/exercises';
import { prescribeCatalogExercise } from '../../domain/prescriptions/generator';
import { resolveCatalogRequirements } from '../../domain/prescriptions/catalog-requirements';
import type { RepositoryDatabase } from '../../data/repositories';
import type { TodayData } from './program-service';

export const LEGACY_REPAIR_POLICY = 'legacy-prescription-repair-v1';
type Session = TodayData['session'];
export interface LegacyRepairProposal {
  readonly sessionPlanId: string;
  readonly cycleId: string;
  readonly originalExerciseId: string;
  readonly replacement: Session['exercises'][number];
  readonly source: string;
  readonly constraints: string;
  readonly settingsSource: string | null;
  readonly cycleKind: TodayData['cycleType'];
}

/** Originals remain in their snapshot columns; the accepted decision is the portable audit. */
export async function effectiveSession(db: RepositoryDatabase, sessionPlanId: string, original: Session): Promise<Session> {
  const rows = await db.getAllAsync<{ inputs_json: string; output_json: string }>(
    'SELECT inputs_json, output_json FROM decision_log WHERE policy_version = ? AND accepted = 1 ORDER BY created_at, id', LEGACY_REPAIR_POLICY,
  );
  let result = original;
  for (const row of rows) {
    const proposal = JSON.parse(row.inputs_json) as LegacyRepairProposal;
    if (proposal.sessionPlanId !== sessionPlanId) continue;
    const replacement = JSON.parse(row.output_json) as Session['exercises'][number];
    const replace = (exercise: Session['exercises'][number]) => exercise.exerciseId === proposal.originalExerciseId ? replacement : exercise;
    result = { ...result, exercises: result.exercises.map(replace),
      ...(result.blocks ? { blocks: result.blocks.map(block => block.role === 'finish-review' ? block : { ...block, exercises: block.exercises.map(replace) }) } : {}) };
  }
  return result;
}


/** Validate the immutable repair envelope before a backup can replace any local data.
 * Current workout status/settings may legitimately differ from the confirmation-time values.
 */
export function validateLegacyRepairBackup(tables: Record<string, Record<string, unknown>[]>) {
  const seen = new Set<string>();
  for (const row of tables.decision_log ?? []) {
    if (row.policy_version !== LEGACY_REPAIR_POLICY && row.decision_type !== 'legacy-prescription-repair') continue;
    const invalid = () => { throw new Error('Invalid legacy repair'); };
    if (row.policy_version !== LEGACY_REPAIR_POLICY || row.decision_type !== 'legacy-prescription-repair' || row.accepted !== 1) invalid();
    const proposal = JSON.parse(String(row.inputs_json)) as LegacyRepairProposal;
    const output = JSON.parse(String(row.output_json));
    if (!proposal || typeof proposal.sessionPlanId !== 'string' || typeof proposal.originalExerciseId !== 'string'
      || !proposal.originalExerciseId || typeof proposal.source !== 'string' || typeof proposal.constraints !== 'string'
      || !(proposal.settingsSource === null || typeof proposal.settingsSource === 'string')) invalid();
    const key = JSON.stringify([proposal.sessionPlanId, proposal.originalExerciseId]);
    if (row.id !== `legacy-repair:${key}` || seen.has(key)) invalid();
    seen.add(key);
    const session = tables.session_plan?.find(s => s.id === proposal.sessionPlanId);
    const week = tables.training_week?.find(w => w.id === session?.training_week_id);
    const cycle = tables.cycle?.find(c => c.id === week?.cycle_id);
    if (!session || session.snapshot_json !== proposal.source || cycle?.id !== proposal.cycleId || cycle?.kind !== proposal.cycleKind) invalid();
    const source = JSON.parse(proposal.source) as Session;
    const exercises = [...source.exercises, ...(source.blocks ?? []).filter(b => b.role !== 'finish-review').flatMap(b => b.exercises)];
    if (!exercises.some(e => e.exerciseId === proposal.originalExerciseId)
      || exerciseCatalog.some(e => e.id === proposal.originalExerciseId && e.pattern !== 'review')) invalid();
    const constraints = JSON.parse(proposal.constraints);
    if (!Array.isArray(constraints.equipment) || !Array.isArray(constraints.restrictions)
      || ![...constraints.equipment, ...constraints.restrictions].every(v => typeof v === 'string')) invalid();
    const [choice] = resolveCatalogRequirements({ id: 'replacement-preview', type: proposal.cycleKind, weeks: 1,
      equipment: constraints.equipment, restrictions: constraints.restrictions,
      requirements: [{ kind: 'EXACT', value: proposal.replacement.exerciseId }] });
    const expected = prescribeCatalogExercise({ type: proposal.cycleKind }, choice!, 'EXACT',
      choice!.tags.includes('power') ? { power: true, plyometric: choice!.impact !== 'none' } : {});
    if (JSON.stringify(expected) !== JSON.stringify(proposal.replacement) || JSON.stringify(output) !== JSON.stringify(proposal.replacement)) invalid();
  }
}
