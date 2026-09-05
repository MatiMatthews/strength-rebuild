import { expect, type Page } from '@playwright/test';

export async function startSyntheticWorkout(page: Page) {
  await page.goto('/plan');
  await expect(page.getByTestId('plan-screen')).toBeVisible();
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  await expect(page.getByText('Todavía no hay ciclos', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Crear vista previa del ciclo', exact: true }).click();
  await expect(page.getByText('Vista previa creada y guardada en este dispositivo.')).toBeVisible();
  await page.getByRole('button', { name: 'Activar plan confirmado', exact: true }).click();
  await expect(page.getByText('Plan activo', { exact: true })).toBeVisible();
  await page.goto('/');
  await page.getByRole('button', { name: 'Revisar preparación para entrenar', exact: true }).click();
  await page.getByLabel('Dolor de 0 a 2, estable', { exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar preparación', exact: true }).click();
  await expect(page.getByTestId('workout-screen')).toBeVisible();
}
