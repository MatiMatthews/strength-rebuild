import { test, expect, type Locator } from '@playwright/test';
import { inspectContent } from './content-contrast';
import { startSyntheticWorkout } from './setup';
import { readPersistence } from './persistence';

async function readableText(locator: Locator) {
  const pair = await locator.evaluate(element => {
    const color = getComputedStyle(element).color;
    let ancestor: Element | null = element;
    let background = '';
    while (ancestor) {
      background = getComputedStyle(ancestor).backgroundColor;
      if (background !== 'rgba(0, 0, 0, 0)' && background !== 'transparent') break;
      ancestor = ancestor.parentElement;
    }
    const luminance = (value: string) => {
      const rgb = value.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(v => v / 255)
        .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
    };
    const a = luminance(color), b = luminance(background);
    return { color, background, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
  });
  expect(pair.ratio, JSON.stringify(pair)).toBeGreaterThanOrEqual(4.5);
}

for (const colorScheme of ['light', 'dark'] as const) test(`${colorScheme} notices remain readable and theme switching preserves saved preferences`, async ({ page, context }, info) => {
  await page.emulateMedia({ colorScheme });
  await page.goto('/settings');
  const field = page.getByLabel('Incremento 1', { exact: true });
  await expect(field).toBeVisible();
  const original = await readPersistence(page, info);
  await field.fill('0');
  await page.getByRole('button', { name: 'Guardar configuración local', exact: true }).click();
  await readableText(page.getByText(/Escribe cada incremento/));
  expect(await readPersistence(page, info)).toEqual(original);
  await field.fill('7,25');
  await field.focus();
  await page.emulateMedia({ colorScheme: colorScheme === 'dark' ? 'light' : 'dark' });
  await expect(field).toBeFocused();
  await expect(field).toHaveValue('7,25');
  await page.emulateMedia({ colorScheme });
  await page.getByRole('button', { name: 'Guardar configuración local', exact: true }).click();
  const message = page.getByText('Configuración guardada en este dispositivo.');
  await expect(message).toBeVisible();
  await readableText(message);
  await inspectContent(page, info, `${colorScheme}-settings`);
  await page.locator('body').evaluate(element => { element.style.zoom = '1.4'; });
  await inspectContent(page, info, `${colorScheme}-settings-magnified`);
  await page.locator('body').evaluate(element => { element.style.zoom = ''; });
  const saved = await readPersistence(page, info);
  expect(JSON.parse(String(saved.settings.find(row => row.key === 'training-settings')!.value_json)).increments).toContain(7.25);
  expect(saved.workouts).toEqual(original.workouts);
  await page.screenshot({ path: info.outputPath('settings.png'), fullPage: true });
  await page.close();
  const reopened = await context.newPage();
  await reopened.emulateMedia({ colorScheme });
  await reopened.goto('/settings');
  await expect(reopened.getByLabel('Incremento 1', { exact: true })).toHaveValue('7.25');
  expect(await readPersistence(reopened, info)).toEqual(saved);
});

for (const colorScheme of ['light', 'dark'] as const) test(`${colorScheme} static content across the workout and review routes`, async ({ page }, info) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ colorScheme });
  await startSyntheticWorkout(page);
  await inspectContent(page, info, `${colorScheme}-workout`);
  for (let exercise = 0; exercise < 40; exercise++) {
    const count = await page.getByTestId('set-entry-row').count();
    expect(count).toBeGreaterThan(0);
    for (let set = 1; set <= count; set++) {
      await page.getByLabel(`Carga de la serie ${set}`, { exact: true }).fill('0');
      await page.getByLabel(`Repeticiones de la serie ${set}`, { exact: true }).fill('8');
      await page.getByRole('button', { name: `Completar serie ${set}`, exact: true }).click();
    }
    const next = page.getByRole('button', { name: 'Siguiente ejercicio', exact: true });
    if (await next.isDisabled()) break;
    await next.click();
  }
  await page.getByRole('button', { name: 'Revisar y terminar entrenamiento', exact: true }).click();
  await expect(page.getByTestId('finish-review')).toBeVisible();
  await inspectContent(page, info, `${colorScheme}-finish-review`);
  await page.getByRole('button', { name: 'Confirmar fin de entrenamiento', exact: true }).click();
  await expect(page.getByTestId('finish-review')).not.toBeVisible();
  for (const route of ['/', '/plan', '/history']) {
    await page.goto(route);
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByText(/Cargando/)).toHaveCount(0);
    await inspectContent(page, info, `${colorScheme}-${route.slice(1) || 'today'}`);
  }
  const saved = await readPersistence(page, info);
  expect(saved.workouts[0]?.status).toBe('COMPLETED');
  await page.goto('/');
  await page.getByRole('button', { name: 'Revisar preparación para entrenar', exact: true }).click();
  await page.getByLabel('Dolor de 3 a 4 o técnica alterada', { exact: true }).click();
  await expect(page.getByText('Preparación adaptada', { exact: true })).toBeVisible();
  await inspectContent(page, info, `${colorScheme}-readiness-caution`);
  await page.getByLabel('Dolor sobre 4, creciente o señal de alerta', { exact: true }).click();
  await expect(page.getByText('Preparación detenida', { exact: true })).toBeVisible();
  await inspectContent(page, info, `${colorScheme}-readiness-danger`);
  await expect(page.getByRole('button', { name: 'Confirmar preparación', exact: true })).toHaveCount(0);
});
