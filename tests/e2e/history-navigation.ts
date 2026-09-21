import { expect, type Page } from '@playwright/test';

export async function openLatestHistorySession(page: Page) {
  await page.getByRole('tab', { name: 'Historial', exact: true }).click();
  await page.getByRole('button', { name: /^Ver sesión del/ }).first().click();
}

export async function expectProgressVolume(page: Page, value: string) {
  await page.getByRole('tab', { name: 'Resultados', exact: true }).click();
  await expect(page.getByTestId('progress-metric-strip')).toContainText(value);
  await page.getByRole('tab', { name: 'Historial', exact: true }).click();
}
