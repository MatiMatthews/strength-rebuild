import { test, expect, type Page } from '@playwright/test';
import { startSyntheticWorkout } from './setup';
import { readPersistence } from './persistence';

async function resume(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Continuar entrenamiento', exact: true }).click();
  if (await page.getByLabel('Dolor de 0 a 2, estable', { exact: true }).isVisible()) {
    await page.getByLabel('Dolor de 0 a 2, estable', { exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar preparación', exact: true }).click();
  }
  await expect(page.getByTestId('workout-screen')).toBeVisible();
}

test('omission drafts preserve data until confirmation and survive reopen exactly', async ({ page, context }, info) => {
  await startSyntheticWorkout(page);
  await page.getByLabel('Carga de la serie 1', { exact: true }).fill('12.5');
  await page.getByLabel('Repeticiones de la serie 1', { exact: true }).fill('8');
  await page.getByLabel('Notas de la serie 1', { exact: true }).fill('Omission preservation');
  const snapshot = async (p = page) => (await readPersistence(p, info)).workouts;
  await expect.poll(async () => JSON.parse(String((await snapshot())[0]?.actual_snapshot_json)).exercises[0].sets[0].notes).toBe('Omission preservation');
  const before = await snapshot();
  await page.getByRole('button', { name: 'Omitir serie 1', exact: true }).click();
  await page.getByLabel('Motivo para omitir la serie 1', { exact: true }).fill('Draft only');
  // Wait past the production debounce: opening/editing must not schedule a mutation.
  await page.waitForTimeout(500);
  expect(await snapshot()).toEqual(before);
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(await snapshot()).toEqual(before);
  await page.getByRole('button', { name: 'Omitir serie 1', exact: true }).click();
  await page.getByLabel('Motivo para omitir la serie 1', { exact: true }).fill('Abandoned');
  await page.goto('/plan');
  await resume(page);
  expect(await snapshot()).toEqual(before);
  await expect(page.getByLabel('Motivo para omitir la serie 1', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Omitir serie 1', exact: true }).click();
  await page.getByLabel('Motivo para omitir la serie 1', { exact: true }).fill('   ');
  await page.getByRole('button', { name: 'Confirmar omisión de la serie 1', exact: true }).click();
  await expect(page.getByText('Escribe un motivo para omitir la serie.')).toBeVisible();
  expect(await snapshot()).toEqual(before);
  await page.getByLabel('Motivo para omitir la serie 1', { exact: true }).fill('Equipo no disponible');
  await page.getByRole('button', { name: 'Confirmar omisión de la serie 1', exact: true }).evaluate((button: HTMLElement) => { button.click(); button.click(); });
  await expect(page.getByText('OMITIDA', { exact: true })).toHaveCount(1);
  await expect.poll(async () => JSON.parse(String((await snapshot())[0]?.actual_snapshot_json)).exercises[0].sets[0].skipReason).toBe('Equipo no disponible');
  const confirmed = await snapshot();
  const originalDraft = JSON.parse(String(before[0]?.actual_snapshot_json));
  const confirmedDraft = JSON.parse(String(confirmed[0]?.actual_snapshot_json));
  originalDraft.exercises[0].sets[0] = { ...originalDraft.exercises[0].sets[0], completed: false, skipped: true, disposition: 'SKIPPED', skipReason: 'Equipo no disponible' };
  originalDraft.revision += 1;
  expect(confirmedDraft).toEqual(originalDraft);
  await page.getByRole('button', { name: 'Omitir serie 1', exact: true }).click();
  await expect(page.getByLabel('Motivo para omitir la serie 1', { exact: true })).toHaveValue('Equipo no disponible');
  await page.getByLabel('Motivo para omitir la serie 1', { exact: true }).fill('Do not save');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(await snapshot()).toEqual(confirmed);
  await page.close();
  const reopened = await context.newPage();
  await resume(reopened);
  expect(await snapshot(reopened)).toEqual(confirmed);
  await expect(reopened.getByText('OMITIDA', { exact: true })).toHaveCount(1);
  await reopened.getByRole('button', { name: 'Omitir serie 1', exact: true }).click();
  await reopened.getByLabel('Motivo para omitir la serie 1', { exact: true }).fill('Motivo corregido');
  await reopened.getByRole('button', { name: 'Confirmar omisión de la serie 1', exact: true }).click();
  await expect.poll(async () => JSON.parse(String((await snapshot(reopened))[0]?.actual_snapshot_json)).exercises[0].sets[0].skipReason).toBe('Motivo corregido');
  const edited = JSON.parse(String((await snapshot(reopened))[0]?.actual_snapshot_json));
  confirmedDraft.exercises[0].sets[0].skipReason = 'Motivo corregido';
  confirmedDraft.revision += 1;
  expect(edited).toEqual(confirmedDraft);
  await info.attach('omission-persistence', { body: JSON.stringify({ before, confirmed, reopened: await snapshot(reopened) }, null, 2), contentType: 'application/json' });
});
