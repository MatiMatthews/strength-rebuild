import { test, expect } from '@playwright/test';
import { readPersistence } from './persistence';

test('cancelled activation press cannot activate a preview on Today or reopen', async ({ page, context }, info) => {
  await page.goto('/plan');
  await page.getByRole('button', { name: 'Crear vista previa del ciclo', exact: true }).click();
  await expect(page.getByText('Vista previa creada y guardada en este dispositivo.')).toBeVisible();
  const before = await readPersistence(page, info);
  const activate = page.getByRole('button', { name: 'Activar plan confirmado', exact: true });
  await activate.scrollIntoViewIfNeeded();
  await activate.hover();
  await page.mouse.down();
  await page.mouse.move(1, 1);
  await page.mouse.up();
  await page.goto('/');
  await expect(page.getByTestId('brand-masthead')).toBeVisible();
  expect(await readPersistence(page, info), 'A cancelled press is not confirmation').toEqual(before);
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto('/plan');
  await expect(reopened.getByRole('button', { name: 'Activar plan confirmado', exact: true })).toBeVisible();
  expect(await readPersistence(reopened, info)).toEqual(before);
  await reopened.getByRole('button', { name: 'Activar plan confirmado', exact: true }).click();
  await expect(reopened.getByText('Plan activo', { exact: true })).toBeVisible();
  expect((await readPersistence(reopened, info)).cycles.filter(cycle => cycle.status === 'ACTIVE')).toHaveLength(1);
});
