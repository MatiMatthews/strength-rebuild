import { test, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, copyFileSync } from 'node:fs';
import { readPersistence } from './persistence';

for (const [choice, label] of [['ACCEPTED', 'Aceptar propuesta semanal'], ['KEPT', 'Mantener plan semanal'], ['REJECTED', 'Rechazar propuesta semanal']]) test(`weekly review: ${choice} recovers week two and enters week three`, async ({ page, context }, info) => {
  test.setTimeout(150_000);
  await page.goto('/plan');
  await page.getByRole('button', { name: 'Crear vista previa del ciclo', exact: true }).click();
  await expect(page.getByText('Vista previa creada y guardada en este dispositivo.')).toBeVisible();
  await readPersistence(page, info); await page.close();
  // Synthetic prior weeks only; the final session and review use production controls.
  const db = new DatabaseSync(info.outputPath('canonical.sqlite'));
  const cycle = db.prepare("SELECT id FROM cycle WHERE kind = 'hypertrophy'").get()!;
  db.prepare("UPDATE cycle SET status = 'ACTIVE' WHERE id = ?").run(cycle.id!);
  db.prepare("UPDATE training_week SET status = 'COMPLETED' WHERE cycle_id = ? AND week_index = 1").run(cycle.id!);
  db.prepare("UPDATE training_week SET status = 'PLANNED' WHERE cycle_id = ? AND week_index = 2").run(cycle.id!);
  db.prepare("UPDATE session_plan SET status = 'COMPLETED' WHERE training_week_id IN (SELECT id FROM training_week WHERE cycle_id = ? AND week_index = 1) OR (training_week_id IN (SELECT id FROM training_week WHERE cycle_id = ? AND week_index = 2) AND day_index < 3)").run(cycle.id!, cycle.id!);
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
    }, Array.from(readFileSync(info.outputPath('canonical.sqlite'))));

  await fixture.close();
  const app = await context.newPage(); await app.goto('/');
  await app.getByRole('button', { name: 'Revisar preparación para entrenar', exact: true }).click();
  await app.getByLabel('Dolor de 0 a 2, estable', { exact: true }).click();
  await app.getByRole('button', { name: 'Confirmar preparación', exact: true }).click();
  await expect(app.getByTestId('workout-screen')).toBeVisible();
  for (let e = 0; e < 40; e++) {
    const count = await app.getByTestId('set-entry-row').count(); expect(count).toBeGreaterThan(0);
    for (let s = 1; s <= count; s++) {
      await app.getByLabel(`Carga de la serie ${s}`, { exact: true }).fill('0');
      await app.getByLabel(`Repeticiones de la serie ${s}`, { exact: true }).fill('8');
      await app.getByRole('button', { name: `Completar serie ${s}`, exact: true }).click();
    }
    const next = app.getByRole('button', { name: 'Siguiente ejercicio', exact: true });
    if (await next.isDisabled()) break; await next.click();
  }
  await app.getByRole('button', { name: 'Revisar y terminar entrenamiento', exact: true }).click();
  await app.getByRole('button', { name: 'Confirmar fin de entrenamiento', exact: true }).click();
  await expect(app.getByTestId('finish-review')).not.toBeVisible();
  await app.goto('/');
  await app.getByRole('button', { name: 'Abrir revisión semanal', exact: true }).click();
  await expect(app.getByText('Revisión de semana 2', { exact: true })).toBeVisible();
  await app.getByRole('button', { name: 'Crear propuesta semanal', exact: true }).click();
  await expect(app.getByRole('button', { name: label!, exact: true })).toBeVisible();
  const before = await readPersistence(app, info);
  copyFileSync(info.outputPath('canonical.sqlite'), info.outputPath('pending-week-two.sqlite'));
  const proposal = before.proposals.find(row => row.policy_version === 'weekly-review-v1'); expect(proposal).toBeDefined();
  await app.getByRole('button', { name: 'Volver a Hoy', exact: true }).click();
  await app.goto('/plan');
  await app.getByRole('button', { name: 'Abrir revisión semanal', exact: true }).click();
  await app.reload();
  expect((await readPersistence(app, info)).proposals).toEqual(before.proposals);
  await app.getByRole('button', { name: label!, exact: true }).click();
  await expect(app.getByText('No hay revisiones semanales pendientes.', { exact: false })).toBeVisible();
  await app.reload();
  const after = await readPersistence(app, info);
  expect(after.proposals.find(row => row.id === proposal!.id)?.decision).toBe(choice);
  expect(after.sessionSnapshots).toEqual(before.sessionSnapshots); expect(after.workouts).toEqual(before.workouts);
  await app.getByRole('button', { name: 'Volver a Hoy', exact: true }).click();
  await app.getByRole('button', { name: 'Revisar preparación para entrenar', exact: true }).click();
  await app.getByLabel('Dolor de 0 a 2, estable', { exact: true }).click();
  await app.getByRole('button', { name: 'Confirmar preparación', exact: true }).click();
  await expect(app.getByTestId('workout-screen')).toBeVisible();
  const final = await readPersistence(app, info);
  expect(final.workouts.filter(row => row.status === 'IN_PROGRESS')).toHaveLength(1);
  expect(final.plannedSessions.find(row => row.id === final.workouts.find(row => row.status === 'IN_PROGRESS')!.session_plan_id)?.week_index).toBe(3);
  await app.screenshot({ path: info.outputPath('week-three.png'), fullPage: true });
});
