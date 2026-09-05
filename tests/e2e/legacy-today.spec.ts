import { test, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { readPersistence } from './persistence';

test('Today identifies an unknown persisted exercise without rewriting the plan on reopen', async ({ page, context }, info) => {
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
  db.prepare('UPDATE session_plan SET snapshot_json = ? WHERE id = ?').run(JSON.stringify(snapshot), row.id!);
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


  for (const attempt of [1, 2]) {
    const app = await context.newPage();
    await app.goto('/');
    await expect(app.getByText('Esta sesión contiene referencias desconocidas. Consulta el plan; no se han sustituido ejercicios ni modificado tus registros.', { exact: true })).toBeVisible();
    await expect(app.getByText('Ejercicio no disponible en el catálogo', { exact: true })).toHaveCount(1);
    await expect(app.getByText('missing-legacy', { exact: true })).toHaveCount(0);
    expect(await readPersistence(app, info)).toEqual(before);
    await app.screenshot({ path: info.outputPath(`today-unknown-${attempt}.png`), fullPage: true });
    await app.close();
  }
});
