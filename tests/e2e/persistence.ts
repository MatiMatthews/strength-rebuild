import { expect, type Page, type TestInfo } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

// Read the real OPFS file, not application state or a production test hook.
// The locked Expo SQLite AccessHandlePoolVFS stores a 512-byte pathname in a
// 4096-byte header before the SQLite file. Fail loudly if that format changes.
export async function readPersistence(page: Page, info: TestInfo) {
  const bytes = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle('expo-sqlite');
    const matches: number[][] = [];
    const handles = directory as FileSystemDirectoryHandle & { values(): AsyncIterable<FileSystemFileHandle> };
    for await (const handle of handles.values()) {
      if (handle.kind !== 'file') continue;
      const data = new Uint8Array(await (await handle.getFile()).arrayBuffer());
      const name = new TextDecoder().decode(data.slice(0, 512)).split('\0')[0];
      if (name?.endsWith('/strength-rebuild-v2.db')) matches.push(Array.from(data.slice(4096)));
    }
    if (matches.length !== 1) throw new Error(`Expected one canonical SQLite file, found ${matches.length}`);
    return matches[0]!;
  });
  const buffer = Buffer.from(bytes);
  expect(buffer.subarray(0, 16).toString()).toBe('SQLite format 3\0');
  const filename = info.outputPath('canonical.sqlite');
  writeFileSync(filename, buffer);
  const db = new DatabaseSync(filename, { readOnly: true });
  try {
    expect(db.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
    return {
      settings: db.prepare('SELECT key, value_json FROM app_setting ORDER BY key').all(),
      templates: db.prepare('SELECT id, snapshot_json FROM program_template ORDER BY id').all(),
      sessionSnapshots: db.prepare('SELECT id, snapshot_json FROM session_plan ORDER BY id').all(),
      proposals: db.prepare('SELECT id, cycle_id, policy_version, inputs_json, output_json, decision FROM progression_proposal').all(),
      plannedSessions: db.prepare('SELECT s.id, s.day_index, s.status, w.week_index, w.status AS week_status FROM session_plan s JOIN training_week w ON w.id = s.training_week_id JOIN cycle c ON c.id = w.cycle_id WHERE c.status = \'ACTIVE\' ORDER BY w.week_index, s.day_index').all(),
      cycles: db.prepare('SELECT id, kind, status FROM cycle ORDER BY id').all(),
      weeks: db.prepare('SELECT count(*) AS count FROM training_week').get(),
      sessions: db.prepare('SELECT count(*) AS count FROM session_plan').get(),
      workouts: db.prepare('SELECT id, status, actual_snapshot_json FROM workout_session').all(),
      // Active workouts persist their canonical draft; set_log is materialized on finish.
      sets: db.prepare(`SELECT json_extract(s.value, '$.load') AS load,
        json_extract(s.value, '$.reps') AS reps, json_extract(s.value, '$.notes') AS notes,
        json_extract(s.value, '$.disposition') AS disposition
        FROM workout_session w, json_each(w.actual_snapshot_json, '$.exercises') e,
        json_each(e.value, '$.sets') s
        WHERE json_extract(s.value, '$.notes') = ?`).all('Synthetic persistence smoke'),
    };
  } finally { db.close(); }
}
