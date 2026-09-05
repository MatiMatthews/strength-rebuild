import { enforceRestrictions, mutationSafety, readRestrictions } from './persisted-safety';
import { effectiveSession } from '../programs/legacy-repair';
import type { TodayData } from '../programs/program-service';
import { SettingRepository, WorkoutRepository, type RepositoryDatabase } from '../../data/repositories';
import { restoreTimer, type RestTimerState } from '../../features/timer/rest-timer';
import { evaluateSafety, type SafetyInput, type SafetyResult } from '../../domain/safety';
import type { ReplacementReason } from '../../domain/substitutions';
import { PROGRESSION_POLICY_VERSION, proposeProgression, type ProgressionInput } from '../../domain/progression/propose-progression';

import type { SetDeletion } from './set-deletion';

export type Technique = 'Limpia' | 'Regular' | 'Mala';
export interface WorkoutSetDraft { load: string; reps: string; rir: string; technique: Technique; pain: number; notes: string; completed: boolean; skipped: boolean; disposition: 'PENDING' | 'COMPLETED' | 'SKIPPED'; skipReason?: string | undefined }
type SessionBlockRole = NonNullable<TodayData['session']['blocks']>[number]['role'];
type PrescribedExercise = TodayData['session']['exercises'][number];
export interface WorkoutExerciseDraft { exerciseId: string; requirement: 'EXACT' | 'PATTERN' | 'CAPABILITY'; originalExerciseId: string; blockRole?: Exclude<SessionBlockRole, 'finish-review'>; qualityStops?: readonly string[]; loadProvenance?: string; replacement?: { fromExerciseId: string; reason: ReplacementReason }; sets: WorkoutSetDraft[] }
export interface SafetyModification extends SafetyResult { exerciseIndex: number; setIndex: number; recordedAt: string }
export interface WorkoutDraft { revision?: number; restrictionSnapshot?: string; setDeletions?: SetDeletion[]; id: string; sessionPlanId?: string; activeExerciseIndex?: number; exercises: WorkoutExerciseDraft[]; timer?: RestTimerState; safetyModifications: SafetyModification[]; readiness?: PersistedReadiness }
export interface WorkoutSummary { id: string; exerciseCount: number; setCount: number; completedAt: string }
export interface WorkoutHistoryItem { id: string; completedAt: string; prescribed: TodayData['session']; actual: WorkoutDraft }
export interface HistoryCorrectionInput { workoutId: string; exerciseId: string; setIndex: number; load: string; reason: string }
export interface ReadinessInput extends SafetyInput {
  readonly region: 'lumbar' | 'abdominal' | 'other';
  readonly reproducedByBraceCoughOrSneeze: boolean;
}
export interface PersistedReadiness {
  readonly input?: ReadinessInput;
  readonly explanation?: string;
  readonly result?: SafetyResult;
  readonly policyVersion: string;
  readonly sessionPlanId: string;
  readonly decidedAt: string;
  readonly affectedPattern: ReadinessInput['region'];
  readonly appliedChanges: readonly string[];
  readonly disposition: SafetyResult['disposition'];
  readonly sessionStatus: 'READY' | 'MODIFIED' | 'PATTERN_STOPPED' | 'ABORTED' | 'REVIEW_REQUIRED';
  readonly reviewRequired: boolean;
}
type ActiveRow = { id: string; actual_snapshot_json: string | null };
type SessionPlanRow = { id: string };
type HistoryRow = { id: string; prescribed_snapshot_json: string; actual_snapshot_json: string; completed_at: string };
type ProgressionContextRow = { cycle_id: string; snapshot_json: string };
type CompletedActualRow = { id: string; actual_snapshot_json: string };

function validReadinessInput(input: ReadinessInput): boolean {
  return !(!input || !['stable', 'increasing', 'acute'].includes(input.painTrend)
      || !['lumbar', 'abdominal', 'other'].includes(input.region) || typeof input.reproducedByBraceCoughOrSneeze !== 'boolean'
      || ['techniqueChanged', 'persistsAfterModification', 'abdominalRestrictionActive'].some(key => key in input && typeof input[key as keyof ReadinessInput] !== 'boolean')
      || (input.warningFlags !== undefined && (!Array.isArray(input.warningFlags) || input.warningFlags.some(flag => !['NEUROLOGICAL', 'SYSTEMIC'].includes(flag)))));
}

function numeric(value: string | number | undefined, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function executableExercises(session: TodayData['session']): { exercise: PrescribedExercise; blockRole?: Exclude<SessionBlockRole, 'finish-review'> }[] {
  if (!session.blocks) return session.exercises.map((exercise) => ({ exercise }));
  if (session.blocks.length === 0 || session.blocks.some((block) => !block.role || !Array.isArray(block.exercises))) {
    throw new Error('La sesión canónica contiene bloques incompletos');
  }
  const executable = session.blocks.flatMap((block) => {
    if (block.role === 'finish-review') return [];
    const blockRole: Exclude<SessionBlockRole, 'finish-review'> = block.role;
    return block.exercises.map((exercise) => ({ exercise, blockRole }));
  });
  if (executable.length === 0) throw new Error('La sesión canónica no contiene trabajo ejecutable');
  return executable;
}

export class WorkoutService {
  private readonly checkpointContents = new Map<string, string>();
  private content(draft: WorkoutDraft): string {
    const { revision: _revision, ...content } = draft;
    return JSON.stringify(content);
  }
  private readinessBusy = false;
  private readonly repository: WorkoutRepository;
  private readonly settings: SettingRepository;
  constructor(private readonly db: RepositoryDatabase, repository?: WorkoutRepository, private readonly now = () => new Date().toISOString(), private readonly createId = () => `workout-${Date.now()}`) {
    this.repository = repository ?? new WorkoutRepository(db);
    this.settings = new SettingRepository(db, now);
  }

  async applyReadiness(today: TodayData, input: ReadinessInput): Promise<PersistedReadiness> {
    if (!today.sessionPlanId) throw new Error('Readiness requires a planned session');
    if (!validReadinessInput(input)) throw new Error('Preparación no válida. Revisa tu selección.');
    if (this.readinessBusy) throw new Error('Ya se está guardando la preparación.');
    const result = evaluateSafety(input);
    const sessionStatus: PersistedReadiness['sessionStatus'] = result.reviewRequired
      ? 'REVIEW_REQUIRED'
      : result.disposition === 'STOP_PATTERN'
        ? 'PATTERN_STOPPED'
        : result.disposition === 'MODIFY_SET' || result.disposition === 'CONTINUE_WITH_RESTRICTIONS'
          ? 'MODIFIED'
          : 'READY';
    const appliedChanges = sessionStatus === 'MODIFIED'
      ? ['Carga reducida 10%', 'Volumen reducido en una serie por ejercicio', 'Rango conservador']
      : sessionStatus === 'PATTERN_STOPPED'
        ? [`Patrón ${input.region} retirado por hoy`]
        : sessionStatus === 'REVIEW_REQUIRED'
          ? ['Entrada al entrenamiento bloqueada']
          : [];
    const decision: PersistedReadiness = {
      input: JSON.parse(JSON.stringify(input)) as ReadinessInput,
      explanation: result.explanation,
      result,
      policyVersion: 'safety-v2.1',
      sessionPlanId: today.sessionPlanId,
      decidedAt: this.now(),
      affectedPattern: input.region,
      appliedChanges,
      disposition: result.disposition,
      sessionStatus,
      reviewRequired: result.reviewRequired,
    };
    this.readinessBusy = true;
    let saved = decision;
    try {
      await this.db.withTransactionAsync(async () => {
        const current = await this.db.getFirstAsync<{ id: string }>("SELECT s.id FROM session_plan s JOIN training_week w ON w.id = s.training_week_id JOIN cycle c ON c.id = w.cycle_id WHERE c.status = 'ACTIVE' AND w.status = 'PLANNED' AND s.status = 'PLANNED' ORDER BY w.week_index, s.day_index LIMIT 1");
        if (current?.id !== today.sessionPlanId) throw new Error('La sesión cambió. Vuelve a Hoy para revisar la preparación vigente.');
        const previous = await this.getReadiness(today.sessionPlanId!);
        if (previous?.input && JSON.stringify(previous.input) === JSON.stringify(decision.input)) { saved = previous; return; }
        if (previous && (!this.validReadiness(previous, today.sessionPlanId!) || ['PATTERN_STOPPED', 'ABORTED', 'REVIEW_REQUIRED'].includes(previous.sessionStatus))) throw new Error('La preparación guardada requiere revisión; otra selección no elimina el bloqueo.');
        const count = await this.db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM decision_log WHERE decision_type = 'READINESS'");
        await this.db.runAsync(`INSERT INTO decision_log (id, schema_version, created_at, updated_at, decision_type, policy_version, inputs_json, output_json, accepted, decided_at)
          VALUES (?, 1, ?, ?, 'READINESS', 'safety-v2.1', ?, ?, 1, ?)`,
          `readiness-${today.sessionPlanId}-${(count?.count ?? 0) + 1}`, decision.decidedAt, decision.decidedAt,
          JSON.stringify({ previous, input: decision.input }), JSON.stringify(decision), decision.decidedAt);
        await this.settings.save({ id: `readiness-${today.sessionPlanId}`, key: this.readinessKey(today.sessionPlanId!), value: decision });
      });
      return saved;
    } finally { this.readinessBusy = false; }
  }

  async getReadiness(sessionPlanId: string): Promise<PersistedReadiness | null> {
    const setting = await this.settings.get<PersistedReadiness>(this.readinessKey(sessionPlanId));
    if (!setting) return null;
    if (!this.validReadiness(setting.value, sessionPlanId) || !Array.isArray(setting.value.appliedChanges)
      || setting.value.appliedChanges.some(change => typeof change !== 'string')
      || !['lumbar', 'abdominal', 'other'].includes(setting.value.affectedPattern)) throw new Error('La preparación guardada no se puede verificar. Se conserva el registro original.');
    if (setting.value.input) {
      if (!validReadinessInput(setting.value.input)) throw new Error('La entrada guardada no se puede verificar.');
      const result = evaluateSafety(setting.value.input);
      if (result.disposition !== setting.value.disposition || result.reviewRequired !== setting.value.reviewRequired
        || (result.reviewRequired ? 'REVIEW_REQUIRED' : result.disposition === 'STOP_PATTERN' ? 'PATTERN_STOPPED' : ['MODIFY_SET', 'CONTINUE_WITH_RESTRICTIONS'].includes(result.disposition) ? 'MODIFIED' : 'READY') !== setting.value.sessionStatus) throw new Error('La preparación guardada no coincide con su resultado.');
    }
    return setting.value;
  }

  async startOrResume(today: TodayData | TodayData['session']): Promise<WorkoutDraft> {
    let draft!: WorkoutDraft;
    await this.db.withTransactionAsync(async () => { draft = await this.openWorkout(today); });
    this.checkpointContents.set(draft.id, this.content(draft));
    return draft;
  }

  private async openWorkout(today: TodayData | TodayData['session']): Promise<WorkoutDraft> {
    const session = 'session' in today ? today.session : today;
    const currentSessionId = (await this.db.getFirstAsync<SessionPlanRow>("SELECT s.id FROM session_plan s JOIN training_week w ON w.id = s.training_week_id JOIN cycle c ON c.id = w.cycle_id WHERE c.status = 'ACTIVE' AND w.status = 'PLANNED' AND s.status = 'PLANNED' ORDER BY w.week_index, s.day_index LIMIT 1"))?.id;
    const sessionPlanId = 'sessionPlanId' in today && today.sessionPlanId ? today.sessionPlanId : currentSessionId;
    if (sessionPlanId && sessionPlanId !== currentSessionId) throw new Error('La sesión cambió. Vuelve a Hoy para abrir el entrenamiento vigente.');
    const readiness = sessionPlanId ? await this.getReadiness(sessionPlanId) : null;
    if (('session' in today && !sessionPlanId) || (sessionPlanId && !this.validReadiness(readiness, sessionPlanId))) throw new Error('Se requiere una decisión de preparación vigente para esta sesión');
    if (readiness && (readiness.sessionStatus === 'ABORTED' || readiness.sessionStatus === 'PATTERN_STOPPED' || readiness.sessionStatus === 'REVIEW_REQUIRED')) throw new Error('La decisión de preparación bloquea esta sesión');
    const restrictionSnapshot = await readRestrictions(this.db);
    const active = await this.db.getFirstAsync<ActiveRow>("SELECT id, actual_snapshot_json FROM workout_session WHERE status = 'IN_PROGRESS' ORDER BY rowid DESC LIMIT 1");
    if (active && !active.actual_snapshot_json) throw new Error('El entrenamiento guardado no tiene una copia verificable. Se conserva el registro original para revisión.');
    if (active?.actual_snapshot_json) {
      const draft = JSON.parse(active.actual_snapshot_json) as WorkoutDraft;
      if (sessionPlanId && (draft.sessionPlanId !== sessionPlanId || !this.validReadiness(draft.readiness, sessionPlanId!) || draft.readiness?.sessionStatus !== readiness?.sessionStatus)) throw new Error('El entrenamiento guardado no consume la preparación vigente');
      enforceRestrictions(draft, restrictionSnapshot);
      const wallClock = Date.parse(this.now());
      const timerNow = draft.timer?.runningSince !== null && draft.timer?.runningSince !== undefined
        && wallClock >= draft.timer.runningSince && wallClock - draft.timer.runningSince <= 86_400_000
        ? wallClock : draft.timer?.runningSince ?? undefined;
      return { ...draft, ...(readiness ? { readiness } : {}), restrictionSnapshot, exercises: draft.exercises.map((exercise) => ({ ...exercise, sets: exercise.sets.map((set) => ({ ...set, completed: set.completed ?? set.disposition === 'COMPLETED', skipped: set.skipped ?? set.disposition === 'SKIPPED', disposition: set.disposition ?? 'PENDING' })) })), safetyModifications: draft.safetyModifications ?? [], timer: restoreTimer(draft.timer, timerNow) };
    }
    const id = active?.id ?? this.createId();
    let exercises: WorkoutExerciseDraft[] = executableExercises(session).map(({ exercise, blockRole }) => ({
      exerciseId: exercise.exerciseId, originalExerciseId: exercise.exerciseId, ...(blockRole ? { blockRole } : {}), qualityStops: exercise.qualityStops, ...('loadProvenance' in exercise && exercise.loadProvenance ? { loadProvenance: exercise.loadProvenance } : {}), requirement: typeof exercise.requirement === 'string' ? exercise.requirement : (exercise.requirement as { kind: WorkoutExerciseDraft['requirement'] }).kind,
      sets: Array.from({ length: exercise.target.sets }, () => ({
        load: String(('calculatedLoad' in exercise && exercise.calculatedLoad) || ('load' in exercise.target && exercise.target.load) || ''), reps: String(exercise.target.reps.min),
        rir: String(exercise.target.rir.min), technique: 'Limpia', pain: 0, notes: '', completed: false, skipped: false, disposition: 'PENDING',
      })),
    }));
    if (readiness?.sessionStatus === 'MODIFIED') exercises = exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.slice(0, Math.max(1, exercise.sets.length - 1)).map((set) => ({ ...set, load: set.load ? String(Math.round(numeric(set.load) * 0.9 * 4) / 4) : set.load })),
    }));
    if (readiness?.sessionStatus === 'PATTERN_STOPPED') exercises = exercises.filter((exercise) => exercise.requirement === 'EXACT');
    const draft: WorkoutDraft = { id, revision: 0, restrictionSnapshot, ...(sessionPlanId ? { sessionPlanId } : {}), ...(readiness ? { readiness } : {}), activeExerciseIndex: 0, timer: restoreTimer(), safetyModifications: [], exercises };
    enforceRestrictions(draft, restrictionSnapshot);
    const snapshot = JSON.stringify(draft);
    if (active) await this.repository.updateActualSnapshot(id, snapshot);
    else await this.repository.create({ id, ...(sessionPlanId ? { sessionPlanId } : {}), status: 'IN_PROGRESS', prescribedSnapshot: JSON.stringify(session), actualSnapshot: snapshot });
    return draft;
  }

  async save(draft: WorkoutDraft): Promise<void> {
    if (this.hasUnsafeCompletion(draft)) throw new Error('Una serie detenida no puede guardarse como completada');
    const timestamp = this.now();
    await this.db.withTransactionAsync(async () => {
      const guard = mutationSafety(draft);
      await this.repository.updateActualSnapshot(draft.id, JSON.stringify({ ...draft, revision: (draft.revision ?? 0) + 1 }), guard);
      await this.db.runAsync('DELETE FROM set_log WHERE workout_session_id = ?', draft.id);
      for (const [exerciseIndex, exercise] of draft.exercises.entries()) {
        for (const [setIndex, set] of exercise.sets.entries()) {
          if (set.disposition === 'PENDING' && !set.load && !set.reps && !set.notes && set.pain === 0) continue;
          await this.db.runAsync(
            `INSERT INTO set_log
             (id, schema_version, created_at, updated_at, workout_session_id, session_exercise_id, set_index, load, reps, rir, technique, pain, notes)
             VALUES (?, 1, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
            `${draft.id}-set-${exerciseIndex}-${setIndex}`, timestamp, timestamp, draft.id, setIndex + 1,
            numeric(set.load), numeric(set.reps), numeric(set.rir), set.technique, set.pain, set.notes,
          );
        }
      }
      await this.db.runAsync('DELETE FROM symptom_log WHERE workout_session_id = ?', draft.id);
      for (const [index, modification] of draft.safetyModifications.entries()) {
        await this.db.runAsync(
          `INSERT INTO symptom_log (id, schema_version, created_at, updated_at, workout_session_id, symptom, severity, context_json)
           VALUES (?, 1, ?, ?, ?, ?, ?, ?)`,
          `${draft.id}-symptom-${index}`, timestamp, timestamp, draft.id, modification.disposition,
          draft.exercises[modification.exerciseIndex]?.sets[modification.setIndex]?.pain ?? 0, JSON.stringify(modification),
        );
      }
      const notes = draft.exercises.flatMap((exercise) => exercise.sets.map((set) => set.notes.trim())).filter(Boolean);
      await this.db.runAsync('DELETE FROM session_note WHERE workout_session_id = ?', draft.id);
      if (notes.length) await this.db.runAsync(
        `INSERT INTO session_note (id, schema_version, created_at, updated_at, workout_session_id, body)
         VALUES (?, 1, ?, ?, ?, ?)`, `${draft.id}-notes`, timestamp, timestamp, draft.id, notes.join('\n'),
      );
      const timer = draft.timer ?? restoreTimer();
      await this.db.runAsync(
        `INSERT INTO timer_state (id, schema_version, created_at, updated_at, workout_session_id, started_at, duration_seconds, state)
         VALUES (?, 1, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(workout_session_id) DO UPDATE SET updated_at = excluded.updated_at, started_at = excluded.started_at,
           duration_seconds = excluded.duration_seconds, state = excluded.state`,
        `${draft.id}-timer`, timestamp, timestamp, draft.id,
        timer.runningSince === null ? null : new Date(timer.runningSince).toISOString(), timer.durationSeconds, JSON.stringify(timer),
      );
      await this.db.runAsync('DELETE FROM substitution_decision WHERE workout_session_id = ?', draft.id);
      for (const [index, exercise] of draft.exercises.entries()) if (exercise.replacement) {
        const catalogPair = await this.db.getFirstAsync<{ count: number }>(
          'SELECT COUNT(*) AS count FROM exercise WHERE id IN (?, ?)', exercise.replacement.fromExerciseId, exercise.exerciseId,
        );
        if (catalogPair?.count === 2) await this.db.runAsync(
          `INSERT INTO substitution_decision
           (id, schema_version, created_at, updated_at, workout_session_id, original_exercise_id, replacement_exercise_id, policy_version, rationale)
           VALUES (?, 1, ?, ?, ?, ?, ?, 'substitution-v2.1', ?)`,
          `${draft.id}-substitution-${index}`, timestamp, timestamp, draft.id, exercise.replacement.fromExerciseId,
          exercise.exerciseId, exercise.replacement.reason,
        );
      }
    });
    draft.revision = (draft.revision ?? 0) + 1;
    this.checkpointContents.set(draft.id, this.content(draft));
  }

  private snapshotQueue: Promise<void> = Promise.resolve();
  private asyncSnapshots = false;
  private queuedSnapshot: { draft: WorkoutDraft; revision: number; lineage: Set<number>; saved: boolean } | undefined;

  private immediateSnapshot(draft: WorkoutDraft): boolean {
    if (this.asyncSnapshots || this.queuedSnapshot) return false;
    try {
      const guard = mutationSafety(draft);
      const revision = (draft.revision ?? 0) + (this.checkpointContents.get(draft.id) === this.content(draft) ? 0 : 1);
      const saved = this.repository.updateActualSnapshotSync(draft.id, JSON.stringify({ ...draft, revision }), guard);
      if (saved) { draft.revision = revision; this.checkpointContents.set(draft.id, this.content(draft)); }
      return saved;
    }
    catch (error) {
      // The web worker uses a bounded spin loop. Once it times out, keep all
      // subsequent edits on one FIFO queue so an older async save cannot win.
      if (error instanceof Error && error.message === 'Sync operation timeout') {
        this.asyncSnapshots = true;
        return false;
      }
      throw error;
    }
  }

  async saveDraftSnapshot(draft: WorkoutDraft): Promise<void> {
    if (this.hasUnsafeCompletion(draft)) throw new Error('Una serie detenida no puede guardarse como completada');
    // Use the same immediate checkpoint as text/background saves when available.
    // This prevents a delayed autosave from overwriting a newer confirmed edit.
    if (this.immediateSnapshot(draft)) return;
    const predecessor = this.queuedSnapshot;
    const queued = { draft, revision: draft.revision ?? 0, lineage: new Set([draft.revision ?? 0]), saved: false };
    if (predecessor?.draft.id === draft.id) for (const revision of predecessor.lineage) queued.lineage.add(revision);
    this.queuedSnapshot = queued;
    const pending = this.snapshotQueue.then(async () => {
      if (predecessor?.saved && predecessor.draft.id === draft.id && predecessor.lineage.has(queued.revision)) draft.revision = predecessor.draft.revision ?? 0;
      // A later queued edit may be based on this promoted revision while this write is still pending.
      queued.revision = draft.revision ?? 0;
      queued.lineage.add(queued.revision);
      const guard = mutationSafety(draft);
      const revision = (draft.revision ?? 0) + (this.checkpointContents.get(draft.id) === this.content(draft) ? 0 : 1);
      await this.repository.updateActualSnapshot(draft.id, JSON.stringify({ ...draft, revision }), guard);
      draft.revision = revision;
      this.checkpointContents.set(draft.id, this.content(draft));
      queued.lineage.add(revision);
      queued.saved = true;
    }).finally(() => { if (this.queuedSnapshot === queued) this.queuedSnapshot = undefined; });
    this.snapshotQueue = pending.catch(() => undefined);
    await pending;
  }

  saveDraftSnapshotBeforeProcessStop(draft: WorkoutDraft): boolean {
    if (this.hasUnsafeCompletion(draft)) throw new Error('Una serie detenida no puede guardarse como completada');
    return this.immediateSnapshot(draft);
  }
  recordSet(draft: WorkoutDraft, exerciseIndex: number, setIndex: number, patch: Partial<WorkoutSetDraft>): WorkoutDraft {
    const exercise = draft.exercises[exerciseIndex];
    const set = exercise?.sets[setIndex];
    if (!exercise || !set) throw new RangeError('Workout set does not exist');
    const updatedSet = { ...set, ...patch };
    const safety = evaluateSafety({ pain: updatedSet.pain, painTrend: 'stable', techniqueChanged: updatedSet.technique !== 'Limpia' });
    const enforcedSet = safety.disposition === 'STOP_PATTERN' || safety.disposition === 'REVIEW_REQUIRED'
      ? { ...updatedSet, completed: false, disposition: updatedSet.skipped ? 'SKIPPED' as const : 'PENDING' as const }
      : updatedSet;
    return { ...draft, exercises: draft.exercises.map((item, index) => index === exerciseIndex ? { ...item, sets: item.sets.map((candidate, index) => index === setIndex ? enforcedSet : candidate) } : item), safetyModifications: safety.disposition === 'MODIFY_SET' || safety.disposition === 'STOP_PATTERN' || safety.disposition === 'REVIEW_REQUIRED' ? [...draft.safetyModifications, { ...safety, exerciseIndex, setIndex, recordedAt: this.now() }] : draft.safetyModifications };
  }
  replaceExercise(draft: WorkoutDraft, exerciseIndex: number, exerciseId: string, reason: ReplacementReason): WorkoutDraft {
    const current = draft.exercises[exerciseIndex];
    if (!current) throw new RangeError('Workout exercise does not exist');
    return { ...draft, exercises: draft.exercises.map((item, index) => index === exerciseIndex ? { ...item, exerciseId, replacement: { fromExerciseId: item.exerciseId, reason } } : item) };
  }
  async completeSetAndSave(draft: WorkoutDraft, exerciseIndex: number, setIndex: number): Promise<WorkoutDraft> {
    const next = this.completeSet(draft, exerciseIndex, setIndex);
    await this.saveDraftSnapshot(next);
    return next;
  }
  completeSet(draft: WorkoutDraft, exerciseIndex: number, setIndex: number): WorkoutDraft {
    return this.recordSet(draft, exerciseIndex, setIndex, { completed: true, skipped: false, disposition: 'COMPLETED', skipReason: undefined });
  }
  skipSet(draft: WorkoutDraft, exerciseIndex: number, setIndex: number, reason: string): WorkoutDraft {
    if (!reason.trim()) throw new Error('A skip reason is required');
    const set = draft.exercises[exerciseIndex]?.sets[setIndex];
    if (set?.completed) throw new Error('Completed work cannot be omitted');
    if (set?.skipped && set.skipReason === reason.trim()) return draft;
    return this.recordSet(draft, exerciseIndex, setIndex, { completed: false, skipped: true, disposition: 'SKIPPED', skipReason: reason.trim() });
  }
  canComplete(draft: WorkoutDraft): boolean {
    const sets = draft.exercises.flatMap((exercise) => exercise.sets);
    return !this.hasUnsafeCompletion(draft) && draft.exercises.length > 0
      && sets.some((set) => set.disposition === 'COMPLETED')
      && draft.exercises.every((exercise) => exercise.sets.length > 0 && exercise.sets.every((set) => set.completed || (set.skipped && Boolean(set.skipReason?.trim()))));
  }
  async listHistory(): Promise<WorkoutHistoryItem[]> {
    const rows = await this.db.getAllAsync<HistoryRow>("SELECT id, prescribed_snapshot_json, actual_snapshot_json, completed_at FROM workout_session WHERE status = 'COMPLETED' ORDER BY completed_at DESC");
    return rows.map((row) => ({ id: row.id, completedAt: row.completed_at, prescribed: JSON.parse(row.prescribed_snapshot_json) as TodayData['session'], actual: JSON.parse(row.actual_snapshot_json) as WorkoutDraft }));
  }
  async correctHistory(input: HistoryCorrectionInput): Promise<void> {
    const reason = input.reason.trim();
    if (!reason) throw new Error('A correction reason is required');
    if (!Number.isInteger(input.setIndex) || input.setIndex < 0) throw new RangeError('Correction set does not exist');
    const load = numeric(input.load, Number.NaN);
    if (!Number.isFinite(load) || load < 0) throw new Error('Correction load must be a valid number');

    const row = await this.db.getFirstAsync<HistoryRow>(
      "SELECT id, prescribed_snapshot_json, actual_snapshot_json, completed_at FROM workout_session WHERE id = ? AND status = 'COMPLETED'",
      input.workoutId,
    );
    if (!row) throw new Error('Completed workout does not exist');
    const original = JSON.parse(row.actual_snapshot_json) as WorkoutDraft;
    const exercise = original.exercises.find((item) => item.exerciseId === input.exerciseId);
    const set = exercise?.sets[input.setIndex];
    if (!exercise || !set) throw new RangeError('Correction set does not exist');
    const corrected = { ...set, load: String(load) };
    const timestamp = this.now();
    const id = `${input.workoutId}-correction-${timestamp}-${input.setIndex}`;

    await this.db.runAsync(
      `INSERT INTO decision_log
       (id, schema_version, created_at, updated_at, decision_type, policy_version, inputs_json, output_json, accepted, decided_at)
       VALUES (?, 1, ?, ?, 'HISTORY_CORRECTION', 'history-correction-v2.1', ?, ?, 1, ?)`,
      id,
      timestamp,
      timestamp,
      JSON.stringify({ workoutId: input.workoutId, exerciseId: input.exerciseId, setIndex: input.setIndex, reason, before: set, after: corrected }),
      JSON.stringify({ originalSnapshotPreserved: true, correctedLoad: load }),
      timestamp,
    );
  }
  async complete(draft: WorkoutDraft): Promise<WorkoutSummary> {
    if (this.hasUnsafeCompletion(draft)) throw new Error('La seguridad del entrenamiento impide completarlo');
    const hasCompletedSet = draft.exercises.some((exercise) => exercise.sets.some((set) => set.disposition === 'COMPLETED'));
    const hasLegacyRecordedWork = draft.exercises.some((exercise) => exercise.sets.some((set) => set.notes.trim()));
    if (!this.canComplete(draft) && (hasCompletedSet || !hasLegacyRecordedWork)) throw new Error('Incomplete workout: at least one completed set is required and every required set must be completed or skipped with a reason');
    const existing = await this.repository.get(draft.id);
    if (existing?.status === 'COMPLETED' && existing.completedAt) return this.summary(draft, existing.completedAt);
    const completedAt = this.now();
    await this.db.withTransactionAsync(async () => {
      await this.repository.complete(draft.id, JSON.stringify({ ...draft, timer: restoreTimer(draft.timer) }), completedAt, mutationSafety(draft));
      if (!draft.sessionPlanId) return;
      const plan = await this.db.runAsync("UPDATE session_plan SET status = 'COMPLETED', updated_at = ? WHERE id = ? AND status = 'PLANNED'", completedAt, draft.sessionPlanId);
      if (plan.changes !== 1) throw new Error(`Session plan ${draft.sessionPlanId} is not planned`);
      await this.db.runAsync(
        `UPDATE training_week
         SET status = 'REVIEW', updated_at = ?
         WHERE id = (SELECT training_week_id FROM session_plan WHERE id = ?)
           AND status IN ('PLANNED', 'ACTIVE')
           AND NOT EXISTS (
             SELECT 1 FROM session_plan pending
             WHERE pending.training_week_id = training_week.id
               AND pending.status <> 'COMPLETED'
           )`,
        completedAt, draft.sessionPlanId,
      );
      await this.createProgressionProposal(draft, completedAt);
    });
    return this.summary(draft, completedAt);
  }

  private summary(draft: WorkoutDraft, completedAt: string): WorkoutSummary {
    return { id: draft.id, exerciseCount: draft.exercises.length, setCount: draft.exercises.reduce((sum, item) => sum + item.sets.length, 0), completedAt };
  }

  private async createProgressionProposal(draft: WorkoutDraft, timestamp: string): Promise<void> {
    if (!draft.sessionPlanId) return;
    const context = await this.db.getFirstAsync<ProgressionContextRow>(
      `SELECT w.cycle_id, s.snapshot_json
       FROM session_plan s JOIN training_week w ON w.id = s.training_week_id
       WHERE s.id = ?`,
      draft.sessionPlanId,
    );
    const actual = draft.exercises.find((exercise) => exercise.requirement === 'EXACT') ?? draft.exercises[0];
    if (!context || !actual) return;
    const session = await effectiveSession(this.db, draft.sessionPlanId, JSON.parse(context.snapshot_json) as TodayData['session']);
    const prescribed = executableExercises(session).find(({ exercise }) => exercise.exerciseId === actual.exerciseId)?.exercise;
    if (!prescribed) return;
    const completedSets = actual.sets.filter((set) => set.disposition === 'COMPLETED');
    const history = await this.db.getAllAsync<CompletedActualRow>(
      "SELECT id, actual_snapshot_json FROM workout_session WHERE status = 'COMPLETED' AND id <> ? ORDER BY completed_at DESC, rowid DESC",
      draft.id,
    );
    let consecutiveSuccessfulExposures = 0;
    let consecutiveFailedExposures = 0;
    for (const row of history) {
      const historical = (JSON.parse(row.actual_snapshot_json) as WorkoutDraft).exercises
        .find((exercise) => exercise.exerciseId === actual.exerciseId);
      if (!historical) continue;
      const sets = historical.sets.filter((set) => set.disposition === 'COMPLETED');
      const successful = sets.length >= prescribed.target.sets
        && sets.every((set) => numeric(set.reps) >= prescribed.target.reps.min
          && numeric(set.rir, prescribed.target.rir.min) >= prescribed.target.rir.min
          && set.technique === 'Limpia' && set.pain <= 2);
      if (successful && consecutiveFailedExposures === 0) consecutiveSuccessfulExposures += 1;
      else if (!successful && consecutiveSuccessfulExposures === 0) consecutiveFailedExposures += 1;
      else break;
    }
    const input: ProgressionInput = {
      exerciseId: actual.exerciseId,
      role: actual.requirement === 'EXACT' ? 'main' : 'accessory',
      target: {
        sets: prescribed.target.sets,
        prescribedReps: prescribed.target.reps.min,
        reps: prescribed.target.reps,
        load: numeric('calculatedLoad' in prescribed ? prescribed.calculatedLoad : undefined, numeric(actual.sets[0]?.load)),
        targetRir: prescribed.target.rir.min,
      },
      completed: {
        sets: completedSets.length,
        repsPerSet: completedSets.map((set) => numeric(set.reps)),
        terminalRir: numeric(completedSets.at(-1)?.rir, prescribed.target.rir.min),
        technique: completedSets.some((set) => set.technique === 'Mala') ? 'failed' : completedSets.some((set) => set.technique === 'Regular') ? 'altered' : 'good',
        pain: Math.max(0, ...completedSets.map((set) => set.pain)),
      },
      consecutiveSuccessfulExposures,
      consecutiveFailedExposures,
      availableLoadIncrements: [2.5, 5],
      safetyFlagActive: draft.safetyModifications.length > 0,
    };
    const proposal = proposeProgression(input);
    await this.db.runAsync(
      `INSERT INTO progression_proposal
       (id, schema_version, created_at, updated_at, cycle_id, policy_version, inputs_json, output_json)
       VALUES (?, 1, ?, ?, ?, ?, ?, ?)`,
      `${draft.id}-progression`, timestamp, timestamp, context.cycle_id, PROGRESSION_POLICY_VERSION,
      JSON.stringify({ ...input, sourceWorkoutId: draft.id, sourceSessionPlanId: draft.sessionPlanId }), JSON.stringify(proposal),
    );
  }

  private readinessKey(sessionPlanId: string) { return `session-readiness:${sessionPlanId}`; }

  private validReadiness(readiness: PersistedReadiness | null | undefined, sessionPlanId: string): readiness is PersistedReadiness {
    return Boolean(readiness && readiness.policyVersion === 'safety-v2.1' && readiness.sessionPlanId === sessionPlanId
      && Number.isFinite(Date.parse(readiness.decidedAt)) && ['READY', 'MODIFIED', 'PATTERN_STOPPED', 'ABORTED', 'REVIEW_REQUIRED'].includes(readiness.sessionStatus));
  }

  private hasUnsafeCompletion(draft: WorkoutDraft): boolean {
    return draft.exercises.some((exercise) => exercise.sets.some((set) => set.disposition === 'COMPLETED'
      && ['STOP_PATTERN', 'REVIEW_REQUIRED'].includes(evaluateSafety({ pain: set.pain, painTrend: 'stable', techniqueChanged: set.technique !== 'Limpia' }).disposition)));
  }
}
