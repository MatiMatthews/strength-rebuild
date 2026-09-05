import { test, expect } from '@playwright/test';
import { readPersistence } from './persistence';

test('returning from settings activates the latest reviewed draft, not an older stored plan', async ({ page, context }, info) => {
  await page.goto('/plan');
  const create = page.getByRole('button', { name: 'Crear vista previa del ciclo', exact: true });
  await create.click();
  await expect(page.getByText('Vista previa creada y guardada en este dispositivo.')).toBeVisible();
  const older = await readPersistence(page, info);

  await page.getByLabel('Semanas de hipertrofia', { exact: true }).fill('2');
  await create.click();
  await expect.poll(async () => (await readPersistence(page, info)).templates.length).toBe(2);
  const latest = await readPersistence(page, info);
  const oldIds = new Set(older.cycles.map(cycle => cycle.id));
  const selected = latest.cycles.find(cycle => cycle.kind === 'reentry' && !oldIds.has(cycle.id));
  expect(selected).toBeDefined();

  await page.getByRole('button', { name: 'Abrir configuración del plan', exact: true }).click();
  await expect(page.getByTestId('settings-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Volver a Hoy', exact: true }).click();
  await expect(page.getByTestId('plan-screen')).toBeVisible();
  const activate = page.getByRole('button', { name: 'Activar plan confirmado', exact: true });
  await expect(activate).toBeEnabled();
  expect(await readPersistence(page, info), 'Navigation must not activate or rewrite a plan').toEqual(latest);
  await activate.click();
  await expect(page.getByText('Plan activo', { exact: true })).toBeVisible();
  const active = await readPersistence(page, info);
  expect(active.cycles.filter(cycle => cycle.status === 'ACTIVE').map(cycle => cycle.id)).toEqual([selected!.id]);
  expect(active.templates).toEqual(latest.templates);
  expect(active.sessionSnapshots).toEqual(latest.sessionSnapshots);
  expect(active.workouts).toEqual(latest.workouts);

  await page.close();
  const reopened = await context.newPage();
  await reopened.goto('/plan');
  await expect(reopened.getByText('Plan activo', { exact: true })).toBeVisible();
  expect(await readPersistence(reopened, info)).toEqual(active);
});
