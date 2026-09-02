import type { RepositoryDatabase } from '../../data/repositories';

export const WEEKLY_REVIEW_POLICY_VERSION = 'weekly-review-v1';
export type WeekOutcome = 'successful' | 'missed' | 'failed' | 'restricted' | 'repeated';
export type WeeklyAction = 'progress' | 'reduce' | 'repeat' | 'hold';

export interface WeeklyReviewInput { cycleId: string; weekIndex: number; nextWeekIndex: number; outcome: WeekOutcome }
export interface WeeklyProposal extends WeeklyReviewInput { id: string; action: WeeklyAction; explanation: string }
type DecidableProposal = WeeklyProposal & {
  exerciseId?: string;
  nextTarget?: { sets: number; reps: number; load: number };
  policyVersion?: string;
};
type ProposalRow = { cycle_id: string; inputs_json: string; output_json: string; decision: string | null };
type WeekRow = { snapshot_json: string };
type EligibilityRow = { required_count: number; terminal_count: number };

const decisions: Record<WeekOutcome, Pick<WeeklyProposal, 'action' | 'explanation'>> = {
  successful: { action: 'progress', explanation: 'La semana se completó: propone avanzar la próxima exposición.' },
  missed: { action: 'reduce', explanation: 'Faltó trabajo prescrito: propone reducir la demanda de la próxima exposición.' },
  failed: { action: 'repeat', explanation: 'La semana no cumplió los criterios: propone repetirla sin avance automático.' },
  restricted: { action: 'hold', explanation: 'Hay una restricción activa: mantiene el plan y solicita revisión.' },
  repeated: { action: 'repeat', explanation: 'La semana ya fue repetida: conserva una nueva repetición explícita.' },
};

export class WeeklyReviewService {
  private readonly pending = new Map<string, WeeklyProposal>();
  constructor(private readonly db: RepositoryDatabase, private readonly now = () => new Date().toISOString(), private readonly createId = () => `weekly-${Date.now()}`) {}

  async isEligible(cycleId: string, weekIndex: number): Promise<boolean> {
    const row = await this.db.getFirstAsync<EligibilityRow>(
      `SELECT COUNT(s.id) AS required_count,
              SUM(CASE WHEN s.status IN ('COMPLETED', 'SKIPPED') THEN 1 ELSE 0 END) AS terminal_count
       FROM session_plan s
       JOIN training_week w ON w.id = s.training_week_id
       WHERE w.cycle_id = ? AND w.week_index = ?`,
      cycleId, weekIndex,
    );
    return Boolean(row && row.required_count > 0 && row.required_count === row.terminal_count);
  }

  async propose(input: WeeklyReviewInput): Promise<WeeklyProposal> {
    const id = this.createId();
    const proposal: WeeklyProposal = { ...input, id, ...decisions[input.outcome] };
    await this.db.runAsync(
      `INSERT INTO progression_proposal (id, schema_version, created_at, updated_at, cycle_id, policy_version, inputs_json, output_json)
       VALUES (?, 1, ?, ?, ?, ?, ?, ?)`,
      id, this.now(), this.now(), input.cycleId, WEEKLY_REVIEW_POLICY_VERSION, JSON.stringify(input), JSON.stringify(proposal),
    );
    this.pending.set(id, proposal);
    return proposal;
  }

  async decide(id: string, accepted: boolean): Promise<void> {
    const row = await this.db.getFirstAsync<ProposalRow>('SELECT cycle_id, inputs_json, output_json, decision FROM progression_proposal WHERE id = ?', id);
    const proposal: DecidableProposal | undefined = row
      ? { cycleId: row.cycle_id, ...JSON.parse(row.inputs_json), ...JSON.parse(row.output_json) } as DecidableProposal
      : this.pending.get(id);
    if (!proposal) throw new Error(`Progression proposal ${id} does not exist`);
    if (row?.decision) throw new Error(`Progression proposal ${id} was already decided`);
    const timestamp = this.now();
    await this.db.withTransactionAsync(async () => {
      if (accepted) {
        const week = await this.db.getFirstAsync<WeekRow>('SELECT snapshot_json FROM training_week WHERE cycle_id = ? AND week_index = ?', proposal.cycleId, proposal.nextWeekIndex);
        if (!week) throw new Error('The proposed future week does not exist');
        const snapshot = { ...(JSON.parse(week.snapshot_json) as object), reviewAdjustment: { action: proposal.action, proposalId: id } };
        await this.db.runAsync('UPDATE training_week SET snapshot_json = ?, updated_at = ? WHERE cycle_id = ? AND week_index = ?', JSON.stringify(snapshot), timestamp, proposal.cycleId, proposal.nextWeekIndex);
        if (Number.isInteger(proposal.weekIndex)) {
          await this.db.runAsync(
            "UPDATE training_week SET status = 'COMPLETED', updated_at = ? WHERE cycle_id = ? AND week_index = ? AND status = 'REVIEW'",
            timestamp, proposal.cycleId, proposal.weekIndex,
          );
        }
        if (proposal.exerciseId && proposal.nextTarget) {
          const sessions = await this.db.getAllAsync<{ id: string; snapshot_json: string }>(
            `SELECT s.id, s.snapshot_json FROM session_plan s
             JOIN training_week w ON w.id = s.training_week_id
             WHERE w.cycle_id = ? AND w.week_index = ? AND w.status = 'PLANNED' AND s.status = 'PLANNED'`,
            proposal.cycleId, proposal.nextWeekIndex,
          );
          let applied = 0;
          const tune = (exercise: Record<string, unknown>) => {
            if (exercise.exerciseId !== proposal.exerciseId) return exercise;
            applied += 1;
            return {
              ...exercise,
              calculatedLoad: proposal.nextTarget!.load,
              target: {
                ...(exercise.target as object),
                sets: proposal.nextTarget!.sets,
                reps: { min: proposal.nextTarget!.reps, max: proposal.nextTarget!.reps },
              },
            };
          };
          for (const session of sessions) {
            const appliedBeforeSession = applied;
            const value = JSON.parse(session.snapshot_json) as Record<string, unknown>;
            const updated = {
              ...value,
              blocks: Array.isArray(value.blocks) ? value.blocks.map((block) => ({
                ...(block as object),
                exercises: ((block as { exercises?: Record<string, unknown>[] }).exercises ?? []).map(tune),
              })) : value.blocks,
              exercises: Array.isArray(value.exercises) ? value.exercises.map(tune) : value.exercises,
            };
            if (applied > appliedBeforeSession) {
              await this.db.runAsync(
                'UPDATE session_plan SET snapshot_json = ?, updated_at = ? WHERE id = ? AND status = \'PLANNED\'',
                JSON.stringify({ ...updated, progression: { proposalId: id, policyVersion: proposal.policyVersion, explanation: proposal.explanation } }),
                timestamp, session.id,
              );
            }
          }
          if (applied === 0) throw new Error('The proposal has no matching future planned target');
        }
      }
      await this.db.runAsync('UPDATE progression_proposal SET decision = ?, decided_at = ?, updated_at = ? WHERE id = ?', accepted ? 'ACCEPTED' : 'REJECTED', timestamp, timestamp, id);
      await this.db.runAsync(
        `INSERT INTO decision_log (id, schema_version, created_at, updated_at, decision_type, policy_version, inputs_json, output_json, accepted, decided_at)
         VALUES (?, 1, ?, ?, 'WEEKLY_PROGRESSION', ?, ?, ?, ?, ?)`,
        `decision-${id}`, timestamp, timestamp, WEEKLY_REVIEW_POLICY_VERSION, JSON.stringify(proposal), JSON.stringify({ action: proposal.action }), accepted ? 1 : 0, timestamp,
      );
    });
    this.pending.delete(id);
  }
}
