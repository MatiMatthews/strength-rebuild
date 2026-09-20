import { test, expect } from '@playwright/test';
import { startSyntheticWorkout, openBenchPress } from './setup';
import { readPersistence } from './persistence';

for (const fault of ['delayed preparation', 'lost write acknowledgement'] as const) test(`SQLite ${fault} recovers without losing a set edit`, async ({ page }, info) => {
  await page.addInitScript(fault => {
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message, transfer) {
      const options = Array.isArray(transfer) ? { transfer } : transfer;
      const state = window as unknown as { delayNextPreparation: boolean };
      if (state.delayNextPreparation && message.isSync && message.type === (fault === 'delayed preparation' ? 'prepare' : 'run')) {
        state.delayNextPreparation = false;
        if (fault === 'delayed preparation') setTimeout(() => post.call(this, message, options), 250);
        // Execute the real write but lose its synchronous acknowledgement.
        // The next FIFO worker read can verify whether it committed.
        else post.call(this, { ...message, lockBuffer: new SharedArrayBuffer(4) }, options);
        return;
      }
      return post.call(this, message, options);
    };
  }, fault);
  await startSyntheticWorkout(page);
  await openBenchPress(page);
  await page.evaluate(() => { (window as unknown as { delayNextPreparation: boolean }).delayNextPreparation = true; });
  await page.getByLabel('Carga de la serie 1', { exact: true }).fill('20');
  await page.getByLabel('Carga de la serie 1', { exact: true }).fill('25');
  await page.getByLabel('Repeticiones de la serie 1', { exact: true }).fill('8');
  await page.getByRole('button', { name: 'Completar serie 1', exact: true }).click();
  await expect(page.getByText('COMPLETADA', { exact: true })).toBeVisible();
  await expect.poll(async () => {
    const persisted = await readPersistence(page, info);
    return JSON.parse(String(persisted.workouts[0]!.actual_snapshot_json)).exercises.find((exercise: { exerciseId: string }) => exercise.exerciseId === 'barbell-bench-press').sets[0];
  }).toMatchObject({ load: '25', reps: '8', disposition: 'COMPLETED' });
  expect(await page.evaluate(() => (window as unknown as { delayNextPreparation: boolean }).delayNextPreparation)).toBe(false);
  await page.reload();
  await expect(page.getByLabel('Carga de la serie 1', { exact: true })).toHaveValue('25');
});
