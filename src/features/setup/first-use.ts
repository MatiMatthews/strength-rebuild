import type { RepositoryDatabase, SqlValue } from '../../data/repositories';
import { generateCycleSequence, type CyclePrescriptionRequest, type CyclePrescriptionSnapshot } from '../../domain/prescriptions/generator';
import { commitReferences, referenceDraft, referenceKeys, type ReferenceDraft } from '../settings/reference-draft';
import { planningProfile, resolveTrainingSettings, validateSettings, type TrainingSettings } from '../settings/settings';

export interface FirstUseDraft {
  version: 1;
  step: number;
  goal: 'strength' | 'hypertrophy';
  experience: 'returning' | 'regular';
  settings: TrainingSettings;
  references: ReferenceDraft;
}

export const FIRST_USE_DRAFT_KEY = 'first-use-draft';
export const FIRST_USE_COMPLETION_KEY = 'first-use-completed';
const SETTINGS_KEY = 'training-settings';
type StoredDraft = { revision: number; settingsSource: string | null; draft: FirstUseDraft };
type Completion = { version: 1; draft: FirstUseDraft; activeCycleId: string };
type Source = { draft_json: string | null; settings_json: string | null };

export class FirstUseConflictError extends Error {}
export class FirstUseValidationError extends Error {}

function conflict(): Error {
  return new FirstUseConflictError('La configuración o el plan cambió. Recarga el borrador guardado o revisa tus preferencias antes de confirmar.');
}

function checkDraft(draft: FirstUseDraft): void {
  if (!draft || draft.version !== 1 || !Number.isInteger(draft.step) || draft.step < 0 || draft.step > 4
    || !['strength', 'hypertrophy'].includes(draft.goal) || !['returning', 'regular'].includes(draft.experience)
    || !draft.settings || !['kg', 'lb'].includes(draft.settings.units)
    || !['equipment', 'schedule', 'requirements', 'restrictions', 'increments'].every(key => Array.isArray(draft.settings[key as keyof TrainingSettings]))
    || !referenceKeys.every(key => {
      const field = draft.references?.[key];
      return field && typeof field.text === 'string' && typeof field.known === 'boolean' && typeof field.edited === 'boolean';
    })) throw new FirstUseValidationError('La preparación guardada no es válida.');
}

function committedSettings(draft: FirstUseDraft): TrainingSettings {
  try {
    checkDraft(draft);
    const settings = commitReferences(draft.settings, draft.references);
    const validation = validateSettings(settings);
    if (!validation.success) throw new Error(validation.message);
    return settings;
  } catch (error) { throw new FirstUseValidationError((error as Error).message); }
}

const emptyPlan = `NOT EXISTS (SELECT 1 FROM program_template)
  AND NOT EXISTS (SELECT 1 FROM cycle)
  AND NOT EXISTS (SELECT 1 FROM training_week)
  AND NOT EXISTS (SELECT 1 FROM session_plan)
  AND NOT EXISTS (SELECT 1 FROM workout_session)
  AND NOT EXISTS (SELECT 1 FROM progression_proposal)
  AND NOT EXISTS (SELECT 1 FROM active_restriction WHERE active = 1)`;

/** Keep one instance per editor. Load before saving; save before showing a preview. */
export class FirstUseService {
  private source: string | null | undefined;
  private settingsSource: string | null = null;
  private revision = 0;
  private saving = false;

  constructor(private readonly db: RepositoryDatabase) {}

  async load(): Promise<FirstUseDraft> {
    if (this.saving) throw conflict();
    const row = await this.db.getFirstAsync<Source>(`SELECT
      (SELECT value_json FROM app_setting WHERE key = ?) AS draft_json,
      (SELECT value_json FROM app_setting WHERE key = ?) AS settings_json`, FIRST_USE_DRAFT_KEY, SETTINGS_KEY);
    this.source = row?.draft_json ?? null;
    if (this.source !== null) {
      const saved = JSON.parse(this.source) as StoredDraft;
      checkDraft(saved.draft);
      if (!Number.isInteger(saved.revision) || saved.revision < 1
        || !(saved.settingsSource === null || typeof saved.settingsSource === 'string')) throw conflict();
      this.settingsSource = saved.settingsSource;
      this.revision = saved.revision;
      return saved.draft;
    }
    this.settingsSource = row?.settings_json ?? null;
    this.revision = 0;
    const settings = JSON.parse(JSON.stringify(resolveTrainingSettings(
      this.settingsSource === null ? null : JSON.parse(this.settingsSource) as TrainingSettings,
    ))) as TrainingSettings;
    return { version: 1, step: 0, goal: 'strength', experience: 'returning', settings, references: referenceDraft(settings) };
  }

  /** Text drafts intentionally allow incomplete decimals and incomplete choices. */
  async save(draft: FirstUseDraft): Promise<void> {
    checkDraft(draft);
    if (this.source === undefined || this.saving) throw conflict();
    this.saving = true;
    try {
      const value = JSON.stringify({ revision: this.revision + 1, settingsSource: this.settingsSource, draft } satisfies StoredDraft);
      const timestamp = new Date().toISOString();
      const result = this.source === null
        ? await this.db.runAsync(`INSERT INTO app_setting (id, schema_version, created_at, updated_at, key, value_json)
          SELECT ?, 1, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM app_setting WHERE key = ?)
          ON CONFLICT(key) DO NOTHING`, FIRST_USE_DRAFT_KEY, timestamp, timestamp, FIRST_USE_DRAFT_KEY, value, FIRST_USE_COMPLETION_KEY)
        : await this.db.runAsync(`UPDATE app_setting SET value_json = ?, updated_at = ? WHERE key = ? AND value_json = ?
          AND NOT EXISTS (SELECT 1 FROM app_setting WHERE key = ?)`, value, timestamp, FIRST_USE_DRAFT_KEY, this.source, FIRST_USE_COMPLETION_KEY);
      if (result.changes !== 1) throw conflict();
      this.source = value;
      this.revision += 1;
    } finally { this.saving = false; }
  }

  /** Pure generation: no database reads, writes, timestamps, or random IDs. */
  preview(draft: FirstUseDraft): readonly CyclePrescriptionSnapshot[] {
    const settings = committedSettings(draft);
    const common = { profile: planningProfile(settings), equipment: settings.equipment, schedule: settings.schedule,
      requirements: settings.requirements, restrictions: settings.restrictions };
    const requests: CyclePrescriptionRequest[] = [];
    if (draft.experience === 'returning') requests.push({ ...common, id: 'first-use-v1-reentry', type: 'reentry', weeks: 2 });
    requests.push({ ...common, id: `first-use-v1-${draft.goal}`, type: draft.goal, weeks: 4 });
    try { return generateCycleSequence(requests); }
    catch (error) { throw new FirstUseValidationError((error as Error).message); }
  }

  /** Explicitly replace draft preferences, never silently merge two editors. */
  async useSavedSettings(draft: FirstUseDraft): Promise<FirstUseDraft> {
    const row = await this.db.getFirstAsync<{ value_json: string }>('SELECT value_json FROM app_setting WHERE key = ?', SETTINGS_KEY);
    const previous = this.settingsSource;
    const settings = JSON.parse(JSON.stringify(resolveTrainingSettings(row ? JSON.parse(row.value_json) as TrainingSettings : null))) as TrainingSettings;
    const next = { ...draft, settings, references: referenceDraft(settings) };
    this.settingsSource = row?.value_json ?? null;
    try { await this.save(next); return next; }
    catch (error) { this.settingsSource = previous; throw error; }
  }

  private async completed(draft: FirstUseDraft): Promise<string | null> {
    const row = await this.db.getFirstAsync<{ value_json: string }>('SELECT value_json FROM app_setting WHERE key = ?', FIRST_USE_COMPLETION_KEY);
    if (!row) return null;
    const completion = JSON.parse(row.value_json) as Completion;
    if (completion.version !== 1 || JSON.stringify(completion.draft) !== JSON.stringify(draft)) throw conflict();
    return completion.activeCycleId;
  }

  async activate(draft: FirstUseDraft): Promise<string> {
    // Snapshot caller-owned objects before the first await.
    const input = JSON.parse(JSON.stringify(draft)) as FirstUseDraft;
    const settings = committedSettings(input);
    const snapshots = this.preview(input);
    const alreadyCompleted = await this.completed(input);
    if (alreadyCompleted) return alreadyCompleted;
    if (!this.source || this.saving || JSON.stringify((JSON.parse(this.source) as StoredDraft).draft) !== JSON.stringify(input)) throw conflict();
    if (!this.db.runSync || !this.db.execSync || !this.db.isInTransactionSync) throw new Error('La base de datos no admite la activación atómica de la preparación.');
    const run = (sql: string, ...params: SqlValue[]) => this.db.runSync!(sql, ...params);
    const timestamp = new Date().toISOString();
    const activeCycleId = snapshots[0]!.id;
    const templateId = 'first-use-v1-program';
    const completion: Completion = { version: 1, draft: input, activeCycleId };

    // No await between BEGIN and COMMIT: unrelated JS writers cannot enter this
    // shared-connection transaction. A failed BEGIN must never roll back its owner.
    this.db.execSync('BEGIN IMMEDIATE');
    try {
      const claim = run(`INSERT INTO app_setting (id, schema_version, created_at, updated_at, key, value_json)
        SELECT ?, 1, ?, ?, ?, ? WHERE
        (SELECT value_json FROM app_setting WHERE key = ?) IS ?
        AND (SELECT value_json FROM app_setting WHERE key = ?) IS ?
        AND NOT EXISTS (SELECT 1 FROM app_setting WHERE key = ?) AND ${emptyPlan}`,
      FIRST_USE_COMPLETION_KEY, timestamp, timestamp, FIRST_USE_COMPLETION_KEY, JSON.stringify(completion),
      FIRST_USE_DRAFT_KEY, this.source, SETTINGS_KEY, this.settingsSource, FIRST_USE_COMPLETION_KEY);
      if (claim.changes !== 1) throw conflict();
      run(`INSERT INTO program_template (id, schema_version, created_at, updated_at, name, version, snapshot_json)
        VALUES (?, 1, ?, ?, ?, 1, ?)`, templateId, timestamp, timestamp, 'Generated training plan', JSON.stringify(snapshots));
      for (const cycle of snapshots) {
        run(`INSERT INTO cycle (id, schema_version, created_at, updated_at, program_template_id, kind, status, policy_version, snapshot_json)
          VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?)`, cycle.id, timestamp, timestamp, templateId, cycle.type,
        cycle.id === activeCycleId ? 'ACTIVE' : 'READY', cycle.policyVersion, JSON.stringify(cycle));
        for (const week of cycle.weeks) {
          const weekId = `${cycle.id}-week-${week.index}`;
          run(`INSERT INTO training_week (id, schema_version, created_at, updated_at, cycle_id, week_index, status, snapshot_json)
            VALUES (?, 1, ?, ?, ?, ?, 'PLANNED', ?)`, weekId, timestamp, timestamp, cycle.id, week.index, JSON.stringify(week));
          for (const [index, session] of week.sessions.entries()) {
            run(`INSERT INTO session_plan (id, schema_version, created_at, updated_at, training_week_id, day_index, status, snapshot_json)
              VALUES (?, 1, ?, ?, ?, ?, 'PLANNED', ?)`, `${weekId}-day-${index + 1}`, timestamp, timestamp, weekId, index + 1, JSON.stringify(session));
          }
        }
      }
      run(`INSERT INTO app_setting (id, schema_version, created_at, updated_at, key, value_json)
        VALUES (?, 1, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
      SETTINGS_KEY, timestamp, timestamp, SETTINGS_KEY, JSON.stringify(settings));
      this.db.execSync('COMMIT');
    } catch (error) {
      if (this.db.isInTransactionSync()) this.db.execSync('ROLLBACK');
      // Another instance may have committed the identical confirmation first.
      const completed = await this.completed(input);
      if (completed) return completed;
      throw error;
    }
    return activeCycleId;
  }
}
