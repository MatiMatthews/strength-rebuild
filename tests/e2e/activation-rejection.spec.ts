import { test, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { readPersistence } from './persistence';

for (const location of ['cycle', 'session'] as const) {
  test(`activation rejects an unknown ${location} exercise without persistence changes`, async ({ page, context }, info) => {
    await page.goto('/plan');
    await page.getByRole('button', { name: 'Crear vista previa del ciclo', exact: true }).click();
    await expect(page.getByText('Vista previa creada y guardada en este dispositivo.')).toBeVisible();
    await expect(page.getByText('Hay ejercicios fuera del catálogo en tu plan guardado.', { exact: true })).toHaveCount(0);
    await readPersistence(page, info);
    await page.close();

    // Only this test's disposable browser context is changed. Close the app's
    // SQLite worker first, then prepare a damaged persisted preview independently.
    const filename = info.outputPath('canonical.sqlite');
    const db = new DatabaseSync(filename);
    if (location === 'cycle') {
      const row = db.prepare('SELECT id, snapshot_json FROM cycle ORDER BY rowid LIMIT 1').get()!;
      const snapshot = JSON.parse(String(row.snapshot_json));
      snapshot.weeks[0].sessions[0].blocks[0].exercises[0].exerciseId = 'invented-exercise';
      db.prepare('UPDATE cycle SET snapshot_json = ? WHERE id = ?').run(JSON.stringify(snapshot), row.id!);
    } else {
      const row = db.prepare('SELECT id, snapshot_json FROM session_plan ORDER BY rowid LIMIT 1').get()!;
      const snapshot = JSON.parse(String(row.snapshot_json));
      snapshot.exercises[0].exerciseId = 'invented-exercise';
      db.prepare('UPDATE session_plan SET snapshot_json = ? WHERE id = ?').run(JSON.stringify(snapshot), row.id!);
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
    const before = await readPersistence(fixture, info);
    await fixture.close();

    const app = await context.newPage();
    await app.goto('/plan');
    if (location === 'session') {
      await expect(app.getByText('Hay ejercicios fuera del catálogo en tu plan guardado.', { exact: true })).toBeVisible();
      await expect(app.getByText('Sesiones sin iniciar que necesitan revisión antes de entrenar: 1.', { exact: true })).toBeVisible();
    }
    await app.getByRole('button', { name: 'Activar plan confirmado', exact: true }).click();
    await expect(app.getByText('El plan contiene un ejercicio fuera del catálogo. Revisa el plan antes de activarlo.', { exact: true }), 'Invalid persisted exercises must block activation').toBeVisible();
    await app.screenshot({ path: info.outputPath('activation-rejected.png'), fullPage: true });
    expect(await readPersistence(app, info), 'Rejected activation must preserve all canonical rows').toEqual(before);
    await app.close();
    const reopened = await context.newPage();
    await reopened.goto('/plan');
    await expect(reopened.getByRole('button', { name: 'Activar plan confirmado', exact: true })).toBeVisible();
    if (location === 'session') await expect(reopened.getByText('Sesiones sin iniciar que necesitan revisión antes de entrenar: 1.', { exact: true })).toBeVisible();
    expect(await readPersistence(reopened, info)).toEqual(before);
  });
}
