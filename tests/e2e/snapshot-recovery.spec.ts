import { test, expect } from '@playwright/test';
import { startSyntheticWorkout } from './setup';
import { readPersistence } from './persistence';

test('a delayed synchronous SQLite preparation recovers without losing a set edit', async ({ page }, info) => {
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message, transfer) {
      const options = Array.isArray(transfer) ? { transfer } : transfer;
      const state = window as unknown as { delayNextPreparation: boolean };
      if (state.delayNextPreparation && message.isSync && message.type === 'prepare') {
        state.delayNextPreparation = false;
        setTimeout(() => post.call(this, message, options), 250);
        return;
      }
      return post.call(this, message, options);
    };
  });
  await startSyntheticWorkout(page);
  await page.evaluate(() => { (window as unknown as { delayNextPreparation: boolean }).delayNextPreparation = true; });
  await page.getByLabel('Carga de la serie 1', { exact: true }).fill('20');
  await page.getByLabel('Carga de la serie 1', { exact: true }).fill('25');
  await page.getByLabel('Repeticiones de la serie 1', { exact: true }).fill('8');
  await page.getByRole('button', { name: 'Completar serie 1', exact: true }).click();
  await expect(page.getByText('COMPLETADA', { exact: true })).toBeVisible();
  await expect.poll(async () => {
    const persisted = await readPersistence(page, info);
    return JSON.parse(String(persisted.workouts[0]!.actual_snapshot_json)).exercises[0].sets[0];
  }).toMatchObject({ load: '25', reps: '8', disposition: 'COMPLETED' });
  expect(await page.evaluate(() => (window as unknown as { delayNextPreparation: boolean }).delayNextPreparation)).toBe(false);
  await page.reload();
  await expect(page.getByLabel('Carga de la serie 1', { exact: true })).toHaveValue('25');
});
