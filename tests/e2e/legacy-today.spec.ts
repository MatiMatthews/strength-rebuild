import { test, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { readPersistence } from './persistence';

for (const state of ['unstarted', 'projection-only', 'closed-cycle', 'completed-session', 'active-workout']) {
const closedCycle = state === 'closed-cycle';
const protectedWork = ['closed-cycle', 'completed-session', 'active-workout'].includes(state);
test(`${state}: canonical exercises and legacy references remain truthful without rewriting stored work`, async ({ page, context }, info) => {
  await page.goto('/plan');
  await page.getByRole('button', { name: 'Crear vista previa del ciclo', exact: true }).click();
  await expect(page.getByText('Vista previa creada y guardada en este dispositivo.')).toBeVisible();
  await page.getByRole('button', { name: 'Activar plan confirmado', exact: true }).click();
  await expect(page.getByText('Plan activo', { exact: true })).toBeVisible();
  await page.goto('/');
  await expect(page.getByText('Esta sesión contiene referencias desconocidas.', { exact: false })).toHaveCount(0);
  await readPersistence(page, info);
  await page.close();
  // Mutate only the disposable test context, with the production SQLite worker closed.
  const filename = info.outputPath('canonical.sqlite');
  const db = new DatabaseSync(filename);
  const row = db.prepare(`SELECT s.id, s.snapshot_json FROM session_plan s
    JOIN training_week w ON w.id = s.training_week_id JOIN cycle c ON c.id = w.cycle_id
    WHERE c.status = 'ACTIVE' ORDER BY w.week_index, s.day_index LIMIT 1`).get()!;
  const snapshot = JSON.parse(String(row.snapshot_json));
  snapshot.exercises[0].exerciseId = 'missing-legacy';
  if (state !== 'projection-only') {
    // Corrupt the executable source, not just its legacy display projection.
    const block = snapshot.blocks.find((entry: { role: string; exercises: unknown[] }) => entry.role !== 'finish-review' && entry.exercises.length);
    expect(block).toBeDefined();
    block.exercises[0].exerciseId = 'missing-legacy';
  }
  db.prepare('UPDATE session_plan SET snapshot_json = ? WHERE id = ?').run(JSON.stringify(snapshot), row.id!);
  if (closedCycle) db.prepare("UPDATE cycle SET status = 'COMPLETED' WHERE status = 'ACTIVE'").run();
  if (state === 'completed-session') db.prepare("UPDATE session_plan SET status = 'COMPLETED' WHERE id = ?").run(row.id!);
  if (state === 'active-workout' || state === 'completed-session') {
    db.prepare(`INSERT INTO workout_session (id, schema_version, created_at, updated_at, session_plan_id, status, prescribed_snapshot_json, actual_snapshot_json)
      VALUES ('synthetic-protected', 1, '2026-01-01', '2026-01-01', ?, ?, ?, ?)`).run(
      row.id!, state === 'active-workout' ? 'IN_PROGRESS' : 'COMPLETED', JSON.stringify(snapshot),
      JSON.stringify({ exercises: [{ exerciseId: 'missing-legacy', sets: [{ load: '60', reps: '8', notes: 'Keep original work', completed: true }] }], activeExerciseIndex: 0 }),
    );
  }
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
    let before = await readPersistence(fixture, info);
    await fixture.close();


  for (const attempt of [1, 2]) {
    const app = await context.newPage();
    if (state === 'projection-only') {
      await app.goto('/');
      await expect(app.getByTestId('brand-masthead')).toBeVisible();
      await expect(app.getByText('Activación general', { exact: true })).toBeVisible();
      await expect(app.getByText('Esta sesión contiene referencias desconocidas.', { exact: false })).toHaveCount(0);
      await expect(app.getByText('Ejercicio no disponible en el catálogo', { exact: true })).toHaveCount(0);
      expect(await readPersistence(app, info), 'Canonical rendering must not rewrite the stale projection').toEqual(before);
      await app.goto('/plan');
      await expect(app.getByRole('button', { name: 'Revisar referencias de semana 1, sesión 1', exact: true })).toBeVisible();
      expect(await readPersistence(app, info)).toEqual(before);
      await app.close();
      continue;
    }
    if (state === 'unstarted') {
      await app.goto('/');
      await expect(app.getByText('Esta sesión contiene referencias desconocidas. Consulta el plan; no se han sustituido ejercicios ni modificado tus registros.', { exact: true })).toBeVisible();
      await expect(app.getByText('Ejercicio no disponible en el catálogo', { exact: true })).toHaveCount(1);
      await expect(app.getByText('missing-legacy', { exact: true })).toHaveCount(0);
      expect(await readPersistence(app, info)).toEqual(before);
      await app.screenshot({ path: info.outputPath(`today-unknown-${attempt}.png`), fullPage: true });
    }
    await app.goto('/plan');
    if (protectedWork) {
      await expect(app.getByText('Sesiones iniciadas o cerradas con referencias originales: 1. No se sustituye el trabajo registrado.', { exact: true })).toBeVisible();
      await expect(app.getByRole('button', { name: 'Revisar referencias de semana 1, sesión 1', exact: true })).toHaveCount(0);
      expect(await readPersistence(app, info)).toEqual(before);
      await app.close();
      continue;
    }
    await app.getByRole('button', { name: 'Revisar referencias de semana 1, sesión 1', exact: true }).click();
    await app.getByLabel('Buscar ejercicio compatible', { exact: true }).fill('sin coincidencias');
    await app.getByRole('button', { name: 'Revisar equipo y restricciones', exact: true }).click();
    await expect(app).toHaveURL(/settings/);
    expect(await readPersistence(app, info)).toEqual(before);
    {
      await app.getByLabel('Alternar equipo Bandas', { exact: true }).click();
      await app.getByRole('button', { name: 'Guardar configuración local', exact: true }).click();
      await expect(app.getByText('Configuración guardada en este dispositivo.', { exact: true })).toBeVisible();
      const saved = await readPersistence(app, info);
      expect({ ...saved, settings: before.settings }).toEqual(before);
      expect(JSON.parse(String(saved.settings.find(row => row.key === 'training-settings')!.value_json)).equipment.includes('Bandas')).toBe(attempt === 1);
      before = saved;
    }
    await app.getByRole('button', { name: 'Volver a Hoy', exact: true }).click();
    await expect(app).toHaveURL(/plan/);
    if (await app.getByRole('button', { name: 'Cancelar revisión de referencias', exact: true }).count()) {
      await app.getByRole('button', { name: 'Cancelar revisión de referencias', exact: true }).click();
    }
    await app.getByRole('button', { name: 'Revisar referencias de semana 1, sesión 1', exact: true }).click();
    const pallof = app.getByRole('button', { name: 'Ver propuesta Press Pallof para missing-legacy', exact: true });
    if (attempt === 1) await expect(pallof).toBeVisible();
    else await expect(pallof).toHaveCount(0);
    await app.getByLabel('Buscar ejercicio compatible', { exact: true }).fill('Press banca');
    await app.getByRole('button', { name: 'Ver propuesta Press banca para missing-legacy', exact: true }).click();
    await expect(app.getByText('Propuesta: Press banca', { exact: true })).toBeVisible();
    await expect(app.getByText('Carga por definir; no se transfiere la carga del ejercicio desconocido.', { exact: true })).toBeVisible();
    await expect(app.getByText('Solo vista previa. Tu sesión original sigue intacta.', { exact: true })).toBeVisible();
    await expect(app.getByText('Instrucciones locales: Press banca', { exact: true })).toBeVisible();
    await expect(app.getByText('Apoya cabeza, espalda y pies.', { exact: true })).toBeVisible();
    await expect(app.getByText('Baja con control y empuja sin perder los apoyos.', { exact: true })).toBeVisible();
    expect(await readPersistence(app, info)).toEqual(before);
    await app.screenshot({ path: info.outputPath(`legacy-preview-${attempt}.png`), fullPage: true });
    await app.getByRole('button', { name: 'Cancelar revisión de referencias', exact: true }).click();
    await expect(app.getByText('Propuesta: Press banca', { exact: true })).toHaveCount(0);
    expect(await readPersistence(app, info)).toEqual(before);
    await app.close();
  }
});

}
