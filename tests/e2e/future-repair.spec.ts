import { test, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { readPersistence } from './persistence';

for (const recordedStatus of ['COMPLETED', 'IN_PROGRESS'] as const) test(`repair a future session beside ${recordedStatus} work and preserve its attribution`, async ({ page, context }, info) => {
  await page.goto('/plan');
  await page.getByRole('button', { name: 'Crear vista previa del ciclo', exact: true }).click();
  await expect(page.getByText('Vista previa creada y guardada en este dispositivo.')).toBeVisible();
  await readPersistence(page, info);
  await page.close();
  const filename = info.outputPath('canonical.sqlite');
  const db = new DatabaseSync(filename);
  const row = db.prepare(`SELECT s.id, s.snapshot_json FROM session_plan s JOIN training_week w ON w.id = s.training_week_id JOIN cycle c ON c.id = w.cycle_id ORDER BY c.rowid, w.week_index, s.day_index LIMIT 1 OFFSET 1`).get()!;
  const snapshot = JSON.parse(String(row.snapshot_json));
  snapshot.exercises[0] = { ...snapshot.exercises[0], exerciseId: 'missing-legacy', calculatedLoad: 999 };
  snapshot.blocks[0].exercises[0] = snapshot.exercises[0];
  db.prepare('UPDATE session_plan SET snapshot_json = ? WHERE id = ?').run(JSON.stringify(snapshot), row.id!);
  const first = db.prepare('SELECT id, snapshot_json FROM session_plan ORDER BY rowid LIMIT 1').get()!;
  const protectedDraft = { id: 'protected-work', sessionPlanId: first.id, activeExerciseIndex: 0,
    timer: { durationSeconds: 0, remainingSeconds: 0, runningSince: null }, safetyModifications: [],
    exercises: [{ exerciseId: 'barbell-bench-press', originalExerciseId: 'barbell-bench-press',
      sets: [{ load: '60', reps: '8', rir: '2', pain: 0, technique: 'Limpia', notes: 'Synthetic protected work', completed: true, skipped: false, disposition: 'COMPLETED' }] }] };
  db.prepare(`INSERT INTO workout_session (id,schema_version,created_at,updated_at,session_plan_id,status,prescribed_snapshot_json,actual_snapshot_json,completed_at)
    VALUES ('protected-work',1,'now','now',?,?,?,?,?)`).run(first.id!, recordedStatus, first.snapshot_json!, JSON.stringify(protectedDraft), recordedStatus === 'COMPLETED' ? 'now' : null);
  if (recordedStatus === 'COMPLETED') db.prepare("UPDATE session_plan SET status = 'COMPLETED' WHERE id = ?").run(first.id!);
  db.prepare("UPDATE cycle SET status = 'ACTIVE' WHERE rowid = (SELECT min(rowid) FROM cycle)").run();
  db.close();
    const fixture = await context.newPage();
    await fixture.route('**/__synthetic_fixture', route => route.fulfill({ contentType: 'text/html', body: '<title>Synthetic fixture</title>' }));
    await fixture.goto('/__synthetic_fixture');
    await fixture.evaluate(async bytes => {
      const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle('expo-sqlite');
      const handles = directory as FileSystemDirectoryHandle & { values(): AsyncIterable<FileSystemFileHandle> };
      let changed = 0;
      for await (const handle of handles.values()) {
        if (handle.kind !== 'file') continue;
        const data = new Uint8Array(await (await handle.getFile()).arrayBuffer());
        const name = new TextDecoder().decode(data.slice(0, 512)).split('\0')[0];
        if (!name?.endsWith('/strength-rebuild-v2.db')) continue;
        const writer = await handle.createWritable();
        await writer.write(data.slice(0, 4096));
        await writer.write(new Uint8Array(bytes));
        await writer.close();
        changed++;
      }
      if (changed !== 1) throw new Error(`Expected one synthetic database, changed ${changed}`);
    }, Array.from(readFileSync(filename)));
    const before = await readPersistence(fixture, info);
    await fixture.close();



  let app = await context.newPage();
  const preview = async () => {
    await app.goto('/plan');
    await app.getByRole('button', { name: 'Revisar referencias de semana 1, sesión 2', exact: true }).click();
    await app.getByLabel('Buscar ejercicio compatible', { exact: true }).fill('Press banca');
    await app.getByRole('button', { name: 'Ver propuesta Press banca para missing-legacy', exact: true }).click();
    await expect(app.getByText('Carga por definir; no se transfiere la carga del ejercicio desconocido.')).toBeVisible();
    await app.getByRole('button', { name: 'Reparar esta referencia', exact: true }).click();
  };
  await preview();
  expect(await readPersistence(app, info)).toEqual(before);
  await app.getByRole('button', { name: 'Cancelar revisión de referencias', exact: true }).click();
  expect(await readPersistence(app, info)).toEqual(before);
  await app.close(); app = await context.newPage();
  await preview();
  // Two immediate presses exercise the production handler while its transaction is pending.
  await app.getByRole('button', { name: 'Confirmar reparación', exact: true }).evaluate(button => { (button as HTMLElement).click(); (button as HTMLElement).click(); });
  await expect(app.getByText('Referencia reparada. Se conserva el original y tu elección queda registrada.')).toBeVisible();
  expect(await readPersistence(app, info)).toEqual(before);
  await app.close(); app = await context.newPage();
  await app.goto('/plan');
  await expect(app.getByRole('button', { name: 'Revisar referencias de semana 1, sesión 2', exact: true })).toHaveCount(0);
  await readPersistence(app, info);
  const repaired = new DatabaseSync(info.outputPath('canonical.sqlite'), { readOnly: true });
  expect(repaired.prepare("SELECT * FROM decision_log WHERE policy_version = 'legacy-prescription-repair-v1'").all()).toHaveLength(1);
  repaired.close();
  if (recordedStatus === 'IN_PROGRESS') {
    expect((await readPersistence(app, info)).workouts).toEqual(before.workouts);
    return;
  }
  await app.goto('/');
  await app.getByRole('button', { name: 'Revisar preparación para entrenar', exact: true }).click();
  await app.getByLabel('Dolor de 0 a 2, estable', { exact: true }).click();
  await app.getByRole('button', { name: 'Confirmar preparación', exact: true }).click();
  await expect(app.getByTestId('workout-screen')).toBeVisible();
  const after = await readPersistence(app, info);
  const actual = JSON.parse(String(after.workouts.find(w => w.id !== 'protected-work')!.actual_snapshot_json));
  expect(actual.exercises[0].exerciseId).toBe('barbell-bench-press');
  expect(actual.exercises[0].sets[0].load).not.toBe('999');
  expect(after.workouts.find(w => w.id === 'protected-work')).toEqual(before.workouts[0]);
  expect(after.sessionSnapshots).toEqual(before.sessionSnapshots);
  const persisted = new DatabaseSync(info.outputPath('canonical.sqlite'), { readOnly: true });
  expect(persisted.prepare("SELECT * FROM decision_log WHERE policy_version = 'legacy-prescription-repair-v1'").all()).toHaveLength(1);
  persisted.close();
  await app.close(); app = await context.newPage();
  await app.goto('/');
  await app.getByRole('button', { name: 'Continuar entrenamiento', exact: true }).click();
  if (await app.getByLabel('Dolor de 0 a 2, estable', { exact: true }).isVisible()) {
    await app.getByLabel('Dolor de 0 a 2, estable', { exact: true }).click();
    await app.getByRole('button', { name: 'Confirmar preparación', exact: true }).click();
  }
  await expect(app.getByTestId('workout-screen')).toBeVisible();
  expect((await readPersistence(app, info)).workouts.map(row => row.actual_snapshot_json)).toEqual(after.workouts.map(row => row.actual_snapshot_json));
});
