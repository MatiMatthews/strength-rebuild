import { test, expect } from '@playwright/test';
import { navigationContrast } from './navigation-contrast';
import { readPersistence } from './persistence';

for (const colorScheme of ['light', 'dark'] as const) test(`${colorScheme} actions save once, recover a failed write and reopen with readable feedback`, async ({ page, context }, info) => {
  await page.emulateMedia({ colorScheme });
  // Delay/fail only an asynchronous SQLite prepare at the transport boundary.
  // The successful retry still executes the real service and canonical database.
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function(message, transfer) {
      const state = window as unknown as { actionFault?: 'delay' | 'fail'; actionRelease?: () => void };
      if (state.actionFault && !message.isSync && message.type === 'prepare') {
        const fault = state.actionFault; delete state.actionFault;
        state.actionRelease = () => fault === 'fail'
          ? this.dispatchEvent(new MessageEvent('message', { data: { id: message.id, error: 'Synthetic storage failure' } }))
          : post.call(this, message, Array.isArray(transfer) ? { transfer } : transfer);
        return;
      }
      post.call(this, message, Array.isArray(transfer) ? { transfer } : transfer);
    };
  });
  await page.goto('/settings');
  const save = page.getByRole('button', { name: 'Guardar configuración local', exact: true });
  await expect(page.getByLabel('Incremento 1', { exact: true })).toHaveValue('1.25');
  const before = await readPersistence(page, info);
  await page.getByLabel('Incremento 1', { exact: true }).fill('3,75');
  await navigationContrast(save, info, 'normal-save');
  for (const fault of ['fail', 'delay'] as const) {
    await page.evaluate(fault => { (window as unknown as { actionFault: string }).actionFault = fault; }, fault);
    await save.click();
    await expect(save).toHaveAttribute('aria-busy', 'true');
    await expect(save).toBeDisabled();
    await expect(page.getByText('Guardando…', { exact: true })).toBeVisible();
    await navigationContrast(save, info, `${fault}-busy`);
    await page.emulateMedia({ colorScheme: colorScheme === 'light' ? 'dark' : 'light' });
    await navigationContrast(save, info, `${fault}-busy-theme-change`);
    // Dispatch repeated taps directly so disabled enforcement, not automation's
    // enabled wait, is exercised while the first real operation is pending.
    await save.dispatchEvent('click'); await save.dispatchEvent('click');
    expect(await readPersistence(page, info)).toEqual(before);
    await page.evaluate(() => (window as unknown as { actionRelease: () => void }).actionRelease());
    await expect(save).toBeEnabled();
    if (fault === 'fail') {
      await expect(page.getByText(/Tus cambios siguen aquí/)).toBeVisible();
      await expect(page.getByLabel('Incremento 1', { exact: true })).toHaveValue('3,75');
      expect(await readPersistence(page, info)).toEqual(before);
    }
  }
  await expect(page.getByText('Configuración guardada en este dispositivo.')).toBeVisible();
  const saved = await readPersistence(page, info);
  expect(JSON.parse(String(saved.settings.find(row => row.key === 'training-settings')!.value_json)).increments).toEqual([3.75, 2.5, 5]);
  expect(saved.settings.filter(row => row.key === 'training-settings')).toHaveLength(1);
  expect(saved.workouts).toEqual(before.workouts); expect(saved.sessionSnapshots).toEqual(before.sessionSnapshots);
  await navigationContrast(save, info, 'saved-retry');
  const previous = await save.evaluate(element => { const previous = (element as HTMLElement).style.opacity; (element as HTMLElement).style.opacity = '0.2'; return previous; });
  await expect(navigationContrast(save, info, 'opacity-mutation')).rejects.toThrow();
  await save.evaluate((element, previous) => { (element as HTMLElement).style.opacity = previous; }, previous);
  await page.locator('body').evaluate(element => { element.style.zoom = '1.4'; });
  await save.scrollIntoViewIfNeeded(); await navigationContrast(save, info, 'large-save');
  await page.screenshot({ path: info.outputPath('saved-action.png') });
  await page.close(); const reopened = await context.newPage(); await reopened.emulateMedia({ colorScheme });
  await reopened.goto('/settings');
  await expect(reopened.getByLabel('Incremento 1', { exact: true })).toHaveValue('3.75');
  expect(await readPersistence(reopened, info)).toEqual(saved);
});

for (const colorScheme of ['light', 'dark'] as const) test(`${colorScheme} training action inventory remains readable through pressed and safety-disabled states`, async ({ page }, info) => {
  await page.emulateMedia({ colorScheme });
  const { startSyntheticWorkout } = await import('./setup');
  await startSyntheticWorkout(page);
  for (const button of await page.getByRole('button').all()) {
    if (await button.isVisible()) await navigationContrast(button, info, `workout-${await button.getAttribute('aria-label')}`);
  }
  const preset = page.getByRole('button', { name: 'Descanso 60 segundos', exact: true });
  await preset.scrollIntoViewIfNeeded(); await preset.hover(); await page.mouse.down();
  await navigationContrast(preset, info, 'pressed-rest'); await page.mouse.up();
  for (let index = 0; index < 5; index++) await page.getByRole('button', { name: 'Aumentar molestia de la serie 1', exact: true }).click();
  const complete = page.getByRole('button', { name: 'Completar serie 1', exact: true });
  await expect(complete).toBeDisabled(); await navigationContrast(complete, info, 'safety-disabled');
  await expect.poll(async () => JSON.parse(String((await readPersistence(page, info)).workouts[0]!.actual_snapshot_json)).exercises[0].sets[0].pain).toBe(5);
  const before = await readPersistence(page, info); await complete.dispatchEvent('click');
  expect(await readPersistence(page, info)).toEqual(before);
  expect(JSON.parse(String(before.workouts[0]!.actual_snapshot_json)).exercises[0].sets[0].completed).toBe(false);
});

for (const colorScheme of ['light', 'dark'] as const) test(`${colorScheme} backup actions preserve a real encrypted roundtrip under repeated confirmation`, async ({ page }, info) => {
  await page.emulateMedia({ colorScheme });
  await page.goto('/settings');
  await page.getByLabel('Incremento 1', { exact: true }).fill('3.75');
  await page.getByRole('button', { name: 'Guardar configuración local', exact: true }).click();
  await expect(page.getByText('Configuración guardada en este dispositivo.')).toBeVisible();
  const before = await readPersistence(page, info);
  await page.goto('/backup');
  await page.getByLabel('Contraseña portátil del respaldo', { exact: true }).fill('synthetic-test-password');
  await page.getByRole('button', { name: 'Exportar respaldo cifrado', exact: true }).click();
  await expect(page.getByText('Respaldo cifrado y autenticado listo para guardar.')).toBeVisible();
  await page.getByRole('button', { name: 'Revisar respaldo antes de restaurar', exact: true }).click();
  const restore = page.getByRole('button', { name: 'Confirmar restauración del respaldo', exact: true });
  await expect(restore).toBeVisible();
  await navigationContrast(restore, info, 'backup-confirm');
  await restore.evaluate(element => { (element as HTMLElement).click(); (element as HTMLElement).click(); });
  await expect(page.getByText('Respaldo restaurado de forma atómica.')).toBeVisible();
  expect(await readPersistence(page, info)).toEqual(before);
  await page.reload(); expect(await readPersistence(page, info)).toEqual(before);
});
