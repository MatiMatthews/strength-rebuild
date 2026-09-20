import { test, expect, type Locator, type TestInfo } from '@playwright/test';
import { navigationContrast, progressContrast } from './navigation-contrast';
import { startSyntheticWorkout, fillSetQuantity, openSetNotes } from './setup';
import { readPersistence } from './persistence';

async function boundary(locator: Locator, edge: 'Top' | 'Bottom', info: TestInfo) {
  const pair = await locator.evaluate((element, side) => {
    const style = getComputedStyle(element);
    let parent: Element | null = element;
    let background = '';
    while (parent) {
      background = getComputedStyle(parent).backgroundColor;
      if (background !== 'rgba(0, 0, 0, 0)') break;
      parent = parent.parentElement;
    }
    const foreground = style.getPropertyValue(`border-${side.toLowerCase()}-color`);
    const luminance = (color: string) => {
      const rgb = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
      return rgb[0]! * .2126 + rgb[1]! * .7152 + rgb[2]! * .0722;
    };
    const a = luminance(foreground), b = luminance(background);
    return { foreground, background, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
  }, edge);
  await info.attach('navigation-boundary', { body: JSON.stringify(pair), contentType: 'application/json' });
  expect(pair.ratio, JSON.stringify(pair)).toBeGreaterThanOrEqual(3);
}

for (const colorScheme of ['light', 'dark'] as const) test(`${colorScheme} navigation preserves the recorded workout and readable boundaries`, async ({ page, context }, info) => {
  await page.emulateMedia({ colorScheme });
  await startSyntheticWorkout(page);
  await boundary(page.getByTestId('workout-exercise-header'), 'Bottom', info);
  if (colorScheme === 'dark') {
    const header = page.getByTestId('workout-exercise-header');
    const original = await header.evaluate(element => {
      const previous = (element as HTMLElement).style.borderBottomColor;
      (element as HTMLElement).style.borderBottomColor = '#090B0C';
      return previous;
    });
    await expect(boundary(header, 'Bottom', info)).rejects.toThrow();
    await header.evaluate((element, previous) => { (element as HTMLElement).style.borderBottomColor = previous; }, original);
    await boundary(header, 'Bottom', info);
  }
  await boundary(page.getByTestId('workout-command-bar'), 'Top', info);
  await navigationContrast(page.getByRole('button', { name: 'Ejercicio anterior', exact: true }), info, 'disabled-previous');
  await fillSetQuantity(page, 1);
  await (await openSetNotes(page, 1)).fill('Synthetic persistence smoke');
  await page.getByRole('button', { name: 'Completar serie 1', exact: true }).click();
  await expect.poll(async () => (await readPersistence(page, info)).sets).toEqual([{ load: '', reps: '', notes: 'Synthetic persistence smoke', disposition: 'COMPLETED' }]);
  let saved = await readPersistence(page, info);
  await progressContrast(page.getByTestId('workout-sequence-rail'), info, 'exercise-progress');
  await expect(page.getByTestId('workout-sequence-rail')).toHaveAttribute('aria-valuemax', String(JSON.parse(String(saved.workouts[0]!.actual_snapshot_json)).exercises.length));
  await page.getByRole('button', { name: /Ver instrucciones y guía del ejercicio/ }).click();
  await expect(page.getByText('GUÍA LOCAL · SIN RED')).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar guía del ejercicio', exact: true }).click();
  await expect(page.getByText('GUÍA LOCAL · SIN RED')).toHaveCount(0);
  expect(await readPersistence(page, info)).toEqual(saved);
  await navigationContrast(page.getByRole('button', { name: 'Cerrar entrenamiento', exact: true }), info, 'close-on-signal');
  const next = page.getByRole('button', { name: 'Siguiente ejercicio', exact: true });
  await next.scrollIntoViewIfNeeded();
  await next.hover();
  await page.mouse.down();
  await navigationContrast(next, info, 'pressed-next');
  await page.mouse.up();
  await expect(page.getByTestId('workout-sequence-rail')).toHaveAttribute('aria-valuenow', '2');
  await expect.poll(async () => JSON.parse(String((await readPersistence(page, info)).workouts[0]!.actual_snapshot_json)).activeExerciseIndex).toBe(1);
  saved = await readPersistence(page, info);
  await page.getByRole('button', { name: 'Cerrar entrenamiento', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Plan', exact: true })).toBeVisible();
  await boundary(page.getByRole('tablist').locator('..'), 'Top', info);
  for (const name of ['Plan', 'Progreso', 'Hoy', 'Plan']) {
    await page.getByRole('tab', { name, exact: true }).click();
    await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true');
    await navigationContrast(page.getByRole('tablist'), info, `tabs-${name}`);
  }
  await page.emulateMedia({ colorScheme: colorScheme === 'dark' ? 'light' : 'dark' });
  await navigationContrast(page.getByRole('tablist'), info, 'tabs-theme-change');
  expect(await readPersistence(page, info)).toEqual(saved);
  await page.locator('body').evaluate(element => { element.style.zoom = '1.4'; });
  await navigationContrast(page.getByRole('tablist'), info, 'magnified-tabs');
  for (const tab of await page.getByRole('tab').all()) {
    const bounds = await tab.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(361);
  }
  await page.screenshot({ path: info.outputPath('navigation.png'), fullPage: true });
  await page.close();
  const reopened = await context.newPage();
  await reopened.emulateMedia({ colorScheme });
  await reopened.goto('/');
  await reopened.getByRole('button', { name: 'Continuar entrenamiento', exact: true }).click();
  if (await reopened.getByLabel('Dolor de 0 a 2, estable', { exact: true }).isVisible()) {
    await reopened.getByLabel('Dolor de 0 a 2, estable', { exact: true }).click();
    await reopened.getByRole('button', { name: 'Confirmar preparación', exact: true }).click();
  }
  await expect(reopened.getByTestId('workout-sequence-rail')).toHaveAttribute('aria-valuenow', '2');
  const after = await readPersistence(reopened, info);
  expect(after.workouts).toEqual(saved.workouts);
  expect(after.sessionSnapshots).toEqual(saved.sessionSnapshots);
  expect(after.sets).toEqual(saved.sets);
});

test('a directly opened unavailable workout has a working exit without changing saved data', async ({ page }, info) => {
  await page.goto('/workout');
  await expect(page.getByText('No se pudo abrir el entrenamiento', { exact: true })).toBeVisible();
  const before = await readPersistence(page, info);
  await page.getByRole('button', { name: 'Volver', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Hoy', exact: true })).toBeVisible();
  expect(await readPersistence(page, info)).toEqual(before);
});
