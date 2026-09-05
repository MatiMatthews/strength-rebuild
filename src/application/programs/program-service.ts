import { exerciseCatalog } from '../../data/seeds/exercises';
import {
  generateCycleSequence,
  type CyclePrescriptionRequest,
  type CyclePrescriptionSnapshot,
} from '../../domain/prescriptions/generator';
import type { RepositoryDatabase } from '../../data/repositories';

type CycleRow = { snapshot_json: string };
type IdRow = { id: string };
type CountRow = { count: number };
type CycleKindRow = { kind: CyclePrescriptionSnapshot['type']; status: string; rowid: number };
const activationIntentKey = 'strength-rebuild.confirmed-cycle';

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
    return rows.map(({ snapshot_json }) => JSON.parse(snapshot_json) as CyclePrescriptionSnapshot);
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
    globalThis.localStorage?.removeItem(activationIntentKey);
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
    cycle.weeks.forEach((week) => week.sessions.forEach(validateSession));
    const sessions = await this.db.getAllAsync<CycleRow>(
      'SELECT s.snapshot_json FROM session_plan s JOIN training_week w ON w.id = s.training_week_id WHERE w.cycle_id = ?', id,
    );
    sessions.forEach((session) => validateSession(JSON.parse(session.snapshot_json) as TodayData['session']));
  }

  rememberCycleActivation(id: string): void {
    globalThis.localStorage?.setItem(activationIntentKey, id);
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
    if (!row) {
      const confirmedCycle = globalThis.localStorage?.getItem(activationIntentKey);
      if (!confirmedCycle) return null;
      await this.activateCycle(confirmedCycle);
      return this.getToday();
    }
    return {
      sessionPlanId: row.session_plan_id,
      cycleId: row.cycle_id,
      cycleType: row.cycle_kind,
      weekIndex: row.week_index,
      dayIndex: row.day_index,
      cycle: JSON.parse(row.cycle_snapshot_json) as CyclePrescriptionSnapshot,
      session: JSON.parse(row.session_snapshot_json) as TodayData['session'],
    };
  }

  async getTodayContext(): Promise<TodayContext> {
    const [today, active, restrictions, review, pendingReview] = await Promise.all([
      this.getToday(),
      this.db.getFirstAsync<CountRow>("SELECT COUNT(*) AS count FROM workout_session WHERE status = 'IN_PROGRESS'"),
      this.db.getFirstAsync<CountRow>('SELECT COUNT(*) AS count FROM active_restriction'),
      this.db.getFirstAsync<CountRow>("SELECT COUNT(*) AS count FROM training_week WHERE status = 'REVIEW'"),
      this.db.getFirstAsync<CountRow>('SELECT COUNT(*) AS count FROM progression_proposal WHERE decision IS NULL'),
    ]);
    return {
      activeSession: (active?.count ?? 0) > 0,
      restrictionActive: (restrictions?.count ?? 0) > 0,
      reviewRequired: (review?.count ?? 0) > 0 || (pendingReview?.count ?? 0) > 0,
      today,
    };
  }
}
