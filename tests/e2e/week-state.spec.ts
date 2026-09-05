import { test, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, copyFileSync } from 'node:fs';
import { readPersistence } from './persistence';

for (const mode of ['final', 'deload']) test(`canonical week state: ${mode} survives reopen without activating another cycle`, async ({ page, context }, info) => {
  await page.goto('/plan');
  await page.getByRole('button', { name: 'Crear vista previa del ciclo', exact: true }).click();
  await expect(page.getByText('Vista previa creada y guardada en este dispositivo.')).toBeVisible();
  await readPersistence(page, info); await page.close();
  const db = new DatabaseSync(info.outputPath('canonical.sqlite'));
  const cycle = db.prepare("SELECT id FROM cycle WHERE kind = ? ORDER BY rowid LIMIT 1").get(mode === 'final' ? 'hypertrophy' : 'transition')!;
  db.prepare("UPDATE cycle SET status = 'ACTIVE' WHERE id = ?").run(cycle.id!);
  if (mode === 'final') {
    db.prepare("UPDATE training_week SET status = CASE WHEN week_index = 4 THEN 'REVIEW' ELSE 'COMPLETED' END WHERE cycle_id = ?").run(cycle.id!);
    db.prepare("UPDATE session_plan SET status = 'COMPLETED' WHERE training_week_id IN (SELECT id FROM training_week WHERE cycle_id = ?)").run(cycle.id!);
  }
  db.close();
  copyFileSync(info.outputPath('canonical.sqlite'), info.outputPath('fixture.sqlite'));
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
  const before = await readPersistence(app, info);
  if (mode === 'final') {
    await expect(app.getByText('Revisa la semana 4 antes de iniciar otra sesión.', { exact: true })).toBeVisible();
    await app.goto('/plan');
    await expect(app.getByRole('button', { name: 'Semana 4 de Hipertrofia, 3 sesiones, REVISIÓN PENDIENTE', exact: true })).toBeVisible();
    await expect(app.getByRole('button', { name: /sesiones, ACTIVA$/ })).toHaveCount(0);
    await app.getByRole('button', { name: 'Abrir revisión semanal', exact: true }).click();
    await expect(app.getByText('Revisión de semana 4', { exact: true })).toBeVisible();
    await app.getByRole('button', { name: 'Crear propuesta semanal', exact: true }).click();
    await app.getByRole('button', { name: 'Mantener plan semanal', exact: true }).click();
    await expect(app.getByText('Ciclo completado: confirmación pendiente', { exact: true })).toBeVisible();
    await app.reload();
    await expect(app.getByText('Ciclo completado: confirmación pendiente', { exact: true })).toBeVisible();
    await app.getByRole('button', { name: 'Volver a Hoy', exact: true }).click();
    await expect(app.getByText('Ciclo completado: confirmación pendiente', { exact: true })).toBeVisible();
    await expect(app.getByRole('button', { name: 'Revisar preparación para entrenar', exact: true })).toHaveCount(0);
    await app.goto('/plan');
    await expect(app.getByText('Ciclo completado: confirmación pendiente', { exact: true })).toBeVisible();
    await expect(app.getByRole('button', { name: /sesiones, ACTIVA$/ })).toHaveCount(0);
    await expect(app.getByRole('button', { name: 'Semana 4 de Hipertrofia, 3 sesiones, COMPLETADA', exact: true })).toBeVisible();
  } else {
    await expect(app.getByTestId('cycle-progress-band')).toContainText('CICLO DE TRANSICIÓN · SEMANA 1 DE 1');
    await app.goto('/plan');
    await expect(app.getByText('SEMANA 1 DE 1 · Transición obligatoria', { exact: true })).toBeVisible();
    await expect(app.getByRole('button', { name: /sesiones, ACTIVA$/ })).toHaveCount(1);
    await expect(app.getByRole('button', { name: 'Semana 1 de Transición obligatoria, 3 sesiones, ACTIVA', exact: true })).toBeVisible();
    await app.reload();
    await expect(app.getByRole('button', { name: 'Semana 1 de Transición obligatoria, 3 sesiones, ACTIVA', exact: true })).toBeVisible();
  }
  const after = await readPersistence(app, info);
  expect(after.cycles).toEqual(before.cycles);
  expect(after.sessionSnapshots).toEqual(before.sessionSnapshots);
  expect(after.workouts).toEqual(before.workouts);
  expect(after.templates).toEqual(before.templates);
  if (mode === 'deload') expect(after.plannedSessions).toEqual(before.plannedSessions);
  else expect(after.plannedSessions.every(row => row.week_status === 'COMPLETED')).toBe(true);
  await app.screenshot({ path: info.outputPath('state.png'), fullPage: true });
});
