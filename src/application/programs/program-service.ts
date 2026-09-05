import { effectiveSession, LEGACY_REPAIR_POLICY, type LegacyRepairProposal } from './legacy-repair';
import { resolveTrainingSettings, type TrainingSettings } from '../../features/settings/settings';
import { exerciseCatalog } from '../../data/seeds/exercises';
import {
  generateCycleSequence,
  prescribeCatalogExercise,
  type CyclePrescriptionRequest,
  type CyclePrescriptionSnapshot,
} from '../../domain/prescriptions/generator';
import { resolveCatalogRequirements } from '../../domain/prescriptions/catalog-requirements';
import type { RepositoryDatabase } from '../../data/repositories';

type CycleRow = { snapshot_json: string };
type IdRow = { id: string };
type CountRow = { count: number };
type CycleKindRow = { kind: CyclePrescriptionSnapshot['type']; status: string; rowid: number };

function requestFingerprint(requests: readonly CyclePrescriptionRequest[]): string {
  const input = JSON.stringify(requests);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

type TodayRow = {
  session_plan_id: string;
  cycle_id: string;
  cycle_kind: CyclePrescriptionSnapshot['type'];
  cycle_snapshot_json: string;
  week_index: number;
  day_index: number;
  session_snapshot_json: string;
};

export interface TodayData {
  readonly sessionPlanId?: string;
  readonly cycleId: string;
  readonly cycleType: CyclePrescriptionSnapshot['type'];
  readonly weekIndex: number;
  readonly dayIndex: number;
  readonly cycle: CyclePrescriptionSnapshot;
  readonly session: CyclePrescriptionSnapshot['weeks'][number]['sessions'][number];
}

export interface InvalidSessionReference {
  readonly cycleId: string;
  readonly sessionPlanId: string;
  readonly weekIndex: number;
  readonly dayIndex: number;
  readonly invalidExerciseIds: readonly string[];
  readonly unstarted: boolean;
  readonly repairable?: boolean;
}

export interface TodayContext {
  readonly activeSession: boolean;
  readonly restrictionActive: boolean;
  readonly reviewRequired: boolean;
  readonly today: TodayData | null;
}

export class ProgramService {
  constructor(
    private readonly db: RepositoryDatabase,
    private readonly now = () => new Date().toISOString(),
  ) {}

  async createPlan(requests: readonly CyclePrescriptionRequest[]): Promise<readonly CyclePrescriptionSnapshot[]> {
    const fingerprint = requestFingerprint(requests);
    const requestedSnapshots = generateCycleSequence(requests);
    let collision = false;
    for (const snapshot of requestedSnapshots) {
      const stored = await this.db.getFirstAsync<CycleRow>('SELECT snapshot_json FROM cycle WHERE id = ?', snapshot.id);
      if (stored && stored.snapshot_json !== JSON.stringify(snapshot)) collision = true;
    }
    const snapshots = collision
      ? generateCycleSequence(requests.map((request) => ({ ...request, id: `${request.id}-${fingerprint}` })))
      : requestedSnapshots;
    const timestamp = this.now();
    const templateId = `program-${fingerprint}`;

    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        `INSERT OR IGNORE INTO program_template
         (id, schema_version, created_at, updated_at, name, version, snapshot_json)
         VALUES (?, 1, ?, ?, ?, 1, ?)`,
        templateId, timestamp, timestamp, 'Generated training plan', JSON.stringify(snapshots),
      );

      for (const cycle of snapshots) {
        await this.db.runAsync(
          `INSERT OR IGNORE INTO cycle
           (id, schema_version, created_at, updated_at, program_template_id, kind, status, policy_version, snapshot_json)
           VALUES (?, 1, ?, ?, ?, ?, 'READY', ?, ?)`,
          cycle.id, timestamp, timestamp, templateId, cycle.type, cycle.policyVersion, JSON.stringify(cycle),
        );
        for (const week of cycle.weeks) {
          const weekId = `${cycle.id}-week-${week.index}`;
          await this.db.runAsync(
            `INSERT OR IGNORE INTO training_week
             (id, schema_version, created_at, updated_at, cycle_id, week_index, status, snapshot_json)
             VALUES (?, 1, ?, ?, ?, ?, 'PLANNED', ?)`,
            weekId, timestamp, timestamp, cycle.id, week.index, JSON.stringify(week),
          );
          for (const [sessionIndex, session] of week.sessions.entries()) {
            await this.db.runAsync(
              `INSERT OR IGNORE INTO session_plan
               (id, schema_version, created_at, updated_at, training_week_id, day_index, status, snapshot_json)
               VALUES (?, 1, ?, ?, ?, ?, 'PLANNED', ?)`,
              `${weekId}-day-${sessionIndex + 1}`, timestamp, timestamp, weekId, sessionIndex + 1, JSON.stringify(session),
            );
          }
        }
      }
    });
    return snapshots;
  }

  async listCycleSnapshots(): Promise<readonly CyclePrescriptionSnapshot[]> {
    const rows = await this.db.getAllAsync<CycleRow>('SELECT snapshot_json FROM cycle ORDER BY rowid');
    const sessions = await this.db.getAllAsync<CycleRow & { id: string; cycle_id: string; week_index: number; day_index: number }>(
      `SELECT s.id, w.cycle_id, w.week_index, s.day_index, s.snapshot_json
       FROM session_plan s JOIN training_week w ON w.id = s.training_week_id`,
    );
    for (const session of sessions) session.snapshot_json = JSON.stringify(await effectiveSession(this.db, session.id, JSON.parse(session.snapshot_json) as TodayData['session']));
    return rows.map(({ snapshot_json }) => {
      const cycle = JSON.parse(snapshot_json) as CyclePrescriptionSnapshot;
      const storedSessions = sessions.filter((session) => session.cycle_id === cycle.id);
      return { ...cycle, weeks: cycle.weeks.map((week) => ({
        ...week,
        sessions: week.sessions.map((session, index) => {
          // The relational day is the session ordinal, not the scheduled weekday.
          const stored = storedSessions.find((row) => row.week_index === week.index && row.day_index === index + 1);
          return stored ? JSON.parse(stored.snapshot_json) as TodayData['session'] : session;
        }),
      })) };
    });
  }

  /** Read-only inventory: any recorded workout protects a session, regardless of its status. */
  async listInvalidSessionReferences(): Promise<readonly InvalidSessionReference[]> {
    const rows = await this.db.getAllAsync<{
      id: string; cycle_id: string; week_index: number; day_index: number;
      snapshot_json: string; status: string; cycle_status: string; has_workout: number;
    }>(`SELECT s.id, w.cycle_id, w.week_index, s.day_index, s.snapshot_json, s.status, c.status AS cycle_status,
        EXISTS(SELECT 1 FROM workout_session recorded WHERE recorded.session_plan_id = s.id) AS has_workout
      FROM session_plan s JOIN training_week w ON w.id = s.training_week_id
      JOIN cycle c ON c.id = w.cycle_id ORDER BY c.rowid, w.week_index, s.day_index`);
    const available = new Set(exerciseCatalog.filter((entry) => entry.pattern !== 'review').map((entry) => entry.id));
    for (const row of rows) row.snapshot_json = JSON.stringify(await effectiveSession(this.db, row.id, JSON.parse(row.snapshot_json) as TodayData['session']));
    return rows.flatMap((row) => {
      const session = JSON.parse(row.snapshot_json) as TodayData['session'];
      const exercises = [...session.exercises,
        ...(session.blocks ?? []).filter((block) => block.role !== 'finish-review').flatMap((block) => block.exercises)];
      const invalidExerciseIds = [...new Set(exercises.filter((exercise) => !available.has(exercise.exerciseId)).map((exercise) => exercise.exerciseId))];
      return invalidExerciseIds.length ? [{ cycleId: row.cycle_id, sessionPlanId: row.id,
        weekIndex: row.week_index, dayIndex: row.day_index, invalidExerciseIds,
        repairable: row.status === 'PLANNED' && ['READY', 'ACTIVE'].includes(row.cycle_status) && !row.has_workout,
        unstarted: row.status === 'PLANNED' && ['READY', 'ACTIVE'].includes(row.cycle_status) && !row.has_workout }] : [];
    });
  }

  /** An explicit choice is only a preview: never infer identity or transfer a legacy load. */
  async previewLegacyReplacement(
    sessionPlanId: string, invalidExerciseId: string, replacementId: string,
    constraints: Pick<CyclePrescriptionRequest, 'equipment' | 'restrictions'>,
  ): Promise<TodayData['session']['exercises'][number]> {
    const reference = (await this.listInvalidSessionReferences()).find((entry) => entry.sessionPlanId === sessionPlanId);
    if (!reference?.invalidExerciseIds.includes(invalidExerciseId)) throw new Error('La referencia ya no necesita reparación. Vuelve a abrir el plan.');
    if (!reference.unstarted) throw new Error('La sesión está iniciada o cerrada. Se conserva el trabajo original.');
    const row = await this.db.getFirstAsync<{ kind: CyclePrescriptionSnapshot['type'] }>('SELECT kind FROM cycle WHERE id = ?', reference.cycleId);
    if (!row) throw new Error('El ciclo ya no está disponible.');
    const [replacement] = resolveCatalogRequirements({ id: 'replacement-preview', type: row.kind, weeks: 1,
      ...constraints, requirements: [{ kind: 'EXACT', value: replacementId }] });
    return prescribeCatalogExercise({ type: row.kind }, replacement!, 'EXACT',
      replacement!.tags.includes('power') ? { power: true, plyometric: replacement!.impact !== 'none' } : {});
  }

  private async repairConstraints(): Promise<{ constraints: string; settingsSource: string | null }> {
    const row = await this.db.getFirstAsync<{ value_json: string }>('SELECT value_json FROM app_setting WHERE key = ?', 'training-settings');
    const settings = resolveTrainingSettings(row ? JSON.parse(row.value_json) as TrainingSettings : undefined);
    const restrictions = await this.db.getAllAsync('SELECT * FROM active_restriction WHERE active = 1 ORDER BY id');
    // Persisted restrictions are safety state; this repair cannot infer an equivalent prescription.
    if (restrictions.length) throw new Error('Hay una restricción activa. Revisa la seguridad antes de reparar el plan.');
    return { constraints: JSON.stringify({ equipment: settings.equipment, restrictions: settings.restrictions }), settingsSource: row?.value_json ?? null };
  }

  async prepareLegacyRepair(sessionPlanId: string, originalExerciseId: string, replacementId: string): Promise<LegacyRepairProposal> {
    const reference = (await this.listInvalidSessionReferences()).find(entry => entry.sessionPlanId === sessionPlanId);
    if (!reference?.repairable) throw new Error('Solo se pueden reparar sesiones sin iniciar en ciclos listos o activos. Se conserva el trabajo registrado.');
    if (!reference.invalidExerciseIds.includes(originalExerciseId)) throw new Error('La referencia ya no necesita reparación. Vuelve a abrir el plan.');
    const { constraints, settingsSource } = await this.repairConstraints();
    const row = await this.db.getFirstAsync<{ snapshot_json: string; kind: TodayData['cycleType'] }>(
      'SELECT s.snapshot_json, c.kind FROM session_plan s JOIN training_week w ON w.id = s.training_week_id JOIN cycle c ON c.id = w.cycle_id WHERE s.id = ?', sessionPlanId);
    if (!row) throw new Error('La sesión ya no está disponible.');
    const [choice] = resolveCatalogRequirements({ id: 'replacement-preview', type: row.kind, weeks: 1,
      ...JSON.parse(constraints), requirements: [{ kind: 'EXACT', value: replacementId }] });
    const replacement = prescribeCatalogExercise({ type: row.kind }, choice!, 'EXACT',
      choice!.tags.includes('power') ? { power: true, plyometric: choice!.impact !== 'none' } : {});
    return { sessionPlanId, cycleId: reference.cycleId, originalExerciseId, replacement, source: row.snapshot_json, constraints, settingsSource, cycleKind: row.kind };
  }

  async applyLegacyRepair(proposal: LegacyRepairProposal): Promise<void> {
    const id = `legacy-repair:${JSON.stringify([proposal.sessionPlanId, proposal.originalExerciseId])}`;
    const alreadyApplied = async () => {
      const existing = await this.db.getFirstAsync<{ inputs_json: string }>('SELECT inputs_json FROM decision_log WHERE id = ?', id);
      if (!existing) return false;
      if (existing.inputs_json !== JSON.stringify(proposal)) throw new Error('La referencia ya fue reparada. Vuelve a abrir el plan.');
      return true;
    };
    if (await alreadyApplied()) return;
    const fresh = await this.prepareLegacyRepair(proposal.sessionPlanId, proposal.originalExerciseId, proposal.replacement.exerciseId);
    if (JSON.stringify(fresh) !== JSON.stringify(proposal)) throw new Error('La propuesta cambió. Revisa el plan y confirma una propuesta nueva.');
    const timestamp = this.now();
    // One conditional statement is the transaction. It neither admits stale writes
    // nor rolls back unrelated work that arrives on the shared SQLite connection.
    const result = await this.db.runAsync(`INSERT OR IGNORE INTO decision_log
      (id, schema_version, created_at, updated_at, decision_type, policy_version, inputs_json, output_json, accepted, decided_at)
      SELECT ?, 1, ?, ?, 'legacy-prescription-repair', ?, ?, ?, 1, ?
      FROM session_plan s JOIN training_week w ON w.id = s.training_week_id JOIN cycle c ON c.id = w.cycle_id
      WHERE s.id = ? AND s.status = 'PLANNED' AND s.snapshot_json = ? AND c.id = ? AND c.kind = ? AND c.status IN ('READY', 'ACTIVE')
        AND (SELECT value_json FROM app_setting WHERE key = 'training-settings') IS ?
        AND NOT EXISTS(SELECT 1 FROM active_restriction WHERE active = 1)
        AND NOT EXISTS(SELECT 1 FROM workout_session recorded WHERE recorded.session_plan_id = s.id)`,
      id, timestamp, timestamp, LEGACY_REPAIR_POLICY, JSON.stringify(proposal), JSON.stringify(proposal.replacement), timestamp,
      proposal.sessionPlanId, proposal.source, proposal.cycleId, proposal.cycleKind, proposal.settingsSource);
    if (result.changes !== 1 && !await alreadyApplied()) throw new Error('La propuesta cambió. Revisa el plan y confirma una propuesta nueva.');
  }

  async getActiveCycleId(): Promise<string | null> {
    return (await this.db.getFirstAsync<IdRow>("SELECT id FROM cycle WHERE status = 'ACTIVE' LIMIT 1"))?.id ?? null;
  }

  async activateCycle(id: string): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      await this.validateActivation(id);
      await this.db.runAsync(
        "UPDATE cycle SET status = CASE WHEN id = ? THEN 'ACTIVE' ELSE 'READY' END, updated_at = ? WHERE status = 'ACTIVE' OR (id = ? AND status = 'READY')",
        id, this.now(), id,
      );
      if (await this.getActiveCycleId() !== id) throw new Error(`Cycle ${id} is not ready for activation`);
    });
  }

  private async validateActivation(id: string): Promise<void> {
    const row = await this.db.getFirstAsync<CycleRow & { status: string }>(
      'SELECT snapshot_json, status FROM cycle WHERE id = ?', id,
    );
    if (!row || !['READY', 'ACTIVE'].includes(row.status)) throw new Error(`Cycle ${id} is not ready for activation`);
    const validateSession = (session: TodayData['session']) => {
      const workout = [
        ...session.exercises,
        ...(session.blocks ?? []).filter((block) => block.role !== 'finish-review').flatMap((block) => block.exercises),
      ];
      for (const exercise of workout) {
        if (!exerciseCatalog.some((entry) => entry.id === exercise.exerciseId && entry.pattern !== 'review')) {
          throw new Error('El plan contiene un ejercicio fuera del catálogo. Revisa el plan antes de activarlo.');
        }
      }
    };
    const cycle = JSON.parse(row.snapshot_json) as CyclePrescriptionSnapshot;
    for (const week of cycle.weeks) for (const [index, session] of week.sessions.entries()) {
      const stored = await this.db.getFirstAsync<{ id: string }>('SELECT s.id FROM session_plan s JOIN training_week w ON w.id = s.training_week_id WHERE w.cycle_id = ? AND w.week_index = ? AND s.day_index = ?', id, week.index, index + 1);
      validateSession(stored ? await effectiveSession(this.db, stored.id, session) : session);
    }
    const sessions = await this.db.getAllAsync<CycleRow & { id: string }>(
      'SELECT s.id, s.snapshot_json FROM session_plan s JOIN training_week w ON w.id = s.training_week_id WHERE w.cycle_id = ?', id,
    );
    for (const session of sessions) validateSession(await effectiveSession(this.db, session.id, JSON.parse(session.snapshot_json) as TodayData['session']));
  }

  /** Applies an explicitly confirmed lifecycle step; time alone never calls this seam. */
  async completeCycleAndActivateNext(currentId: string, nextId: string): Promise<void> {
    if (currentId === nextId) throw new Error('The next cycle must differ from the completed cycle');
    const [current, next] = await Promise.all([
      this.db.getFirstAsync<CycleKindRow>('SELECT rowid, kind, status FROM cycle WHERE id = ?', currentId),
      this.db.getFirstAsync<CycleKindRow>('SELECT rowid, kind, status FROM cycle WHERE id = ?', nextId),
    ]);
    if (!current || !next) throw new Error('Both current and next cycles must exist');
    if (current.status === 'COMPLETED' && next.status === 'ACTIVE') return;
    if (next.rowid !== current.rowid + 1) throw new Error('Only the adjacent confirmed transition cycle can be activated');
    const loadingCycles: readonly CyclePrescriptionSnapshot['type'][] = ['hypertrophy', 'strength', 'power'];
    if (loadingCycles.includes(current.kind) && loadingCycles.includes(next.kind) && current.kind !== next.kind) {
      throw new Error('A confirmed transition cycle is required between different loading cycles');
    }
    const timestamp = this.now();
    await this.db.withTransactionAsync(async () => {
      await this.validateActivation(nextId);
      const unfinished = await this.db.getFirstAsync<CountRow>(
        "SELECT COUNT(*) AS count FROM training_week WHERE cycle_id = ? AND status <> 'COMPLETED'",
        currentId,
      );
      if ((unfinished?.count ?? 0) > 0 && current.kind !== 'transition') {
        const acceptedReview = await this.db.getFirstAsync<CountRow>(
          "SELECT COUNT(*) AS count FROM decision_log WHERE policy_version = 'weekly-review-v1' AND accepted = 1 AND inputs_json LIKE ?",
          `%\"cycleId\":\"${currentId}\"%`,
        );
        if ((acceptedReview?.count ?? 0) === 0) throw new Error(`Cycle ${currentId} still requires reviewed weeks`);
      }
      const completed = await this.db.runAsync(
        "UPDATE cycle SET status = 'COMPLETED', updated_at = ? WHERE id = ? AND status = 'ACTIVE'",
        timestamp, currentId,
      );
      if (completed.changes !== 1) throw new Error(`Cycle ${currentId} is not active`);
      const activated = await this.db.runAsync(
        "UPDATE cycle SET status = 'ACTIVE', updated_at = ? WHERE id = ? AND status = 'READY'",
        timestamp, nextId,
      );
      if (activated.changes !== 1) throw new Error(`Cycle ${nextId} is not ready for activation`);
    });
  }

  async countSessionSnapshots(): Promise<number> {
    return (await this.db.getFirstAsync<CountRow>('SELECT COUNT(*) AS count FROM session_plan'))?.count ?? 0;
  }

  async getToday(): Promise<TodayData | null> {
    const row = await this.db.getFirstAsync<TodayRow>(
      `SELECT s.id AS session_plan_id, c.id AS cycle_id, c.kind AS cycle_kind, c.snapshot_json AS cycle_snapshot_json,
              w.week_index, s.day_index, s.snapshot_json AS session_snapshot_json
       FROM cycle c
       JOIN training_week w ON w.cycle_id = c.id
       JOIN session_plan s ON s.training_week_id = w.id
       WHERE c.status = 'ACTIVE' AND w.status = 'PLANNED' AND s.status = 'PLANNED'
         AND NOT EXISTS (
           SELECT 1 FROM training_week pending_review
           WHERE pending_review.cycle_id = c.id
             AND pending_review.week_index < w.week_index
             AND pending_review.status <> 'COMPLETED'
         )
       ORDER BY c.rowid, w.week_index, s.day_index
       LIMIT 1`,
    );
    if (!row) return null;
    return {
      sessionPlanId: row.session_plan_id,
      cycleId: row.cycle_id,
      cycleType: row.cycle_kind,
      weekIndex: row.week_index,
      dayIndex: row.day_index,
      cycle: (await this.listCycleSnapshots()).find(cycle => cycle.id === row.cycle_id)!,
      session: await effectiveSession(this.db, row.session_plan_id, JSON.parse(row.session_snapshot_json) as TodayData['session']),
    };
  }

  async getTodayContext(): Promise<TodayContext> {
    const [today, active, restrictions, review, pendingReview] = await Promise.all([
      this.getToday(),
      this.db.getFirstAsync<CountRow>("SELECT COUNT(*) AS count FROM workout_session WHERE status = 'IN_PROGRESS'"),
      this.db.getFirstAsync<CountRow>('SELECT COUNT(*) AS count FROM active_restriction'),
      this.db.getFirstAsync<CountRow>("SELECT COUNT(*) AS count FROM training_week w JOIN cycle c ON c.id = w.cycle_id WHERE w.status = 'REVIEW' AND c.status = 'ACTIVE'"),
      this.db.getFirstAsync<CountRow>("SELECT COUNT(*) AS count FROM progression_proposal WHERE decision IS NULL AND policy_version NOT IN ('progression-v1', 'weekly-review-v1')"),
    ]);
    return {
      activeSession: (active?.count ?? 0) > 0,
      restrictionActive: (restrictions?.count ?? 0) > 0,
      reviewRequired: (review?.count ?? 0) > 0 || (pendingReview?.count ?? 0) > 0,
      today,
    };
  }
}
