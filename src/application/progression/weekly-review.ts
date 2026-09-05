import type { RepositoryDatabase } from '../../data/repositories';

export const WEEKLY_REVIEW_POLICY_VERSION = 'weekly-review-v1';
export type WeekOutcome = 'successful' | 'missed' | 'failed' | 'restricted' | 'repeated';
export type WeeklyAction = 'progress' | 'reduce' | 'repeat' | 'hold';
export type WeeklyChoice = 'ACCEPTED' | 'KEPT' | 'REJECTED';
export interface WeeklyReviewInput { cycleId: string; weekIndex: number; nextWeekIndex: number; outcome: WeekOutcome }
export interface WeeklyProposal extends WeeklyReviewInput { id: string; action: WeeklyAction; explanation: string }
type ProposalRow = { id: string; cycle_id: string; inputs_json: string; output_json: string; decision: string | null };
export interface PendingWeek { cycleId: string; weekIndex: number }
const decisions: Record<WeekOutcome, Pick<WeeklyProposal, 'action' | 'explanation'>> = {
  successful: { action: 'progress', explanation: 'Semana completada. Registra que estás listo para revisar la próxima exposición.' },
  missed: { action: 'reduce', explanation: 'Faltó trabajo prescrito. Registra que la próxima exposición necesita menos demanda.' },
  failed: { action: 'repeat', explanation: 'No se cumplieron los criterios. Registra la necesidad de repetir sin avance automático.' },
  restricted: { action: 'hold', explanation: 'Restricción declarada. Registra mantener el plan; la seguridad se comprueba antes de entrenar.' },
  repeated: { action: 'repeat', explanation: 'Semana repetida. Registra una nueva revisión sin avance automático.' },
};

/** Weekly review records a decision; it never invents or silently applies load targets. */
export class WeeklyReviewService {
  private busy = false;
  constructor(private readonly db: RepositoryDatabase, private readonly now = () => new Date().toISOString(), private readonly createId = () => `weekly-${Date.now()}-${Math.random().toString(36).slice(2)}`) {}

  async listPendingWeeks(cycleId?: string): Promise<PendingWeek[]> {
    return this.db.getAllAsync<PendingWeek>(`SELECT w.cycle_id AS cycleId, w.week_index AS weekIndex FROM training_week w
      JOIN cycle c ON c.id = w.cycle_id WHERE c.status = 'ACTIVE' AND w.status = 'REVIEW'
      ${cycleId ? 'AND c.id = ?' : ''} ORDER BY w.week_index`, ...(cycleId ? [cycleId] : []));
  }

  async isEligible(cycleId: string, weekIndex: number): Promise<boolean> {
    const row = await this.db.getFirstAsync<{ required_count: number; terminal_count: number }>(
      `SELECT COUNT(s.id) AS required_count,
       SUM(CASE WHEN s.status IN ('COMPLETED', 'SKIPPED') THEN 1 ELSE 0 END) AS terminal_count
       FROM session_plan s JOIN training_week w ON w.id = s.training_week_id
       JOIN cycle c ON c.id = w.cycle_id
       WHERE w.cycle_id = ? AND w.week_index = ? AND w.status = 'REVIEW' AND c.status = 'ACTIVE'`, cycleId, weekIndex);
    return Boolean(row && row.required_count > 0 && row.required_count === row.terminal_count);
  }

  async load(cycleId: string, weekIndex: number): Promise<WeeklyProposal | null> {
    const rows = await this.db.getAllAsync<ProposalRow>(
      'SELECT id, cycle_id, inputs_json, output_json, decision FROM progression_proposal WHERE cycle_id = ? AND policy_version = ? AND decision IS NULL ORDER BY created_at, id', cycleId, WEEKLY_REVIEW_POLICY_VERSION);
    for (const row of rows) {
      const input = JSON.parse(row.inputs_json) as WeeklyReviewInput;
      if (input.weekIndex === weekIndex) return this.decode(row);
    }
    return null;
  }

  private decode(row: ProposalRow): WeeklyProposal {
    const input = JSON.parse(row.inputs_json) as WeeklyReviewInput;
    if (input.cycleId !== row.cycle_id || !Number.isInteger(input.weekIndex) || input.weekIndex < 1
      || input.nextWeekIndex !== input.weekIndex + 1 || !Object.hasOwn(decisions, input.outcome)) throw new Error('La revisión guardada no tiene datos verificables.');
    // Historical output may contain suggested targets. They are not an authorized prescription.
    return { ...input, id: row.id, ...decisions[input.outcome] };
  }

  async propose(input: WeeklyReviewInput): Promise<WeeklyProposal> {
    if (this.busy) throw new Error('Ya se está guardando una revisión.');
    this.busy = true;
    try {
      let proposal!: WeeklyProposal;
      await this.db.withTransactionAsync(async () => {
        if (!(await this.isEligible(input.cycleId, input.weekIndex)) || input.nextWeekIndex !== input.weekIndex + 1 || !Object.hasOwn(decisions, input.outcome)) throw new Error('Esta semana no tiene una revisión pendiente. Vuelve a Hoy.');
        const existing = await this.load(input.cycleId, input.weekIndex);
        if (existing) { proposal = existing; return; }
        proposal = { ...input, id: this.createId(), ...decisions[input.outcome] };
        const timestamp = this.now();
        await this.db.runAsync(`INSERT INTO progression_proposal (id, schema_version, created_at, updated_at, cycle_id, policy_version, inputs_json, output_json)
          VALUES (?, 1, ?, ?, ?, ?, ?, ?)`, proposal.id, timestamp, timestamp, input.cycleId, WEEKLY_REVIEW_POLICY_VERSION, JSON.stringify(input), JSON.stringify(proposal));
      });
      return proposal;
    } finally { this.busy = false; }
  }

  async decide(id: string, selected: WeeklyChoice | boolean): Promise<void> {
    const choice = typeof selected === 'boolean' ? selected ? 'ACCEPTED' : 'REJECTED' : selected;
    if (!['ACCEPTED', 'KEPT', 'REJECTED'].includes(choice)) throw new Error('Decisión no válida.');
    if (this.busy) throw new Error('Ya se está guardando una revisión.');
    this.busy = true;
    try {
      await this.db.withTransactionAsync(async () => {
        const row = await this.db.getFirstAsync<ProposalRow>('SELECT id, cycle_id, inputs_json, output_json, decision FROM progression_proposal WHERE id = ? AND policy_version = ?', id, WEEKLY_REVIEW_POLICY_VERSION);
        if (!row || row.decision) throw new Error('Esta revisión ya fue resuelta o no está disponible. Vuelve a Hoy.');
        const proposal = this.decode(row);
        if (!(await this.isEligible(proposal.cycleId, proposal.weekIndex))) throw new Error('La semana cambió. Vuelve a Hoy para revisar el estado actual.');
        const timestamp = this.now();
        const claimed = await this.db.runAsync('UPDATE progression_proposal SET decision = ?, decided_at = ?, updated_at = ? WHERE id = ? AND decision IS NULL', choice, timestamp, timestamp, id);
        if (claimed.changes !== 1) throw new Error('Esta revisión ya fue resuelta.');
        const completed = await this.db.runAsync("UPDATE training_week SET status = 'COMPLETED', updated_at = ? WHERE cycle_id = ? AND week_index = ? AND status = 'REVIEW'", timestamp, proposal.cycleId, proposal.weekIndex);
        if (completed.changes !== 1) throw new Error('La semana cambió.');
        // Close historical duplicate rows explicitly, preserving their original inputs/output.
        const duplicates = await this.db.getAllAsync<ProposalRow>('SELECT id, cycle_id, inputs_json, output_json, decision FROM progression_proposal WHERE cycle_id = ? AND policy_version = ? AND decision IS NULL', proposal.cycleId, WEEKLY_REVIEW_POLICY_VERSION);
        const superseded: string[] = [];
        for (const duplicate of duplicates) {
          if ((JSON.parse(duplicate.inputs_json) as WeeklyReviewInput).weekIndex !== proposal.weekIndex) continue;
          await this.db.runAsync("UPDATE progression_proposal SET decision = 'REJECTED', decided_at = ?, updated_at = ? WHERE id = ? AND decision IS NULL", timestamp, timestamp, duplicate.id);
          superseded.push(duplicate.id);
        }
        await this.db.runAsync(`INSERT INTO decision_log (id, schema_version, created_at, updated_at, decision_type, policy_version, inputs_json, output_json, accepted, decided_at)
          VALUES (?, 1, ?, ?, 'WEEKLY_PROGRESSION', ?, ?, ?, ?, ?)`, `decision-${id}`, timestamp, timestamp, WEEKLY_REVIEW_POLICY_VERSION,
          JSON.stringify({ proposal, originalInputs: row.inputs_json, originalOutput: row.output_json }), JSON.stringify({ choice, action: proposal.action, prescriptionsChanged: false, superseded }), choice === 'ACCEPTED' ? 1 : 0, timestamp);
      });
    } finally { this.busy = false; }
  }
}
