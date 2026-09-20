import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ProgramService } from '../../application/programs/program-service';
import { migrateDatabase, type MigrationDatabase } from '../../data/migrations';
import { SettingRepository, type RepositoryDatabase, type SqlValue } from '../../data/repositories';
import { defaultSettings } from '../settings/settings';
import { FIRST_USE_COMPLETION_KEY, FIRST_USE_DRAFT_KEY, FirstUseService } from './first-use';

function open(path = ':memory:') {
  const sqlite = new DatabaseSync(path);
  const run = (sql: string, ...params: SqlValue[]) => {
    const result = sqlite.prepare(sql).run(...params);
    return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
  };
  const db: RepositoryDatabase & MigrationDatabase = {
    execSync: sql => { db.runSync!(sql); }, isInTransactionSync: () => sqlite.isTransaction,
    exec: sql => sqlite.exec(sql), runSync: run, runAsync: async (sql, ...params) => run(sql, ...params),
    getFirstAsync: async (sql: string, ...params: SqlValue[]) => (sqlite.prepare(sql).get(...params) ?? null) as never,
    getAllAsync: async (sql, ...params) => sqlite.prepare(sql).all(...params) as never,
    withTransactionAsync: async task => {
      sqlite.exec('BEGIN IMMEDIATE');
      try { await task(); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  return { db, sqlite, close: () => sqlite.close() };
}

const tables = ['app_setting', 'program_template', 'cycle', 'training_week', 'session_plan', 'workout_session', 'decision_log'];
const snapshot = (db: RepositoryDatabase) => Promise.all(tables.map(table => db.getAllAsync(`SELECT * FROM ${table} ORDER BY rowid`)));

describe('first-use setup with SQLite', () => {
  let opened: ReturnType<typeof open>;
  beforeEach(async () => { opened = open(); await migrateDatabase(opened.db); });
  afterEach(() => opened.close());

  it('copies committed settings without changing the defaults or writing any plan', async () => {
    const settings = { ...defaultSettings, units: 'lb' as const, schedule: [2, 4, 6], profile: { benchPressReference: 100 } };
    await new SettingRepository(opened.db).save({ id: 'training-settings', key: 'training-settings', value: settings });
    const before = await snapshot(opened.db);
    const draft = await new FirstUseService(opened.db).load();
    expect(draft.settings).toEqual(settings);
    expect(draft.references.benchPressReference).toEqual({ known: true, text: '100', edited: false });
    draft.settings.schedule[0] = 7;
    expect(await snapshot(opened.db)).toEqual(before);
    expect(defaultSettings.schedule).toEqual([1, 3, 5]);
  });

  it('resumes text, unknown references, and step after a real database reopen', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'first-use-test-'));
    const path = join(directory, 'setup.sqlite');
    let disk = open(path);
    try {
      await migrateDatabase(disk.db);
      const service = new FirstUseService(disk.db);
      const draft = await service.load();
      draft.step = 3;
      draft.references.benchPressReference = { known: true, text: '60,', edited: true };
      await service.save(draft);
      expect(await new SettingRepository(disk.db).get('training-settings')).toBeNull();
      expect(await disk.db.getAllAsync('SELECT * FROM cycle')).toEqual([]);
      disk.close();
      disk = open(path);
      expect(await new FirstUseService(disk.db).load()).toEqual(draft);
    } finally { disk.close(); rmSync(directory, { recursive: true, force: true }); }
  });

  it.each(['strength', 'hypertrophy'] as const)('purely previews deterministic %s snapshots with existing cycle lengths', async goal => {
    const service = new FirstUseService(opened.db);
    const draft = await service.load();
    draft.goal = goal;
    const before = await snapshot(opened.db);
    const pure = new FirstUseService({} as RepositoryDatabase);
    const preview = pure.preview(draft);
    expect(preview.map(cycle => [cycle.type, cycle.weeks.length])).toEqual([['reentry', 2], [goal, 4]]);
    expect(pure.preview(draft)).toEqual(preview);
    expect(pure.preview({ ...draft, experience: 'regular' }).map(cycle => [cycle.type, cycle.weeks.length])).toEqual([[goal, 4]]);
    expect(await snapshot(opened.db)).toEqual(before);
  });

  it('allows incomplete draft values but rejects them before preview or activation', async () => {
    const service = new FirstUseService(opened.db);
    const draft = await service.load();
    draft.references.benchPressReference = { known: true, text: '60,', edited: true };
    await service.save(draft);
    const before = await snapshot(opened.db);
    expect(() => service.preview(draft)).toThrow('completo');
    await expect(service.activate(draft)).rejects.toThrow('completo');
    draft.references.benchPressReference = { known: false, text: '60,', edited: true };
    expect(() => service.preview(draft)).not.toThrow();
    draft.settings.schedule = [1, 1, 2];
    expect(() => service.preview(draft)).toThrow('tres días');
    expect(await snapshot(opened.db)).toEqual(before);
  });

  it.each(['returning', 'regular'] as const)('atomically commits exact preview, references, settings, and completion for %s', async experience => {
    const service = new FirstUseService(opened.db);
    const draft = await service.load();
    draft.experience = experience;
    draft.settings.schedule = [2, 4, 6];
    draft.references.benchPressReference = { known: true, text: '60,5', edited: true };
    await service.save(draft);
    const preview = service.preview(draft);
    const id = await service.activate(draft);
    const programs = new ProgramService(opened.db);
    expect(await programs.listCycleSnapshots()).toEqual(preview);
    expect(await programs.getActiveCycleId()).toBe(id);
    expect((await programs.getToday())?.session).toEqual(preview[0]!.weeks[0]!.sessions[0]);
    expect(await programs.countSessionSnapshots()).toBe(experience === 'returning' ? 18 : 12);
    expect((await new SettingRepository(opened.db).get('training-settings'))?.value).toMatchObject({
      schedule: [2, 4, 6], profile: { benchPressReference: 60.5 }, referenceSources: { benchPressReference: 'user' },
    });
    expect((await new SettingRepository(opened.db).get(FIRST_USE_COMPLETION_KEY))?.value).toMatchObject({ version: 1, activeCycleId: id });
    expect(await new FirstUseService(opened.db).load()).toEqual(draft);
  });

  it('rejects two stale editors and overlapping saves without losing the winner', async () => {
    const first = new FirstUseService(opened.db);
    const second = new FirstUseService(opened.db);
    const a = await first.load();
    const b = await second.load();
    a.step = 1;
    const saving = first.save(a);
    await expect(first.save({ ...a, step: 3 })).rejects.toThrow('cambió');
    await saving;
    await expect(second.save({ ...b, step: 2 })).rejects.toThrow('cambió');
    expect(await new FirstUseService(opened.db).load()).toEqual(a);
    const stale = new FirstUseService(opened.db);
    const old = await stale.load();
    await first.save({ ...a, step: 2 });
    await expect(stale.save(old)).rejects.toThrow('cambió');
  });

  it('rejects unsaved or stale preview inputs and an ABA draft revision', async () => {
    const service = new FirstUseService(opened.db);
    const draft = await service.load();
    await expect(service.activate(draft)).rejects.toThrow('cambió');
    await service.save(draft);
    const stale = new FirstUseService(opened.db);
    const old = await stale.load();
    stale.preview(old);
    await expect(service.activate({ ...draft, goal: 'hypertrophy' })).rejects.toThrow('cambió');
    await service.save({ ...draft, goal: 'hypertrophy' });
    await service.save(draft);
    const before = await snapshot(opened.db);
    await expect(stale.activate(old)).rejects.toThrow('cambió');
    expect(await snapshot(opened.db)).toEqual(before);
  });

  it('does not overwrite committed settings changed after the draft was initialized, including after reopen', async () => {
    const service = new FirstUseService(opened.db);
    const draft = await service.load();
    await service.save(draft);
    service.preview(draft);
    await new SettingRepository(opened.db).save({ id: 'training-settings', key: 'training-settings', value: { ...defaultSettings, schedule: [2, 4, 6] } });
    const before = await snapshot(opened.db);
    const resumed = new FirstUseService(opened.db);
    await expect(resumed.activate(await resumed.load())).rejects.toThrow('cambió');
    await expect(service.activate(draft)).rejects.toThrow('cambió');
    expect(await snapshot(opened.db)).toEqual(before);
  });

  it('makes concurrent identical confirmations and retried completion idempotent', async () => {
    const service = new FirstUseService(opened.db);
    const draft = await service.load();
    await service.save(draft);
    const other = new FirstUseService(opened.db);
    await other.load();
    const ids = await Promise.all([service.activate(draft), other.activate(draft), service.activate(draft)]);
    expect(new Set(ids).size).toBe(1);
    const before = await snapshot(opened.db);
    expect(await new FirstUseService(opened.db).activate(draft)).toBe(ids[0]);
    await expect(service.save({ ...draft, step: 1 })).rejects.toThrow('cambió');
    await expect(service.activate({ ...draft, goal: 'hypertrophy' })).rejects.toThrow('cambió');
    expect(await snapshot(opened.db)).toEqual(before);
  });

  it('refreshes edited preferences only after an explicit choice while retaining goal and progress', async () => {
    const service = new FirstUseService(opened.db);
    const draft = await service.load();
    draft.step = 4; draft.experience = 'regular';
    await service.save(draft);
    await new SettingRepository(opened.db).save({ id: 'training-settings', key: 'training-settings', value: { ...defaultSettings, schedule: [2, 4, 6], profile: { benchPressReference: 100 } } });
    await expect(service.activate(draft)).rejects.toThrow('cambió');
    const refreshed = await service.useSavedSettings(draft);
    expect(refreshed.step).toBe(4);
    expect(refreshed.settings.schedule).toEqual([2, 4, 6]);
    expect(refreshed.references.benchPressReference.text).toBe('100');
    expect(service.preview(refreshed)[0]!.weeks[0]!.sessions[0]!.exercises.some(exercise => exercise.calculatedLoad === 80)).toBe(true);
    await expect(service.activate(refreshed)).resolves.toBe('first-use-v1-strength');
  });

  it.each(['READY', 'ACTIVE', 'COMPLETED'])('preserves an existing %s plan even if added after preview', async status => {
    const service = new FirstUseService(opened.db);
    const draft = await service.load();
    await service.save(draft);
    service.preview(draft);
    await new ProgramService(opened.db).createPlan([{ id: 'existing-plan', type: 'strength', weeks: 1 }]);
    await opened.db.runAsync('UPDATE cycle SET status = ?', status);
    const before = await snapshot(opened.db);
    await expect(service.activate(draft)).rejects.toThrow('cambió');
    expect(await snapshot(opened.db)).toEqual(before);
  });

  it.each(['history', 'restriction'])('preserves standalone %s without installing a first-use plan', async kind => {
    const service = new FirstUseService(opened.db);
    const draft = await service.load();
    await service.save(draft);
    if (kind === 'history') opened.sqlite.exec("INSERT INTO workout_session (id,schema_version,created_at,updated_at,status,prescribed_snapshot_json) VALUES ('history',1,'now','now','COMPLETED','{}')");
    else opened.sqlite.exec("INSERT INTO active_restriction (id,schema_version,created_at,updated_at,kind,details_json) VALUES ('restriction',1,'now','now','lumbar','{}')");
    const before = await snapshot(opened.db);
    await expect(service.activate(draft)).rejects.toThrow('cambió');
    expect(await snapshot(opened.db)).toEqual(before);
  });

  it.each(['program_template', 'cycle', 'training_week', 'session_plan', 'training-settings', 'COMMIT'])('rolls back all setup state on failure at %s and permits a retry', async point => {
    const run = opened.db.runSync!;
    const service = new FirstUseService(opened.db);
    const draft = await service.load();
    await service.save(draft);
    const before = await snapshot(opened.db);
    opened.db.runSync = (sql, ...params) => {
      if (point === 'COMMIT' && sql === 'COMMIT') throw new Error('injected write failure');
      const result = run(sql, ...params);
      if ((point === 'training-settings' && sql.includes('ON CONFLICT(key) DO UPDATE'))
        || sql.startsWith(`INSERT INTO ${point} `)) throw new Error('injected write failure');
      return result;
    };
    await expect(service.activate(draft)).rejects.toThrow('injected write failure');
    expect(await snapshot(opened.db)).toEqual(before);
    opened.db.runSync = run;
    await expect(service.activate(draft)).resolves.toBe('first-use-v1-reentry');
  });

  it('does not nest transactions or roll back writes owned by an existing shared-connection transaction', async () => {
    const service = new FirstUseService(opened.db);
    const draft = await service.load();
    await service.save(draft);
    opened.sqlite.exec('BEGIN IMMEDIATE');
    await new SettingRepository(opened.db).save({ id: 'unrelated', key: 'unrelated', value: 'keep' });
    await expect(service.activate(draft)).rejects.toThrow('transaction');
    opened.sqlite.exec('COMMIT');
    expect((await new SettingRepository(opened.db).get('unrelated'))?.value).toBe('keep');
    expect(await opened.db.getAllAsync('SELECT * FROM cycle')).toEqual([]);
  });

  it('does not yield between the atomic guard and commit', async () => {
    const service = new FirstUseService(opened.db);
    const draft = await service.load();
    await service.save(draft);
    const run = opened.db.runSync!;
    let interleaved = false;
    opened.db.runSync = (sql, ...params) => {
      if (sql === 'BEGIN IMMEDIATE') void Promise.resolve().then(() => { interleaved = true; });
      if (sql === 'COMMIT') expect(interleaved).toBe(false);
      return run(sql, ...params);
    };
    await service.activate(draft);
    expect(interleaved).toBe(true);
  });

  it('reconciles a successful COMMIT whose response was lost without a false rollback', async () => {
    const service = new FirstUseService(opened.db);
    const draft = await service.load(); await service.save(draft);
    const exec = opened.db.execSync!;
    opened.db.execSync = sql => { exec(sql); if (sql === 'COMMIT') throw new Error('lost acknowledgement'); };
    await expect(service.activate(draft)).resolves.toBe('first-use-v1-reentry');
    expect(opened.db.isInTransactionSync!()).toBe(false);
    expect(await new ProgramService(opened.db).getActiveCycleId()).toBe('first-use-v1-reentry');
  });

  it('rejects a settings race immediately before BEGIN and preserves the external write', async () => {
    const service = new FirstUseService(opened.db);
    const draft = await service.load();
    await service.save(draft);
    const run = opened.db.runSync!;
    opened.db.runSync = (sql, ...params) => {
      if (sql === 'BEGIN IMMEDIATE') run(`INSERT INTO app_setting (id,schema_version,created_at,updated_at,key,value_json)
        VALUES ('training-settings',1,'now','now','training-settings',?)`, JSON.stringify({ ...defaultSettings, units: 'lb' }));
      return run(sql, ...params);
    };
    await expect(service.activate(draft)).rejects.toThrow('cambió');
    expect((await new SettingRepository(opened.db).get('training-settings'))?.value).toMatchObject({ units: 'lb' });
    expect(await opened.db.getAllAsync('SELECT * FROM cycle')).toEqual([]);
    expect(await new SettingRepository(opened.db).get(FIRST_USE_COMPLETION_KEY)).toBeNull();
  });

  it('rolls back a real SQLite write failure, including completion and existing settings bytes', async () => {
    await new SettingRepository(opened.db).save({ id: 'training-settings', key: 'training-settings', value: defaultSettings });
    const service = new FirstUseService(opened.db);
    const draft = await service.load();
    draft.settings.schedule = [2, 4, 6];
    await service.save(draft);
    const before = await snapshot(opened.db);
    opened.sqlite.exec(`CREATE TEMP TRIGGER fail_setup_settings BEFORE UPDATE ON app_setting
      WHEN NEW.key = 'training-settings' BEGIN SELECT RAISE(ABORT, 'sqlite fault'); END`);
    await expect(service.activate(draft)).rejects.toThrow('sqlite fault');
    expect(await snapshot(opened.db)).toEqual(before);
  });

  it('fails closed without synchronous transaction support and leaves the draft intact', async () => {
    const service = new FirstUseService(opened.db);
    const draft = await service.load();
    await service.save(draft);
    const before = await snapshot(opened.db);
    delete opened.db.runSync;
    await expect(service.activate(draft)).rejects.toThrow('atómica');
    expect(await snapshot(opened.db)).toEqual(before);
    expect((await new SettingRepository(opened.db).get(FIRST_USE_DRAFT_KEY))?.value).toMatchObject({ revision: 1, draft });
  });
});
