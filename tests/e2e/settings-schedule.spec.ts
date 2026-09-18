import { test, expect } from '@playwright/test';
import { readPersistence } from './persistence';

test('supported schedule and decimal increments save atomically into the next preview and survive reopening', async ({ page, context }, info) => {
  await page.goto('/plan');
  await page.getByRole('button', { name: 'Crear vista previa del ciclo', exact: true }).click();
  await expect(page.getByText('Vista previa creada y guardada en este dispositivo.')).toBeVisible();
  const original = await readPersistence(page, info);
  await page.getByRole('button', { name: 'Abrir configuración del plan', exact: true }).click();
  const save = page.getByRole('button', { name: 'Guardar configuración local', exact: true });
  for (const day of ['Mié', 'Vie']) await page.getByLabel(`Alternar día ${day}`, { exact: true }).click();
  await save.click();
  await expect(page.getByText('Selecciona exactamente tres días distintos de entrenamiento.')).toBeVisible();
  expect(await readPersistence(page, info)).toEqual(original);
  for (const day of ['Mar', 'Jue', 'Sáb']) await page.getByLabel(`Alternar día ${day}`, { exact: true }).click();
  await save.click();
  await expect(page.getByText('Selecciona exactamente tres días distintos de entrenamiento.')).toBeVisible();
  expect(await readPersistence(page, info)).toEqual(original);
  await page.getByLabel('Alternar día Lun', { exact: true }).click();
  for (const value of ['2,', '0', '-1', '2,5,6', 'Infinity']) {
    await page.getByLabel('Incremento 1', { exact: true }).fill(value);
    await save.click();
    await expect(page.getByText(/Escribe cada incremento/)).toBeVisible();
    await expect(page.getByLabel('Incremento 1', { exact: true })).toHaveValue(value);
    expect(await readPersistence(page, info)).toEqual(original);
  }
  // Explicit synthetic reference exercises rounding without depending on personal defaults.
  await page.getByLabel('Conozco mi referencia de Press banca', { exact: true }).click();
  await page.getByLabel('Referencia de Press banca', { exact: true }).fill('60');
  await page.getByLabel('Incremento 1', { exact: true }).fill('7,25');
  await page.getByRole('button', { name: 'Quitar incremento 3', exact: true }).click();
  await page.getByRole('button', { name: 'Quitar incremento 2', exact: true }).click();
  await save.click();
  await expect(page.getByText('Configuración guardada en este dispositivo.')).toBeVisible();
  const saved = await readPersistence(page, info);
  const training = saved.settings.find(row => row.key === 'training-settings');
  expect(JSON.parse(String(training!.value_json))).toMatchObject({ schedule: [2, 4, 6], increments: [7.25], units: 'kg' });
  expect(saved.templates).toEqual(original.templates);
  expect(saved.sessionSnapshots).toEqual(original.sessionSnapshots);
  expect(saved.workouts).toEqual(original.workouts);
  await page.getByRole('button', { name: 'Volver a Hoy', exact: true }).click();
  await page.getByRole('button', { name: 'Crear vista previa del ciclo', exact: true }).click();
  await expect.poll(async () => (await readPersistence(page, info)).templates.length).toBe(2);
  await page.getByRole('button', { name: /Semana 1 de Reentrada/ }).click();
  for (const day of ['Martes', 'Jueves', 'Sábado']) await expect(page.getByText(day, { exact: true })).toBeVisible();
  const preview = await readPersistence(page, info);
  const oldIds = new Set(original.sessionSnapshots.map(row => row.id));
  expect(preview.sessionSnapshots.filter(row => oldIds.has(row.id))).toEqual(original.sessionSnapshots);
  const fresh = preview.sessionSnapshots.filter(row => !oldIds.has(row.id)).map(row => JSON.parse(String(row.snapshot_json)));
  expect(new Set(fresh.map(session => session.day))).toEqual(new Set(['tuesday', 'thursday', 'saturday']));
  const loads = fresh.flatMap(session => session.exercises).filter(exercise => exercise.calculatedLoad !== undefined).map(exercise => exercise.calculatedLoad);
  // The existing strength policy uses 80% of the synthetic 60 kg reference: 48 kg.
  // A 7.25 kg increment rounds that target to 50.75 kg, rather than the default 47.5 kg.
  expect(loads).toContain(50.75);
  expect(loads.every(load => load % 7.25 === 0)).toBe(true);
  await page.close();
  const reopened = await context.newPage(); await reopened.goto('/settings');
  await expect(reopened.getByLabel('Incremento 1', { exact: true })).toHaveValue('7.25');
  expect(await readPersistence(reopened, info)).toEqual(preview);
});
