import { test, expect, type Locator } from '@playwright/test';
import { readPersistence } from './persistence';
import { startSyntheticWorkout } from './setup';

async function headingBounds(heading: Locator, size: number) {
  const result = await heading.evaluate(el => {
    const style = getComputedStyle(el), bounds = el.getBoundingClientRect();
    const range = document.createRange(); range.selectNodeContents(el);
    return { size: parseFloat(style.fontSize), family: style.fontFamily, tracking: style.letterSpacing, left: bounds.left, right: bounds.right, width: innerWidth, lines: Array.from(range.getClientRects()).map(r => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom })), top: bounds.top, bottom: bounds.bottom };
  });
  expect(result.size).toBe(size); expect(result.family).toContain('Barlow');
  expect(['normal', '0px']).toContain(result.tracking);
  expect(result.left).toBeGreaterThanOrEqual(0); expect(result.right).toBeLessThanOrEqual(result.width + 1);
  for (const line of result.lines) { expect(line.left).toBeGreaterThanOrEqual(result.left - 1); expect(line.right).toBeLessThanOrEqual(result.right + 1); expect(line.top).toBeGreaterThanOrEqual(result.top - 2); expect(line.bottom).toBeLessThanOrEqual(result.bottom + 2); }
}
for (const colorScheme of ['light', 'dark'] as const) test(`${colorScheme} role headings wrap while shared actions preserve saved training state`, async ({ page, context }, info) => {
  await page.emulateMedia({ colorScheme });
  await page.goto('/'); await headingBounds(page.getByRole('heading', { name: 'HOY', exact: true }), 28);
  const band = page.getByTestId('brand-masthead'); const bounds = await band.boundingBox(); expect(bounds!.x).toBe(0); expect(bounds!.width).toBe(360);
  await page.getByRole('button', { name: 'Abrir ajustes', exact: true }).click();
  await headingBounds(page.getByRole('heading', { name: 'Configuración', exact: true }), 28);
  const before = await readPersistence(page, info); const input = page.getByLabel('Incremento 1', { exact: true }); await input.fill('3,75');
  await page.getByRole('button', { name: 'Guardar configuración local', exact: true }).click(); await expect(page.getByText('Configuración guardada en este dispositivo.')).toBeVisible();
  const saved = await readPersistence(page, info); expect(saved.workouts).toEqual(before.workouts); expect(JSON.parse(String(saved.settings.find(r => r.key === 'training-settings')!.value_json)).increments[0]).toBe(3.75);
  await page.goto('/backup'); const title = page.getByRole('heading', { name: 'RESPALDO Y RECUPERACIÓN', exact: true }); await headingBounds(title, 28);
  await title.evaluate(el => { (el as HTMLElement).style.fontSize = '22px'; }); await expect(headingBounds(title, 28)).rejects.toThrow(); await title.evaluate(el => { (el as HTMLElement).style.fontSize = ''; });
  // Text-only scaling: preserve the compact viewport and increase actual text,
  // instead of zooming the whole document and hiding layout defects.
  await page.evaluate(() => { for (const el of document.querySelectorAll('*')) { if (Array.from(el.childNodes).some(n => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())) { const style = getComputedStyle(el); (el as HTMLElement).style.fontSize = `${parseFloat(style.fontSize) * 1.4}px`; (el as HTMLElement).style.lineHeight = `${parseFloat(style.lineHeight) * 1.4}px`; } } });
  await headingBounds(title, 39.2); await page.screenshot({ path: info.outputPath('large-backup.png') });
  await page.getByRole('button', { name: 'Volver al Plan', exact: true }).click();
  await page.close(); const reopened = await context.newPage(); await reopened.goto('/settings'); await expect(reopened.getByLabel('Incremento 1', { exact: true })).toHaveValue('3.75'); expect(await readPersistence(reopened, info)).toEqual(saved);
});
for (const colorScheme of ['light', 'dark'] as const) test(`${colorScheme} task header keeps close and guide commands reachable`, async ({ page }, info) => {
  await page.emulateMedia({ colorScheme }); await startSyntheticWorkout(page, async () => { await headingBounds(page.getByRole('heading', { name: 'PREPARACIÓN DE HOY', exact: true }), 22); await expect(page.getByRole('button', { name: 'Cerrar Preparación de hoy', exact: true })).toBeVisible(); });
  await headingBounds(page.getByRole('heading', { name: 'ENTRENAMIENTO', exact: true }), 22);
  await expect(page.getByRole('button', { name: 'Cerrar entrenamiento', exact: true })).toBeVisible();
  const before = await readPersistence(page, info); await page.getByRole('button', { name: /Ver instrucciones y guía/ }).click();
  await expect(page.getByRole('button', { name: 'Cerrar guía del ejercicio', exact: true })).toBeVisible(); await page.screenshot({ path: info.outputPath('guide.png') }); await page.getByRole('button', { name: 'Cerrar guía del ejercicio', exact: true }).click();
  expect(await readPersistence(page, info)).toEqual(before);
});
