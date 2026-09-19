import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { fieldContrast } from './field-contrast';
import { navigationContrast } from './navigation-contrast';
import { readPersistence } from './persistence';
import { startSyntheticWorkout } from './setup';

async function inspectHeader(page: Page, info: TestInfo, name: string, scale: number, preparation = false) {
  const surface = preparation ? page.getByTestId('readiness-focused-surface') : page;
  const header = surface.getByRole('heading', { level: 1 });
  await expect(header).toHaveCount(1);
  // Magnify text only, leaving the viewport and controls at their compact sizes.
  // Remove the overrides after inspection so each route scales exactly once.
  await page.evaluate(factor => {
    for (const el of document.querySelectorAll<HTMLElement>('*')) {
      if (el.dataset.testid === 'brand-mark-glyph') continue;
      if (!Array.from(el.childNodes).some(n => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())) continue;
      const style = getComputedStyle(el);
      el.dataset.originalInlineStyle = el.getAttribute('style') ?? '';
      el.style.fontSize = `${parseFloat(style.fontSize) * factor}px`;
      el.style.lineHeight = `${parseFloat(style.lineHeight) * factor}px`;
    }
  }, scale);
  await header.scrollIntoViewIfNeeded();
  await header.evaluate(el => {
    for (let parent = el.parentElement; parent; parent = parent.parentElement) parent.scrollTop = 0;
  });
  const report = await header.evaluate(el => {
    const band = el.closest('[data-testid="brand-band-content"]')!.parentElement!;
    const bounds = band.getBoundingClientRect();
    const overflow: string[] = [];
    for (const text of band.querySelectorAll<HTMLElement>('*')) {
      if (!Array.from(text.childNodes).some(n => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())) continue;
      const box = text.getBoundingClientRect();
      const parent = text.parentElement!.getBoundingClientRect();
      if (box.left < parent.left - 1 || box.right > parent.right + 1 || box.top < parent.top - 1 || box.bottom > parent.bottom + 1) overflow.push(`${text.textContent}: box ${JSON.stringify(box)} parent ${JSON.stringify(parent)}`);
      for (const node of text.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE) continue;
        for (const match of node.textContent!.matchAll(/\S+/g)) {
          const range = document.createRange(); range.setStart(node, match.index!); range.setEnd(node, match.index! + match[0].length);
          for (const line of range.getClientRects()) if (line.left < box.left - 1 || line.right > box.right + 1) overflow.push(`${text.textContent}: line ${JSON.stringify(line)} box ${JSON.stringify(box)}`);
        }
      }
    }
    return { left: bounds.left, right: bounds.right, width: innerWidth, overflow };
  });
  await info.attach(`${name}-geometry`, { body: JSON.stringify(report), contentType: 'application/json' });
  await page.screenshot({ path: info.outputPath(`${name}.png`) });
  const inset = preparation ? 16 : 0;
  expect(report.left).toBe(inset); expect(report.right).toBe(report.width - inset);
  expect(report.overflow).toEqual([]);
  await navigationContrast(header.locator('..'), info, `${name}-heading-contrast`);
  await page.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>('[data-original-inline-style]')) {
      el.setAttribute('style', el.dataset.originalInlineStyle!); delete el.dataset.originalInlineStyle;
    }
  });
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`${colorScheme} Athlete components compose across saved settings, workout and navigation`, async ({ page, context }, info) => {
    test.setTimeout(180_000);
    await page.emulateMedia({ colorScheme });
    await page.goto('/settings');
    const field = page.getByLabel('Incremento 1', { exact: true });
    await expect(field).toBeVisible();
    const initial = await readPersistence(page, info);
    await field.fill('0');
    await page.getByRole('button', { name: 'Guardar configuración local', exact: true }).click();
    await expect(page.getByText(/Escribe cada incremento/)).toBeVisible();
    expect(await readPersistence(page, info)).toEqual(initial);
    await field.fill('3,75');
    await fieldContrast(field, info, 'settings-field');
    await page.getByRole('button', { name: 'Guardar configuración local', exact: true }).click();
    await expect(page.getByText('Configuración guardada en este dispositivo.')).toBeVisible();
    for (const scale of [1, 1.4, 2]) await inspectHeader(page, info, `settings-${scale}`, scale);
    await startSyntheticWorkout(page, async () => {
      await inspectHeader(page, info, 'preparation-large', 1.4, true);
      await navigationContrast(page.getByLabel('Dolor de 0 a 2, estable', { exact: true }), info, 'readiness-choice');
    });
    for (const scale of [1, 1.4, 2]) await inspectHeader(page, info, `workout-${scale}`, scale);
    await page.getByLabel('Carga de la serie 1', { exact: true }).fill('0');
    await page.getByLabel('Repeticiones de la serie 1', { exact: true }).fill('8');
    await page.getByLabel('Notas de la serie 1', { exact: true }).fill('Synthetic persistence smoke');
    await page.getByRole('button', { name: 'Completar serie 1', exact: true }).click();
    await expect.poll(async () => (await readPersistence(page, info)).sets).toHaveLength(1);
    const saved = await readPersistence(page, info);
    await page.getByRole('button', { name: /Ver instrucciones y guía/ }).click();
    await expect(page.getByRole('button', { name: 'Cerrar guía del ejercicio', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar guía del ejercicio', exact: true }).click();
    await page.getByRole('button', { name: 'Cerrar entrenamiento', exact: true }).click();
    for (const route of ['/', '/plan', '/history', '/backup']) {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByText(/Cargando/)).toHaveCount(0);
      await inspectHeader(page, info, `${route.slice(1) || 'today'}-large`, 1.4);
    }
    expect(await readPersistence(page, info)).toEqual(saved);
    await page.close();
    const reopened = await context.newPage(); await reopened.emulateMedia({ colorScheme });
    await reopened.goto('/settings');
    await expect(reopened.getByLabel('Incremento 1', { exact: true })).toHaveValue('3.75');
    expect(await readPersistence(reopened, info)).toEqual(saved);
  });
}
