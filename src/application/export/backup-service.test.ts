import { DatabaseSync } from 'node:sqlite';

import { migrateDatabase, type MigrationDatabase } from '../../data/migrations';
import type { RepositoryDatabase, SqlValue } from '../../data/repositories';
import { decryptBackupEnvelope } from './backup-envelope';
import { BACKUP_LIMITS, BackupError, BackupService, compactBackupTransport, classifyPortableBackup } from './backup-service';

function database() {
  const sqlite = new DatabaseSync(':memory:');
  const db = { exec: (sql: string) => sqlite.exec(sql), runAsync: async (sql: string, ...params: SqlValue[]) => { const result = sqlite.prepare(sql).run(...params); return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) }; }, getFirstAsync: async (sql: string, ...params: SqlValue[]) => (sqlite.prepare(sql).get(...params) ?? null) as never, getAllAsync: async (sql: string, ...params: SqlValue[]) => sqlite.prepare(sql).all(...params) as never, withTransactionAsync: async (task: () => Promise<void>) => { sqlite.exec('BEGIN'); try { await task(); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } } as RepositoryDatabase & MigrationDatabase;
  return { db, sqlite };
}

describe('BackupService', () => {
  it('classifies encrypted and legacy inputs without importing either', () => {
    expect(classifyPortableBackup('SRB2.metadata.ciphertext')).toEqual({ kind: 'encrypted' });
    expect(classifyPortableBackup('{"version":1,"tables":{}}')).toEqual({ kind: 'legacy', confirmationRequired: true });
    expect(() => classifyPortableBackup('not-json')).toThrow(expect.objectContaining({ code: 'corrupt' }));
  });

  it('enforces every portable-backup resource bound at the boundary and one over', async () => {
    const target = database(); await migrateDatabase(target.db);
    const service = new BackupService(target.db);
    const base = JSON.parse(await service.export()) as { tables: Record<string, Record<string, SqlValue>[]> };
    const row = { id: 'x', schema_version: 1, created_at: 'a', updated_at: 'a', key: 'k', value_json: '"v"' };
    base.tables.app_setting = Array.from({ length: BACKUP_LIMITS.maxRowsPerTable }, (_, index) => ({ ...row, id: `x-${index}` }));
    await expect(service.preview(JSON.stringify(base))).resolves.toMatchObject({ records: BACKUP_LIMITS.maxRowsPerTable });
    base.tables.app_setting.push({ ...row, id: 'one-over' });
    await expect(service.preview(JSON.stringify(base))).rejects.toMatchObject({ code: 'oversized' });

    const boundary = 'x'.repeat(BACKUP_LIMITS.maxFieldBytes);
    base.tables.app_setting = [{ ...row, id: 'boundary', key: boundary }];
    await expect(service.preview(JSON.stringify(base))).resolves.toMatchObject({ records: 1 });
    base.tables.app_setting = [{ ...row, id: 'one-over', key: `${boundary}x` }];
    await expect(service.restore(JSON.stringify(base), true)).rejects.toMatchObject({ code: 'oversized' });
    expect(await target.db.getFirstAsync('SELECT id FROM app_setting LIMIT 1')).toBeNull();
    target.sqlite.close();
  });

  it('rejects oversized encoded and decompressed input before any database query', async () => {
    const db = { getFirstAsync: jest.fn(), getAllAsync: jest.fn(), runAsync: jest.fn(), withTransactionAsync: jest.fn() } as unknown as RepositoryDatabase;
    const service = new BackupService(db);
    await expect(service.restore('x'.repeat(BACKUP_LIMITS.maxInputBytes + 1), true)).rejects.toMatchObject({ code: 'oversized' });
    expect(db.getFirstAsync).not.toHaveBeenCalled();
    expect(db.runAsync).not.toHaveBeenCalled();
  });
  it('exports personal records only inside an authenticated encrypted envelope', async () => {
    const source = database(); await migrateDatabase(source.db);
    await source.db.runAsync("INSERT INTO app_setting (id,schema_version,created_at,updated_at,key,value_json) VALUES ('private-athlete',1,'a','a','athlete_name','\"Matías Private\"')");
    const encrypted = await new BackupService(source.db, () => '2026-09-01T00:00:00.000Z').exportEncrypted('strong passphrase');

    expect(encrypted).toMatch(/^SRB2\./u);
    expect(encrypted).not.toContain('Matías Private');
    expect(encrypted).not.toContain('athlete_name');
    await expect(decryptBackupEnvelope(encrypted, 'strong passphrase')).resolves.toContain('Matías Private');
    source.sqlite.close();
  });

  it('restores an authenticated backup after a simulated process restart', async () => {
    const source = database(); await migrateDatabase(source.db);
    await source.db.runAsync("INSERT INTO app_setting (id,schema_version,created_at,updated_at,key,value_json) VALUES ('portable',1,'a','a','units','\"kg\"')");
    const encrypted = await new BackupService(source.db).exportEncrypted('portable secret');
    const target = database(); await migrateDatabase(target.db);

    await expect(new BackupService(target.db).previewPortable(encrypted, 'portable secret')).resolves.toMatchObject({ kind: 'encrypted', records: 1 });
    await new BackupService(target.db).restorePortable(encrypted, { secret: 'portable secret', replaceConfirmed: true });
    await expect(new BackupService(target.db).export()).resolves.toContain('portable');
    source.sqlite.close(); target.sqlite.close();
  });

  it('authenticates and validates portable input before querying or mutating SQLite', async () => {
    const source = database(); await migrateDatabase(source.db);
    const encrypted = await new BackupService(source.db).exportEncrypted('right secret');
    const db = { getFirstAsync: jest.fn(), getAllAsync: jest.fn(), runAsync: jest.fn(), withTransactionAsync: jest.fn() } as unknown as RepositoryDatabase;

    await expect(new BackupService(db).restorePortable(encrypted, { secret: 'wrong secret', replaceConfirmed: true })).rejects.toMatchObject({ code: 'rejected' });
    expect(db.getFirstAsync).not.toHaveBeenCalled();
    expect(db.runAsync).not.toHaveBeenCalled();
    expect(db.withTransactionAsync).not.toHaveBeenCalled();
    source.sqlite.close();
  });

  it('requires informed legacy confirmation independently of replacement confirmation', async () => {
    const target = database(); await migrateDatabase(target.db);
    const legacy = await new BackupService(target.db).export();
    await expect(new BackupService(target.db).restorePortable(legacy, { replaceConfirmed: true })).rejects.toMatchObject({ code: 'rejected' });
    await expect(new BackupService(target.db).restorePortable(legacy, { legacyConfirmed: true, replaceConfirmed: true })).resolves.toBeUndefined();
    target.sqlite.close();
  });

  it('rolls back the complete replacement when a mutation fails', async () => {
    const source = database(); await migrateDatabase(source.db);
    await source.db.runAsync("INSERT INTO app_setting (id,schema_version,created_at,updated_at,key,value_json) VALUES ('incoming',1,'a','a','units','\"kg\"')");
    const encrypted = await new BackupService(source.db).exportEncrypted('secret');
    const target = database(); await migrateDatabase(target.db);
    await target.db.runAsync("INSERT INTO app_setting (id,schema_version,created_at,updated_at,key,value_json) VALUES ('existing',1,'a','a','units','\"lb\"')");
    const run = target.db.runAsync.bind(target.db);
    target.db.runAsync = async (sql, ...params) => { if (sql.startsWith('INSERT INTO app_setting')) throw new Error('injected write failure'); return run(sql, ...params); };

    await expect(new BackupService(target.db).restorePortable(encrypted, { secret: 'secret', replaceConfirmed: true })).rejects.toThrow('injected write failure');
    await expect(target.db.getAllAsync<{ id: string }>('SELECT id FROM app_setting ORDER BY id')).resolves.toEqual([{ id: 'existing' }]);
    source.sqlite.close(); target.sqlite.close();
  });

  it('round-trips a compact schema-versioned transport without losing row values', async () => {
    const source = database(); await migrateDatabase(source.db);
    await source.db.runAsync("INSERT INTO app_setting (id,schema_version,created_at,updated_at,key,value_json) VALUES ('s',1,'a','a','units','\"kilógramo 🏋️\"')");
    const service = new BackupService(source.db, () => '2026-08-27T00:00:00.000Z');
    const canonical = await service.export();
    const compact = compactBackupTransport(canonical);

    expect(compact).toContain('"schemaVersion":1');
    expect(compact).toContain('"encoding":"lzw18-base64"');
    expect(compact.length).toBeLessThan(1400);
    await expect(service.preview(compact)).resolves.toMatchObject({ version: 1, records: 1 });
    const target = database(); await migrateDatabase(target.db);
    await new BackupService(target.db).restore(compact, true);
    await expect(target.db.getFirstAsync<{ value_json: string }>("SELECT value_json FROM app_setting WHERE id='s'"))
      .resolves.toEqual({ value_json: '"kilógramo 🏋️"' });
    source.sqlite.close(); target.sqlite.close();
  });
  it('keeps a highly repetitive native backup below the Android Binder budget', () => {
    const rows = Array.from({ length: 20_000 }, (_, index) => ({ id: `row-${index}`, schema_version: 1, created_at: 'a', updated_at: 'a', key: `key-${index}`, value_json: '"repeated-value"' }));
    const tables = Object.fromEntries(['user_profile','equipment_profile','active_restriction','training_max','program_template','cycle','training_week','session_plan','session_exercise','workout_session','set_log','symptom_log','session_note','timer_state','progression_proposal','substitution_decision','decision_log'].map((table) => [table, []]));
    const compact = compactBackupTransport(JSON.stringify({ version: 1, exportedAt: 'a', tables: { ...tables, app_setting: rows } }));
    expect(compact).toContain('"encoding":"lzw18-base64"');
    expect(compact.length).toBeLessThan(500_000);
  });
  it('round trips versioned local data and previews conflicts', async () => {
    const source = database(); await migrateDatabase(source.db);
    await source.db.runAsync("INSERT INTO app_setting (id,schema_version,created_at,updated_at,key,value_json) VALUES ('s',1,'a','a','units','\"kg\"')");
    const document = await new BackupService(source.db).export();
    expect(document).not.toContain('\n');
    const target = database(); await migrateDatabase(target.db);
    await target.db.runAsync("INSERT INTO app_setting (id,schema_version,created_at,updated_at,key,value_json) VALUES ('old',1,'a','a','units','\"lb\"')");
    const service = new BackupService(target.db);
    expect(await service.preview(document)).toMatchObject({ version: 1, conflicts: 1, records: 1 });
    await service.restore(document, true);
    expect(await target.db.getFirstAsync<{ value_json: string }>("SELECT value_json FROM app_setting WHERE key='units'")).toEqual({ value_json: '"kg"' });
    source.sqlite.close(); target.sqlite.close();
  });

  it('rejects corrupt documents and rejection leaves the database unchanged', async () => {
    const target = database(); await migrateDatabase(target.db);
    await target.db.runAsync("INSERT INTO app_setting (id,schema_version,created_at,updated_at,key,value_json) VALUES ('s',1,'a','a','units','\"kg\"')");
    const service = new BackupService(target.db);
    await expect(service.preview('{broken')).rejects.toBeInstanceOf(BackupError);
    await expect(service.restore(await service.export(), false)).rejects.toMatchObject({ code: 'rejected' });
    expect(await target.db.getFirstAsync<{ id: string }>("SELECT id FROM app_setting WHERE key='units'")).toEqual({ id: 's' });
    target.sqlite.close();
  });

  it('rejects duplicate identities, broken relationships, and invalid embedded JSON before mutation', async () => {
    const target = database(); await migrateDatabase(target.db);
    await target.db.runAsync("INSERT INTO app_setting (id,schema_version,created_at,updated_at,key,value_json) VALUES ('live',1,'a','a','units','\"kg\"')");
    const service = new BackupService(target.db);
    const document = JSON.parse(await service.export()) as { tables: Record<string, Record<string, SqlValue>[]> };
    document.tables.cycle = [{ id: 'cycle', schema_version: 1, created_at: 'a', updated_at: 'a', program_template_id: 'missing', kind: 'strength', status: 'ACTIVE', policy_version: 'cycle-prescription-v1', snapshot_json: '{broken' }];
    await expect(service.preview(JSON.stringify(document))).rejects.toMatchObject({ code: 'corrupt' });
    await expect(service.restore(JSON.stringify(document), true)).rejects.toMatchObject({ code: 'corrupt' });
    expect(await target.db.getFirstAsync<{ id: string }>("SELECT id FROM app_setting WHERE key='units'")).toEqual({ id: 'live' });

    document.tables.cycle = [];
    document.tables.app_setting!.push({ ...document.tables.app_setting![0], key: 'duplicate-key' });
    await expect(service.preview(JSON.stringify(document))).rejects.toMatchObject({ code: 'corrupt' });
    target.sqlite.close();
  });
});
