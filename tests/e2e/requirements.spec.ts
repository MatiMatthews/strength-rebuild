import { test, expect } from '@playwright/test';
import { startSyntheticWorkout } from './setup';
import { readPersistence } from './persistence';

test('requirement fields reject invalid drafts without changing saved settings or an active plan', async ({ page, context }, info) => {
  await startSyntheticWorkout(page);
  await page.goto('/settings');
  const save = page.getByRole('button', { name: 'Guardar configuración local', exact: true });
  await save.click();
  await expect(page.getByText('Configuración guardada en este dispositivo.', { exact: true })).toBeVisible();
  const before = await readPersistence(page, info);
  const cases = [
    { kind: 'EXACT', value: 'barbell-bench-press', choice: 'Press banca' },
    { kind: 'PATTERN', value: 'horizontal-push', choice: 'horizontal-push' },
    { kind: 'CAPABILITY', value: 'power', choice: 'power' },
  ];
  for (const [index, requirement] of cases.entries()) {
    const field = page.getByLabel(`Requisito ${requirement.kind}`, { exact: true });
    for (const invalid of ['missing-catalog-option', '']) {
      await field.fill(invalid);
      await save.click();
      await expect(page.getByRole('alert').filter({ hasText: `Requisito ${index + 1} (` }), 'Invalid requirement must identify its field').toBeVisible();
      await expect(field).toHaveValue(invalid);
      expect(await readPersistence(page, info), 'Rejected drafts must not write any canonical rows').toEqual(before);
    }
    await page.getByLabel(`Elegir ${requirement.choice} para requisito ${index + 1}`, { exact: true }).click();
    await expect(field).toHaveValue(requirement.value);
  }
  await page.getByLabel('Alternar equipo Banco', { exact: true }).click();
  await save.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Requisito 1 (' }), 'Missing equipment must reject the exact requirement').toBeVisible();
  expect(await readPersistence(page, info)).toEqual(before);
  await page.getByLabel('Alternar equipo Banco', { exact: true }).click();
  await page.getByLabel('Restricciones activas', { exact: true }).fill('sin impacto');
  await save.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Requisito 3 (' }), 'Impact restriction must reject the power requirement').toBeVisible();
  expect(await readPersistence(page, info)).toEqual(before);
  await page.getByLabel('Restricciones activas', { exact: true }).fill('lumbar');
  await save.click();
  await expect(page.getByText('Configuración guardada en este dispositivo.', { exact: true })).toBeVisible();
  const accepted = await readPersistence(page, info);
  const settings = JSON.parse(String(accepted.settings.find(row => row.key === 'training-settings')?.value_json));
  expect(settings.requirements).toEqual(cases.map(({ kind, value }) => ({ kind, value })));
  expect(settings.restrictions).toEqual(['lumbar']);
  expect(accepted.cycles).toEqual(before.cycles);
  expect(accepted.templates).toEqual(before.templates);
  expect(accepted.sessionSnapshots).toEqual(before.sessionSnapshots);
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto('/settings');
  for (const requirement of cases) await expect(reopened.getByLabel(`Requisito ${requirement.kind}`, { exact: true })).toHaveValue(requirement.value);
  await expect(reopened.getByLabel('Restricciones activas', { exact: true })).toHaveValue('lumbar');
  expect(await readPersistence(reopened, info)).toEqual(accepted);
});
