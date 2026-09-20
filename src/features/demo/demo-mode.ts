import { createRepositories, type RepositoryDatabase } from '../../data/repositories';
import { defaultSettings, SAFE_DEMO_PROFILE_ID, type TrainingSettings } from '../settings/settings';

export type DataMode = 'personal' | 'demo';
export const MODE_DATABASE = 'strength-rebuild-mode.db';
export const DATA_DATABASES = { personal: 'strength-rebuild-v2.db', demo: 'strength-rebuild-demo.db' } as const;
type ModeDatabase = Pick<RepositoryDatabase, 'runAsync' | 'getFirstAsync'>;

export async function initializeModeStore(db: ModeDatabase) {
  await db.runAsync("CREATE TABLE IF NOT EXISTS data_mode (id INTEGER PRIMARY KEY CHECK(id = 1), mode TEXT NOT NULL CHECK(mode IN ('personal', 'demo')))");
  await db.runAsync("INSERT INTO data_mode (id, mode) VALUES (1, 'personal') ON CONFLICT(id) DO NOTHING");
}

/** Only an explicit selection in the separate control database selects demo. */
export class DemoModeService {
  private pending: { mode: DataMode; promise: Promise<DataMode> } | null = null;
  constructor(private readonly db: ModeDatabase, private readonly prepare: (mode: DataMode) => Promise<void>) {}

  async load(): Promise<DataMode> {
    const row = await this.db.getFirstAsync<{ mode: string }>('SELECT mode FROM data_mode WHERE id = 1');
    if (row?.mode !== 'personal' && row?.mode !== 'demo') throw new Error('Invalid local data mode');
    return row.mode;
  }

  switchTo(mode: DataMode): Promise<DataMode> {
    if (this.pending) return this.pending.mode === mode ? this.pending.promise : Promise.reject(new Error('Mode change in progress'));
    const promise = this.change(mode).finally(() => { this.pending = null; });
    this.pending = { mode, promise };
    return promise;
  }

  private async change(mode: DataMode) {
    const previous = await this.load();
    if (previous === mode) return mode;
    // Open/initialize the destination before committing selection; no personal copies.
    await this.prepare(mode);
    try {
      const result = await this.db.runAsync('UPDATE data_mode SET mode = ? WHERE id = 1 AND mode = ?', mode, previous);
      if (result.changes !== 1) throw new Error('Mode changed in another session');
    } catch (error) {
      if (await this.load() !== mode) throw error;
    }
    return mode;
  }
}

export async function seedDemoSettings(db: RepositoryDatabase) {
  const settings = createRepositories(db).settings;
  const demo: TrainingSettings = {
    ...defaultSettings,
    demoProfileId: SAFE_DEMO_PROFILE_ID,
    profile: { benchPressReference: 60, deadliftReference: 100, backSquatReference: 80, strictPullUpCapacity: 5 },
    referenceSources: {},
  };
  await settings.compareAndSave({ id: 'training-settings', key: 'training-settings', value: demo }, null);
}
