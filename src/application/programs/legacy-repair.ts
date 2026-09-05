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
