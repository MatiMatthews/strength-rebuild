import type { RepositoryDatabase } from '../../data/repositories';
import type { TodayData } from '../programs/program-service';
import { effectiveSession } from '../programs/legacy-repair';
import { proposeProgression, type ProgressionInput, type ProgressionProposal } from '../../domain/progression/propose-progression';
import { exerciseCatalog } from '../../data/seeds/exercises';

type Session = TodayData['session'];
const matches = (e: Session['exercises'][number], input: ProgressionInput) => e.exerciseId === input.exerciseId && (input.role !== 'main' || e.requirement === 'EXACT');
type Row = { id: string; cycle_id: string; inputs_json: string; output_json: string; decision: string | null };
type Target = { id: string; snapshot_json: string; week_index: number; day_index: number };
export type SessionChoice = 'ACCEPTED' | 'KEPT' | 'REJECTED';
export interface SessionRecommendation {
  id: string;
  exerciseName: string;
  reason: string;
  unavailable: string | null;
  before: ProgressionInput['target'] | null;
  after: ProgressionProposal['nextTarget'] | null;
  target: Target | null;
  fingerprint: string;
}
const reasons: Record<ProgressionProposal['action'], string> = {
  hold: 'Mantén la carga y las repeticiones: todavía no se cumplen los criterios para progresar.',
  add_reps: 'El trabajo completado permite añadir una repetición dentro del rango previsto.',
  add_load: 'El rango de repeticiones está completo: se propone el menor incremento permitido.',
  reduce_load: 'El trabajo o el esfuerzo registrado aconseja reducir la carga un cinco por ciento.',
  repeat_week: 'Las exposiciones recientes requieren revisar la semana. Esta recomendación no cambia el ciclo.',
};

/** Session recommendations never authorize a weekly transition or bypass workout readiness. */
export class SessionReviewService {
  private busy = false;
  constructor(private readonly db: RepositoryDatabase, private readonly now = () => new Date().toISOString()) {}

  async listPending(): Promise<SessionRecommendation[]> {
    const rows = await this.db.getAllAsync<Row>("SELECT id, cycle_id, inputs_json, output_json, decision FROM progression_proposal WHERE policy_version = 'progression-v1' AND decision IS NULL ORDER BY created_at, id");
    return Promise.all(rows.map(row => this.inspect(row)));
  }

  private async inspect(row: Row): Promise<SessionRecommendation> {
    let input: ProgressionInput;
    let output: ProgressionProposal;
    const empty = (unavailable: string): SessionRecommendation => ({ id: row.id, exerciseName: 'Recomendación de sesión', reason: 'Puedes conservar el plan sin aplicar cambios.', unavailable, before: null, after: null, target: null, fingerprint: JSON.stringify(row) });
    try {
      input = JSON.parse(row.inputs_json);
      output = JSON.parse(row.output_json);
      const calculated = proposeProgression(input);
      if (JSON.stringify(calculated) !== JSON.stringify(output)
        || ![input.target.sets, input.target.prescribedReps, input.target.load, output.nextTarget.sets, output.nextTarget.reps, output.nextTarget.load].every(Number.isFinite)
        || input.target.load < 0 || output.nextTarget.load < 0) return empty('La recomendación guardada no tiene datos verificables.');
    } catch { return empty('La recomendación guardada no tiene datos verificables.'); }
    const sourceId = (input as ProgressionInput & { sourceWorkoutId?: string }).sourceWorkoutId ?? row.id.replace(/-progression$/, '');
    const source = await this.db.getFirstAsync<{ week_index: number; day_index: number }>(
      `SELECT w.week_index, s.day_index FROM workout_session r JOIN session_plan s ON s.id = r.session_plan_id
       JOIN training_week w ON w.id = s.training_week_id JOIN cycle c ON c.id = w.cycle_id
       WHERE r.id = ? AND r.status = 'COMPLETED' AND c.id = ? AND c.status = 'ACTIVE'`, sourceId, row.cycle_id);
    let unavailable: string | null = source ? null : 'La sesión de origen ya no pertenece al ciclo activo.';
    let target: Target | null = null;
    if (source) {
      const targets = await this.db.getAllAsync<Target>(
        `SELECT s.id, s.snapshot_json, w.week_index, s.day_index FROM session_plan s JOIN training_week w ON w.id = s.training_week_id
         WHERE w.cycle_id = ? AND w.status IN ('PLANNED', 'ACTIVE') AND s.status = 'PLANNED'
         AND (w.week_index > ? OR (w.week_index = ? AND s.day_index > ?))
         AND NOT EXISTS (SELECT 1 FROM workout_session r WHERE r.session_plan_id = s.id)
         ORDER BY w.week_index, s.day_index`, row.cycle_id, source.week_index, source.week_index, source.day_index);
      for (const candidate of targets) {
        const original = JSON.parse(candidate.snapshot_json) as Session;
        const effective = await effectiveSession(this.db, candidate.id, original);
        // A legacy repair owns its original envelope; never invalidate it with a snapshot rewrite.
        if (JSON.stringify(effective) !== JSON.stringify(original)) continue;
        const exercises = effective.blocks ? effective.blocks.filter(b => b.role !== 'finish-review').flatMap(b => b.exercises) : effective.exercises;
        const matching = exercises.filter(e => matches(e, input));
        if (matching.length === 1 && matching[0]!.target.sets === input.target.sets
          && matching[0]!.target.reps.min === input.target.prescribedReps
          && (matching[0]!.calculatedLoad ?? 0) === input.target.load) { target = candidate; break; }
      }
      if (!target) unavailable = 'No hay una próxima exposición sin iniciar con la misma prescripción. Puedes mantener el plan.';
    }
    if (output.action === 'repeat_week') unavailable = 'Repetir una semana requiere una revisión semanal; aquí puedes mantener el plan.';
    const restriction = await this.db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM active_restriction');
    if ((restriction?.count ?? 0) > 0 || input.safetyFlagActive) unavailable = 'Hay una restricción de seguridad. Mantener el plan no elimina la preparación ni la restricción.';
    return { id: row.id, exerciseName: exerciseCatalog.find(e => e.id === input.exerciseId)?.name ?? 'Ejercicio de la sesión', reason: reasons[output.action], unavailable,
      before: input.target, after: output.nextTarget, target, fingerprint: JSON.stringify({ row, source, target, unavailable }) };
  }

  async decide(preview: SessionRecommendation, choice: SessionChoice): Promise<void> {
    if (!['ACCEPTED', 'KEPT', 'REJECTED'].includes(choice)) throw new Error('Decisión no válida');
    if (this.busy) throw new Error('Ya se está guardando una decisión');
    this.busy = true;
    try {
      await this.db.withTransactionAsync(async () => {
        const row = await this.db.getFirstAsync<Row>("SELECT id, cycle_id, inputs_json, output_json, decision FROM progression_proposal WHERE id = ? AND policy_version = 'progression-v1'", preview.id);
        if (!row || row.decision) throw new Error('Esta recomendación ya fue resuelta');
        const current = await this.inspect(row);
        if (choice === 'ACCEPTED' && (current.fingerprint !== preview.fingerprint || current.unavailable || !current.target)) throw new Error('La prescripción cambió o no se puede aplicar. Revisa la recomendación o mantén el plan.');
        const timestamp = this.now();
        const claimed = await this.db.runAsync('UPDATE progression_proposal SET decision = ?, decided_at = ?, updated_at = ? WHERE id = ? AND decision IS NULL', choice, timestamp, timestamp, row.id);
        if (claimed.changes !== 1) throw new Error('Esta recomendación ya fue resuelta');
        if (choice === 'ACCEPTED') {
          const input = JSON.parse(row.inputs_json) as ProgressionInput;
          const target = current.target!;
          const original = JSON.parse(target.snapshot_json) as Session;
          const tune = (e: Session['exercises'][number]) => !matches(e, input) ? e : { ...e, ...(current.after!.load !== input.target.load ? { calculatedLoad: current.after!.load } : {}),
            target: { ...e.target, sets: current.after!.sets, reps: { min: current.after!.reps, max: Math.max(e.target.reps.max, current.after!.reps) } } };
          const next = { ...original, exercises: original.exercises.map(tune), ...(original.blocks ? { blocks: original.blocks.map(b => b.role === 'finish-review' ? b : { ...b, exercises: b.exercises.map(tune) }) } : {}) };
          const changed = await this.db.runAsync("UPDATE session_plan SET snapshot_json = ?, updated_at = ? WHERE id = ? AND status = 'PLANNED' AND snapshot_json = ? AND NOT EXISTS (SELECT 1 FROM workout_session WHERE session_plan_id = ?)", JSON.stringify(next), timestamp, target.id, target.snapshot_json, target.id);
          if (changed.changes !== 1) throw new Error('La próxima sesión ya cambió');
        }
        await this.db.runAsync(`INSERT INTO decision_log (id, schema_version, created_at, updated_at, decision_type, policy_version, inputs_json, output_json, accepted, decided_at)
          VALUES (?, 1, ?, ?, 'SESSION_PROGRESSION', 'session-review-v1', ?, ?, ?, ?)`, `session-decision:${row.id}`, timestamp, timestamp,
          JSON.stringify({ proposalId: row.id, originalInputs: row.inputs_json, originalOutput: row.output_json, target: current.target }),
          JSON.stringify({ choice, nextTarget: choice === 'ACCEPTED' ? current.after : null }), choice === 'ACCEPTED' ? 1 : 0, timestamp);
      });
    } finally { this.busy = false; }
  }
}
